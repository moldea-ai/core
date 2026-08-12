// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseGitVersionOutput } from './parser.js';

const ENCODER = new TextEncoder();

describe('parseGitVersionOutput', () => {
  test.each([
    ['git version 2.30.0\n', { major: 2, minor: 30, patch: 0 }],
    ['git version 2.53.0\r\n', { major: 2, minor: 53, patch: 0 }],
    ['git version 2.53.0.windows.1\n', { major: 2, minor: 53, patch: 0 }],
    ['git version 2.53.0-rc0\n', { major: 2, minor: 53, patch: 0 }],
    ['git version 2.39.5 (Apple Git-154)\n', { major: 2, minor: 39, patch: 5 }],
    ['git version 9007199254740991.0.0\n', { major: Number.MAX_SAFE_INTEGER, minor: 0, patch: 0 }],
  ])('parses %s by its numeric base', (output, expectedVersion) => {
    const result = parseGitVersionOutput(ENCODER.encode(output));

    expect(result).toStrictEqual(expectedVersion);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test.each([
    '',
    'git version 2.30.0',
    'git version 2.30\n',
    'git version 02.30.0\n',
    'git version 2.30.0\ngit version 2.31.0\n',
    ' git version 2.30.0\n',
    'git version 2.30.0 arbitrary prose\n',
    'git version 2.30.0 ()\n',
    'git version 2.30.0 (Apple Git-154) trailing\n',
    'git version 2.30.0_windows\n',
    'git version 2.30.0\u0000\n',
    'git version 9007199254740992.0.0\n',
    '\uFEFFgit version 2.30.0\n',
  ])('rejects invalid output %o', (output) => {
    expect(parseGitVersionOutput(ENCODER.encode(output))).toBeNull();
  });

  test('rejects malformed UTF-8', () => {
    expect(parseGitVersionOutput(Uint8Array.from([0xc3, 0x28, 0x0a]))).toBeNull();
  });
});
