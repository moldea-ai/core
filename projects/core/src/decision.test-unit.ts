// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { parseRepositoryPath, RepositoryPathException } from '@moldea.ai/repository';

import type { ICoreDiagnosticCode } from './diagnostics.js';
import { createCore } from './core.js';
import { CoreOperationException } from './exceptions.js';

interface IInvalidDecisionCase {
  readonly name: string;
  readonly path: string;
  readonly content: string;
  readonly codes: readonly ICoreDiagnosticCode[];
}

const fixtureDirectory = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'fixtures',
  'core',
  'decision',
);
const readFixture = (fileName: string): string =>
  readFileSync(path.join(fixtureDirectory, fileName), 'utf8');
const invalidCases = JSON.parse(
  readFixture('invalid-cases.json'),
) as readonly IInvalidDecisionCase[];
const completePath = parseRepositoryPath('/moldea/decisions/1786131723456-use-postgresql.md');

describe('Core decision parsing', () => {
  test('parses a minimal decision into a frozen normalized asset', async () => {
    const path = parseRepositoryPath('/moldea/decisions/1767225600000-adopt-core.md');
    const content = readFixture('1767225600000-adopt-core.md');
    const normalizedContent = content.replace(/\r\n?/gu, '\n');
    const result = await createCore().parseDecision({ content, path });

    expect(result).toStrictEqual({
      decision: {
        asset: {
          content: normalizedContent,
          digest: 'sha256:b88db2c192a4a0a19c5ceed8a99aaecac794420dfbed7a3e85d8bccf07ba13ad',
          path,
          scalarLength: 139,
          utf8ByteLength: 139,
        },
        body: '\n# Adopt Core\n\nUse Core as the deterministic repository-format interpreter.\n',
        createdAt: '2026-01-01T00:00:00.000Z',
        id: '1767225600000',
        path,
        status: 'accepted',
        supersedes: [],
      },
      diagnostics: [],
      valid: true,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.decision)).toBe(true);
    expect(Object.isFrozen(result.decision?.asset)).toBe(true);
    expect(Object.isFrozen(result.decision?.supersedes)).toBe(true);
  });

  test('normalizes every decision field while preserving the exact body', async () => {
    const content = readFixture('1786131723456-use-postgresql.md');
    const normalizedContent = content.replace(/\r\n?/gu, '\n');
    const expected = JSON.parse(readFixture('valid-complete.expected.json')) as unknown;
    const result = await createCore().parseDecision({ content, path: completePath });

    expect(result.valid).toBe(true);
    expect(result.decision).toMatchObject(expected as object);
    expect(result.decision?.supersedes).toStrictEqual(['1784000000000', '1785000000000']);
    expect(result.decision?.asset.content).toBe(normalizedContent);
  });

  test.each(invalidCases)(
    'returns all-or-nothing diagnostics for $name',
    async ({ codes, content, path }) => {
      const result = await createCore().parseDecision({
        content,
        path: parseRepositoryPath(path),
      });

      expect(result.valid).toBe(false);
      expect(result.decision).toBeNull();
      expect(result.diagnostics.map(({ code }) => code)).toStrictEqual(codes);
    },
  );

  test.each(['proposed', 'accepted', 'rejected', 'superseded'] as const)(
    'accepts the %s decision status',
    async (status) => {
      const result = await createCore().parseDecision({
        content: `---\nstatus: ${status}\ncreatedAt: "2026-08-07T19:42:03.456Z"\n---\nBody.\n`,
        path: completePath,
      });

      expect(result).toMatchObject({
        decision: { status },
        diagnostics: [],
        valid: true,
      });
    },
  );

  test.each([
    '2026-08-07T19:42:03Z',
    '2026-08-07T19:42:03.45Z',
    '2026-08-07T19:42:03.456z',
    '2026-08-07T19:42:03.456+00:00',
    '2026-13-07T19:42:03.456Z',
    '2026-02-29T19:42:03.456Z',
  ])('rejects noncanonical or impossible createdAt value %s', async (createdAt) => {
    const result = await createCore().parseDecision({
      content: `---\nstatus: accepted\ncreatedAt: "${createdAt}"\n---\nBody.\n`,
      path: completePath,
    });

    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
      'MOLDEA_DECISION_CREATED_AT_INVALID',
    ]);
  });

  test('rejects unsupported YAML features before frontmatter interpretation', async () => {
    const result = await createCore().parseDecision({
      content: [
        '---',
        'status: &status accepted',
        'createdAt: "2026-08-07T19:42:03.456Z"',
        'supersedes: [*status]',
        '---',
        'Body.',
        '',
      ].join('\n'),
      path: completePath,
    });

    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
      'MOLDEA_YAML_FEATURE_UNSUPPORTED',
      'MOLDEA_YAML_FEATURE_UNSUPPORTED',
    ]);
  });

  test('rejects custom YAML tags before frontmatter interpretation', async () => {
    const result = await createCore().parseDecision({
      content: [
        '---',
        'status: !decision accepted',
        'createdAt: "2026-08-07T19:42:03.456Z"',
        '---',
        'Body.',
        '',
      ].join('\n'),
      path: completePath,
    });

    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
      'MOLDEA_YAML_FEATURE_UNSUPPORTED',
    ]);
  });

  test('reports normalized full-document scalar ranges and frontmatter pointers', async () => {
    const result = await createCore().parseDecision({
      content: [
        '---',
        '# 😀',
        'unknown: true',
        'status: accepted',
        'createdAt: "2026-08-07T19:42:03.456Z"',
        '---',
        'Body.',
        '',
      ].join('\n'),
      path: completePath,
    });

    expect(result.diagnostics).toMatchObject([
      {
        code: 'MOLDEA_DECISION_PROPERTY_UNKNOWN',
        entity: { decisionId: '1786131723456' },
        pointer: '/unknown',
        range: { start: { column: 1, line: 3, offset: 8 } },
      },
    ]);
  });

  test('does not perform cross-file supersession validation', async () => {
    const result = await createCore().parseDecision({
      content: [
        '---',
        'status: proposed',
        'createdAt: "2026-08-07T19:42:03.456Z"',
        'supersedes: ["1784000000000"]',
        '---',
        'Body.',
        '',
      ].join('\n'),
      path: completePath,
    });

    expect(result).toMatchObject({
      decision: { supersedes: ['1784000000000'] },
      diagnostics: [],
      valid: true,
    });
  });

  test('normalizes BOM and line endings before parsing and hashing copied bytes', async () => {
    const source = [
      '\ufeff---\r\n',
      'status: accepted\r\n',
      'createdAt: "2026-08-07T19:42:03.456Z"\r\n',
      '---\r\n',
      'Body.\r\n',
    ].join('');
    const bytes = new TextEncoder().encode(source);
    const promise = createCore().parseDecision({ content: bytes, path: completePath });

    bytes.fill(0);
    const result = await promise;

    expect(result).toMatchObject({
      decision: {
        asset: {
          content: '---\nstatus: accepted\ncreatedAt: "2026-08-07T19:42:03.456Z"\n---\nBody.\n',
        },
        body: 'Body.\n',
      },
      diagnostics: [],
      valid: true,
    });
    expect(JSON.stringify(result)).not.toContain('srcToken');
  });

  test('returns strict text diagnostics before decision interpretation', async () => {
    const invalidUtf8 = await createCore().parseDecision({
      content: Uint8Array.from([0xff]),
      path: completePath,
    });
    const invalidUnicode = await createCore().parseDecision({
      content: '\ud800',
      path: completePath,
    });
    const nul = await createCore().parseDecision({
      content: '---\nstatus: accepted\ncreatedAt: "2026-08-07T19:42:03.456Z"\n---\nBody\0.\n',
      path: completePath,
    });

    expect(invalidUtf8.diagnostics.map(({ code }) => code)).toStrictEqual([
      'MOLDEA_TEXT_INVALID_UTF8',
    ]);
    expect(invalidUnicode.diagnostics.map(({ code }) => code)).toStrictEqual([
      'MOLDEA_TEXT_INVALID_UNICODE',
    ]);
    expect(nul.diagnostics.map(({ code }) => code)).toStrictEqual(['MOLDEA_TEXT_NUL_FORBIDDEN']);
  });

  test('uses the file byte limit and decision operation in resource failures', async () => {
    const core = createCore({ limits: { maxFileBytes: 4, maxManifestBytes: 1 } });

    await expect(
      core.parseDecision({
        content: readFixture('1786131723456-use-postgresql.md'),
        path: completePath,
      }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxFileBytes',
      operation: 'parse-decision',
      retryable: false,
    });
  });

  test('uses the decision operation when the diagnostic budget is exhausted', async () => {
    const core = createCore({ limits: { maxDiagnostics: 1 } });

    await expect(
      core.parseDecision({
        content: '---\nstatus: invalid\ncreatedAt: invalid\n---\nBody.\n',
        path: completePath,
      }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxDiagnostics',
      operation: 'parse-decision',
      retryable: false,
    });
  });

  test('uses typed failures for invalid arguments and forged logical paths', async () => {
    const core = createCore();

    await expect(core.parseDecision(null as never)).rejects.toBeInstanceOf(CoreOperationException);
    await expect(
      core.parseDecision({ content: 'decision', path: '/forged/../path' as never }),
    ).rejects.toBeInstanceOf(RepositoryPathException);
  });
});
