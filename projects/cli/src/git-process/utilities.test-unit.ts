// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { classifyGitProcessError } from './utilities.js';

const ENCODER = new TextEncoder();

describe('classifyGitProcessError', () => {
  test.each([
    ['ENOENT', '', 'not-found'],
    ['EACCES', '', 'access-denied'],
    ['EPERM', '', 'access-denied'],
    ['ERR_CHILD_PROCESS_STDIO_MAXBUFFER', '', 'output-limit-exceeded'],
    ['128', 'fatal: not a git repository\n', 'repository-not-found'],
    ['128', "fatal: detected dubious ownership in repository at '/private'\n", 'access-denied'],
    ['128', "fatal: cannot change to '/private': Permission denied\n", 'access-denied'],
    ['128', 'fatal: unknown failure\n', 'command-failed'],
  ] as const)('maps %s and bounded diagnostic to %s', (code, stderr, expectedReason) => {
    const error = Object.assign(new Error('private diagnostic'), { code });

    expect(classifyGitProcessError(error, ENCODER.encode(stderr))).toBe(expectedReason);
  });
});
