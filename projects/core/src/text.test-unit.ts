// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath, RepositoryPathException } from '@moldea.ai/repository';

import { createCore } from './core.js';
import { CoreOperationException } from './exceptions.js';

const path = parseRepositoryPath('/moldea/project.md');
const encoder = new TextEncoder();

describe('Core text normalization', () => {
  test.each([
    ['string', '\ufeffline one\r\nline two\rline three', 'line one\nline two\nline three'],
    [
      'bytes',
      encoder.encode('\ufeffline one\r\nline two\rline three'),
      'line one\nline two\nline three',
    ],
    ['empty', '', ''],
    ['one leading BOM only', '\ufeff\ufeffvalue', '\ufeffvalue'],
  ])('normalizes %s input deterministically', (_name, content, expected) => {
    const result = createCore().normalizeText({ content, path });

    expect(result).toStrictEqual({
      diagnostics: [],
      text: {
        scalarLength: [...expected].length,
        utf8ByteLength: encoder.encode(expected).byteLength,
        value: expected,
      },
      valid: true,
    });
  });

  test('counts Unicode scalars rather than UTF-16 code units and preserves normalization form', () => {
    const decomposed = 'cafe\u0301 😀\n';
    const result = createCore().normalizeText({ content: decomposed, path });

    expect(result.text).toStrictEqual({
      scalarLength: 8,
      utf8ByteLength: 12,
      value: decomposed,
    });
    expect(result.text?.value).not.toBe(decomposed.normalize('NFC'));
  });

  test.each([
    ['overlong sequence', new Uint8Array([0xc0, 0xaf])],
    ['incomplete sequence', new Uint8Array([0xf0, 0x9f, 0x98])],
    ['encoded surrogate', new Uint8Array([0xed, 0xa0, 0x80])],
  ])('returns one structural diagnostic for invalid UTF-8: %s', (_name, content) => {
    const result = createCore().normalizeText({ content, path });

    expect(result).toMatchObject({
      diagnostics: [
        {
          code: 'MOLDEA_TEXT_INVALID_UTF8',
          details: {},
          entity: null,
          path,
          pointer: null,
          range: null,
          source: 'core',
        },
      ],
      text: null,
      valid: false,
    });
    expect(Object.getPrototypeOf(result.diagnostics[0]?.details)).toBeNull();
  });

  test.each(['\ud800', '\udc00', 'value\ud800x'])(
    'returns a structural diagnostic for invalid Unicode string %o',
    (content) => {
      const result = createCore().normalizeText({ content, path });

      expect(result).toMatchObject({
        diagnostics: [{ code: 'MOLDEA_TEXT_INVALID_UNICODE', path }],
        text: null,
        valid: false,
      });
    },
  );

  test('reports every normalized NUL position using scalar-based ranges', () => {
    const result = createCore().normalizeText({ content: 'a\0\r\n😀\0', path });

    expect(result).toMatchObject({
      diagnostics: [
        {
          code: 'MOLDEA_TEXT_NUL_FORBIDDEN',
          range: {
            end: { column: 3, line: 1, offset: 2 },
            start: { column: 2, line: 1, offset: 1 },
          },
        },
        {
          code: 'MOLDEA_TEXT_NUL_FORBIDDEN',
          range: {
            end: { column: 3, line: 2, offset: 5 },
            start: { column: 2, line: 2, offset: 4 },
          },
        },
      ],
      text: null,
      valid: false,
    });
  });

  test('recursively freezes Core-owned normalization output', () => {
    const valid = createCore().normalizeText({ content: 'value', path });
    const invalid = createCore().normalizeText({ content: '\0', path });

    expect(Object.isFrozen(valid)).toBe(true);
    expect(Object.isFrozen(valid.text)).toBe(true);
    expect(Object.isFrozen(valid.diagnostics)).toBe(true);
    expect(Object.isFrozen(invalid)).toBe(true);
    expect(Object.isFrozen(invalid.diagnostics)).toBe(true);
    expect(Object.isFrozen(invalid.diagnostics[0])).toBe(true);
    expect(Object.isFrozen(invalid.diagnostics[0]?.details)).toBe(true);
    expect(Object.isFrozen(invalid.diagnostics[0]?.range)).toBe(true);
  });

  test('enforces maxFileBytes on source content before normalization', () => {
    const core = createCore({ limits: { maxFileBytes: 1 } });

    expect(() => core.normalizeText({ content: '\r\n', path })).toThrowError(
      expect.objectContaining({
        code: 'RESOURCE_LIMIT_EXCEEDED',
        limit: 'maxFileBytes',
        operation: 'normalize-text',
        retryable: false,
      }),
    );
    expect(() => core.normalizeText({ content: new Uint8Array([13, 10]), path })).toThrowError(
      CoreOperationException,
    );
  });

  test('measures scalar string bytes without using UTF-16 code-unit length', () => {
    const fourByteCore = createCore({ limits: { maxFileBytes: 4 } });
    const threeByteCore = createCore({ limits: { maxFileBytes: 3 } });

    expect(fourByteCore.normalizeText({ content: '😀', path })).toMatchObject({
      text: { scalarLength: 1, utf8ByteLength: 4, value: '😀' },
      valid: true,
    });
    expect(() => threeByteCore.normalizeText({ content: '😀', path })).toThrowError(
      expect.objectContaining({
        code: 'RESOURCE_LIMIT_EXCEEDED',
        limit: 'maxFileBytes',
      }),
    );
  });

  test('stops validating string content after its file byte budget is exceeded', () => {
    const core = createCore({ limits: { maxFileBytes: 1 } });

    expect(() => core.normalizeText({ content: 'ab\ud800', path })).toThrowError(
      expect.objectContaining({
        code: 'RESOURCE_LIMIT_EXCEEDED',
        limit: 'maxFileBytes',
      }),
    );
  });

  test('rejects diagnostic overflow rather than truncating diagnostics', () => {
    const core = createCore({ limits: { maxDiagnostics: 1 } });

    expect(() => core.normalizeText({ content: '\0\0', path })).toThrowError(
      expect.objectContaining({
        code: 'RESOURCE_LIMIT_EXCEEDED',
        limit: 'maxDiagnostics',
      }),
    );
  });

  test.each([
    ['path traversal', '/forged/../path'],
    ['an unpaired surrogate', '/\ud800'],
  ])('rejects forged repository paths containing %s before inspecting content', (_name, path) => {
    const core = createCore();

    expect(() => core.normalizeText({ content: 'safe', path: path as never })).toThrowError(
      RepositoryPathException,
    );
  });
});

