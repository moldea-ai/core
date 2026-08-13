// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { createGitContentTransformationParser } from './parser.js';

const ENCODER = new TextEncoder();

/** Encodes one complete Git attribute record. */
const encodeRecord = (path: string, attribute: string, value: string): Uint8Array =>
  ENCODER.encode(`${path}\u0000${attribute}\u0000${value}\u0000`);

/** Concatenates deterministic byte fixtures without relying on Buffer. */
const concatenateBytes = (chunks: readonly Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0));
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
};

describe('createGitContentTransformationParser', () => {
  test('associates exact paths and attributes across arbitrary chunks and record order', () => {
    const parser = createGitContentTransformationParser({
      paths: ['first file.txt', 'nested/😀.txt'],
    });
    const output = concatenateBytes([
      encodeRecord('nested/😀.txt', 'ident', 'set'),
      encodeRecord('first file.txt', 'working-tree-encoding', 'UTF-16LE'),
      encodeRecord('first file.txt', 'filter', 'lfs'),
      encodeRecord('nested/😀.txt', 'filter', 'unspecified'),
      encodeRecord('first file.txt', 'ident', 'unset'),
      encodeRecord('nested/😀.txt', 'working-tree-encoding', 'unspecified'),
    ]);

    for (let index = 0; index < output.byteLength; index += 2) {
      parser.consume(output.subarray(index, index + 2));
    }

    const result = parser.finish();

    expect(result).toStrictEqual({
      attributes: [
        {
          filter: 'lfs',
          ident: 'unset',
          path: 'first file.txt',
          workingTreeEncoding: 'UTF-16LE',
        },
        {
          filter: 'unspecified',
          ident: 'set',
          path: 'nested/😀.txt',
          workingTreeEncoding: 'unspecified',
        },
      ],
      kind: 'completed',
    });
    expect(Object.isFrozen(result)).toBe(true);

    if (result.kind === 'completed') {
      expect(Object.isFrozen(result.attributes)).toBe(true);
      expect(result.attributes.every((attributes) => Object.isFrozen(attributes))).toBe(true);
    }
  });

  test('accepts an empty expected path set only with empty output', () => {
    const emptyParser = createGitContentTransformationParser({ paths: [] });

    expect(emptyParser.finish()).toStrictEqual({ attributes: [], kind: 'completed' });

    const unexpectedParser = createGitContentTransformationParser({ paths: [] });

    unexpectedParser.consume(encodeRecord('unexpected', 'filter', 'unspecified'));
    expect(unexpectedParser.finish()).toStrictEqual({ kind: 'failed' });
  });

  test.each([
    [
      'unknown path',
      [
        encodeRecord('other', 'filter', 'unspecified'),
        encodeRecord('expected', 'ident', 'unspecified'),
        encodeRecord('expected', 'working-tree-encoding', 'unspecified'),
      ],
    ],
    [
      'unknown attribute',
      [
        encodeRecord('expected', 'text', 'set'),
        encodeRecord('expected', 'ident', 'unspecified'),
        encodeRecord('expected', 'working-tree-encoding', 'unspecified'),
      ],
    ],
    [
      'duplicate attribute',
      [
        encodeRecord('expected', 'filter', 'unspecified'),
        encodeRecord('expected', 'filter', 'lfs'),
        encodeRecord('expected', 'ident', 'unspecified'),
        encodeRecord('expected', 'working-tree-encoding', 'unspecified'),
      ],
    ],
    [
      'missing attribute',
      [
        encodeRecord('expected', 'filter', 'unspecified'),
        encodeRecord('expected', 'ident', 'unspecified'),
      ],
    ],
  ] as const)('rejects %s without partial classifications', (_description, records) => {
    const parser = createGitContentTransformationParser({ paths: ['expected'] });

    parser.consume(concatenateBytes(records));

    expect(parser.finish()).toStrictEqual({ kind: 'failed' });
  });

  test('rejects duplicate expected paths, invalid UTF-8, and incomplete triples', () => {
    const duplicateParser = createGitContentTransformationParser({
      paths: ['expected', 'expected'],
    });

    expect(duplicateParser.finish()).toStrictEqual({ kind: 'failed' });

    const invalidUtf8Parser = createGitContentTransformationParser({ paths: ['expected'] });

    invalidUtf8Parser.consume(
      concatenateBytes([
        ENCODER.encode('expected\u0000filter\u0000'),
        new Uint8Array([0xff, 0x00]),
      ]),
    );
    expect(invalidUtf8Parser.finish()).toStrictEqual({ kind: 'failed' });

    const incompleteParser = createGitContentTransformationParser({ paths: ['expected'] });

    incompleteParser.consume(ENCODER.encode('expected\u0000filter\u0000unspecified'));
    expect(incompleteParser.finish()).toStrictEqual({ kind: 'failed' });
  });
});
