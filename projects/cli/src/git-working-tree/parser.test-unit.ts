// @vitest-environment node
import path from 'node:path';
import process from 'node:process';
import { describe, expect, test } from 'vitest';

import { MAX_GIT_DISCOVERY_OUTPUT_BYTES } from './constants.js';
import { parseGitAbsolutePathOutput, parseGitBooleanOutput, parseGitPathOutput } from './parser.js';

const ENCODER = new TextEncoder();

describe('Git working-tree output parsers', () => {
  test.each([
    ['true\n', true],
    ['false\n', false],
    ['true\r\n', true],
    ['false\r\n', false],
  ] as const)('parses canonical boolean output %s', (output, expectedValue) => {
    expect(parseGitBooleanOutput(ENCODER.encode(output))).toBe(expectedValue);
  });

  test.each(['true', 'TRUE\n', 'false\n\n', ' true\n', '\n'])(
    'rejects noncanonical boolean output %s',
    (output) => {
      expect(parseGitBooleanOutput(ENCODER.encode(output))).toBeNull();
    },
  );

  test('parses an absolute repository root terminated by LF', () => {
    const repositoryRoot = path.resolve('repository root');

    expect(parseGitAbsolutePathOutput(ENCODER.encode(`${repositoryRoot}\n`))).toBe(repositoryRoot);
  });

  test('preserves valid Unicode, embedded byte-order marks, and internal line breaks', () => {
    const repositoryRoot = path.resolve('répository\ufeff', 'line\nbreak');

    expect(parseGitAbsolutePathOutput(ENCODER.encode(`${repositoryRoot}\n`))).toBe(repositoryRoot);
  });

  test('preserves the platform-valid meaning of carriage return before LF', () => {
    const repositoryRoot = path.resolve('repository root');
    const expectedRepositoryRoot =
      process.platform === 'win32' ? repositoryRoot : `${repositoryRoot}\r`;

    expect(parseGitAbsolutePathOutput(ENCODER.encode(`${repositoryRoot}\r\n`))).toBe(
      expectedRepositoryRoot,
    );
  });

  test('parses relative Git paths without resolving their spelling', () => {
    expect(parseGitPathOutput(ENCODER.encode('../common/.git\n'))).toBe('../common/.git');
  });

  test.each([
    ['empty output', new Uint8Array()],
    ['malformed UTF-8', Uint8Array.from([0xc3, 0x28, 0x0a])],
    ['UTF-8 byte-order mark', Uint8Array.from([0xef, 0xbb, 0xbf, 0x2f, 0x0a])],
    ['NUL', ENCODER.encode(`${path.resolve('repo')}\0\n`)],
    ['missing terminator', ENCODER.encode(path.resolve('repo'))],
    ['relative root', ENCODER.encode('repository\n')],
    [
      'oversized output',
      Uint8Array.from({ length: MAX_GIT_DISCOVERY_OUTPUT_BYTES + 1 }, () => 0x61),
    ],
  ] as const)('rejects %s', (_description, output) => {
    expect(parseGitAbsolutePathOutput(output)).toBeNull();
  });

  test('rejects an empty path while allowing a nonempty relative path', () => {
    expect(parseGitPathOutput(ENCODER.encode('\n'))).toBeNull();
    expect(parseGitPathOutput(ENCODER.encode('.git\n'))).toBe('.git');
  });
});
