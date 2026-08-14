// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { createTrackedGitInventoryParser, createUntrackedGitInventoryParser } from './parser.js';
import type { IGitInventoryCandidate, IGitInventoryParser } from './types.js';

const ENCODER = new TextEncoder();
const SHA1_OBJECT_ID = '0123456789abcdef0123456789abcdef01234567';
const SHA256_OBJECT_ID = `${SHA1_OBJECT_ID}89abcdef0123456789abcdef`;

/** Feeds one parser using deliberately irregular process-chunk boundaries. */
const consumeInChunks = <TCandidate extends IGitInventoryCandidate>(
  parser: IGitInventoryParser<TCandidate>,
  bytes: Uint8Array,
  chunkLengths: readonly number[],
): void => {
  let offset = 0;

  for (const chunkLength of chunkLengths) {
    parser.consume(bytes.subarray(offset, offset + chunkLength));
    offset += chunkLength;
  }

  parser.consume(bytes.subarray(offset));
};

describe('tracked Git inventory parser', () => {
  test('parses complete SHA-1 and SHA-256 records across arbitrary chunks', () => {
    const parser = createTrackedGitInventoryParser(4);
    const firstPath = '\ufeffmoldea/agent\tname\n😀.md';
    const output = ENCODER.encode(
      `100755 ${SHA1_OBJECT_ID} 0\t${firstPath}\u0000120000 ${SHA1_OBJECT_ID} 1\tlink\u0000160000 ${SHA256_OBJECT_ID} 3\tsubmodule\u0000`,
    );

    consumeInChunks(parser, output, [1, 2, 40, 3, 7, 1, 12]);

    const result = parser.finish();

    expect(result).toStrictEqual({
      candidates: [
        { kind: 'tracked', mode: '100755', path: firstPath, stage: 0 },
        { kind: 'tracked', mode: '120000', path: 'link', stage: 1 },
        { kind: 'tracked', mode: '160000', path: 'submodule', stage: 3 },
      ],
      kind: 'completed',
    });
    expect(Object.isFrozen(result)).toBe(true);

    if (result.kind === 'completed') {
      expect(Object.isFrozen(result.candidates)).toBe(true);
      expect(result.candidates.every(Object.isFrozen)).toBe(true);
    }
  });

  test.each([
    [`100600 ${SHA1_OBJECT_ID} 0\tpath\u0000`, 'unsupported mode'],
    [`100644 ${SHA1_OBJECT_ID.toUpperCase()} 0\tpath\u0000`, 'uppercase object id'],
    [`100644 ${SHA1_OBJECT_ID.slice(1)} 0\tpath\u0000`, 'abbreviated object id'],
    [`100644 ${SHA1_OBJECT_ID} 4\tpath\u0000`, 'unsupported stage'],
    [`100644 ${SHA1_OBJECT_ID} 0 path\u0000`, 'missing header separator'],
    [`100644 ${SHA1_OBJECT_ID} 0\t\u0000`, 'empty path'],
    ['', 'empty output'],
  ] as const)('handles %s without accepting a looser tracked grammar', (output, description) => {
    const parser = createTrackedGitInventoryParser(4);

    parser.consume(ENCODER.encode(output));
    const result = parser.finish();

    if (description === 'empty output') {
      expect(result).toStrictEqual({ candidates: [], kind: 'completed' });
      return;
    }

    expect(result).toStrictEqual({ kind: 'failed', reason: 'invalid' });
  });

  test('rejects fatal UTF-8 failures and unterminated records', () => {
    const invalidUtf8Parser = createTrackedGitInventoryParser(1);
    const header = ENCODER.encode(`100644 ${SHA1_OBJECT_ID} 0\t`);

    invalidUtf8Parser.consume(Uint8Array.from([...header, 0xc3, 0x28, 0x00]));
    expect(invalidUtf8Parser.finish()).toStrictEqual({ kind: 'failed', reason: 'invalid' });

    const unterminatedParser = createTrackedGitInventoryParser(1);

    unterminatedParser.consume(ENCODER.encode(`100644 ${SHA1_OBJECT_ID} 0\tpath`));
    expect(unterminatedParser.finish()).toStrictEqual({ kind: 'failed', reason: 'invalid' });
  });

  test('counts every raw merge-stage record before later collapsing', () => {
    const parser = createTrackedGitInventoryParser(1);

    parser.consume(
      ENCODER.encode(
        `100644 ${SHA1_OBJECT_ID} 1\tconflict\u0000100644 ${SHA1_OBJECT_ID} 2\tconflict\u0000`,
      ),
    );

    expect(parser.finish()).toStrictEqual({
      kind: 'failed',
      reason: 'entry-limit-exceeded',
    });
  });
});

describe('untracked Git inventory parser', () => {
  test('preserves exact Unicode, tabs, newlines, case, and normalization form', () => {
    const parser = createUntrackedGitInventoryParser(4);
    const decomposedPath = '\ufeffA/e\u0301\tline\n😀.txt';
    const bytes = ENCODER.encode(`${decomposedPath}\u0000ordinary\u0000`);

    consumeInChunks(parser, bytes, [3, 1, 4, 2, 1]);

    expect(parser.finish()).toStrictEqual({
      candidates: [
        { kind: 'untracked', path: decomposedPath },
        { kind: 'untracked', path: 'ordinary' },
      ],
      kind: 'completed',
    });
  });

  test.each([
    { description: 'empty record', output: Uint8Array.from([0x00]) },
    {
      description: 'UTF-8 surrogate encoding',
      output: Uint8Array.from([0xed, 0xa0, 0x80, 0x00]),
    },
    { description: 'unterminated record', output: ENCODER.encode('unterminated') },
  ])('rejects $description', ({ output }) => {
    const parser = createUntrackedGitInventoryParser(2);

    parser.consume(output);
    expect(parser.finish()).toStrictEqual({ kind: 'failed', reason: 'invalid' });
  });

  test('enforces its raw record budget without returning partial candidates', () => {
    const parser = createUntrackedGitInventoryParser(1);

    parser.consume(ENCODER.encode('first\u0000second\u0000'));

    expect(parser.finish()).toStrictEqual({
      kind: 'failed',
      reason: 'entry-limit-exceeded',
    });
  });
});