describe('Core content digests', () => {
  test.each([
    ['empty', '', 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'abc', 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'normalized newline',
      '\ufeffabc\r\n',
      'sha256:edeaaff3f1774ad2888673770c6d64097e391bc362d7d6fb34982ddf0efd18cb',
    ],
  ])('calculates the normalized SHA-256 golden value for %s', async (_name, content, digest) => {
    const result = await createCore().calculateContentDigest({ content, path });

    expect(result).toStrictEqual({
      diagnostics: [],
      digest,
      text: {
        scalarLength: [...content.replace(/^\ufeff/u, '').replace(/\r\n?/gu, '\n')].length,
        utf8ByteLength: encoder.encode(content.replace(/^\ufeff/u, '').replace(/\r\n?/gu, '\n'))
          .byteLength,
        value: content.replace(/^\ufeff/u, '').replace(/\r\n?/gu, '\n'),
      },
      valid: true,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.text)).toBe(true);
  });

  test('returns normalization diagnostics without a digest', async () => {
    await expect(
      createCore().calculateContentDigest({ content: '\0', path }),
    ).resolves.toMatchObject({
      diagnostics: [{ code: 'MOLDEA_TEXT_NUL_FORBIDDEN' }],
      digest: null,
      text: null,
      valid: false,
    });
  });

  test('copies byte input before asynchronous hashing begins', async () => {
    const bytes = encoder.encode('abc');
    const promise = createCore().calculateContentDigest({ content: bytes, path });

    bytes.fill(0);

    await expect(promise).resolves.toMatchObject({
      digest: 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      valid: true,
    });
  });

  test('reports digest resource failures with the digest operation', async () => {
    const core = createCore({ limits: { maxFileBytes: 1 } });

    await expect(core.calculateContentDigest({ content: 'ab', path })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxFileBytes',
      operation: 'calculate-content-digest',
      retryable: false,
    });
  });
});
