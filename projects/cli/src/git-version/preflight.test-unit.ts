// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import type { IGitProcessExecutor, IGitProcessFailureReason } from '../git-process/index.js';

import { MAX_GIT_VERSION_OUTPUT_BYTES } from './constants.js';
import { createGitVersionPreflight } from './preflight.js';

const ENCODER = new TextEncoder();

describe('createGitVersionPreflight', () => {
  test.each([
    ['not-found', 'GIT_NOT_FOUND'],
    ['repository-not-found', 'GIT_COMMAND_FAILED'],
    ['access-denied', 'GIT_ACCESS_DENIED'],
    ['output-limit-exceeded', 'GIT_VERSION_INVALID'],
    ['command-failed', 'GIT_COMMAND_FAILED'],
  ] as const)('maps %s to %s', async (reason, errorCode) => {
    const processExecutor = vi.fn<IGitProcessExecutor>().mockResolvedValue(
      Object.freeze({
        kind: 'failed',
        reason: reason satisfies IGitProcessFailureReason,
      }),
    );

    await expect(createGitVersionPreflight(processExecutor)()).resolves.toStrictEqual({
      errorCode,
      kind: 'failed',
    });
    expect(processExecutor).toHaveBeenCalledOnce();
    expect(processExecutor).toHaveBeenCalledWith({
      arguments: ['--version'],
      maxBufferBytes: MAX_GIT_VERSION_OUTPUT_BYTES,
    });
  });

  test.each([
    ['git version 2.29.9\n', 'GIT_VERSION_UNSUPPORTED'],
    ['git version invalid\n', 'GIT_VERSION_INVALID'],
  ] as const)('rejects %s with %s', async (stdout, errorCode) => {
    const processExecutor = vi.fn<IGitProcessExecutor>().mockResolvedValue(
      Object.freeze({
        kind: 'completed',
        stderr: new Uint8Array(),
        stdout: ENCODER.encode(stdout),
      }),
    );

    await expect(createGitVersionPreflight(processExecutor)()).resolves.toStrictEqual({
      errorCode,
      kind: 'failed',
    });
  });

  test('rejects otherwise valid stdout when Git writes stderr', async () => {
    const processExecutor = vi.fn<IGitProcessExecutor>().mockResolvedValue(
      Object.freeze({
        kind: 'completed',
        stderr: ENCODER.encode('private provider diagnostic'),
        stdout: ENCODER.encode('git version 2.53.0\n'),
      }),
    );

    await expect(createGitVersionPreflight(processExecutor)()).resolves.toStrictEqual({
      errorCode: 'GIT_VERSION_INVALID',
      kind: 'failed',
    });
  });

  test.each(['git version 2.30.0\n', 'git version 3.0.0.windows.1\n'])(
    'accepts supported output %s',
    async (stdout) => {
      const processExecutor = vi.fn<IGitProcessExecutor>().mockResolvedValue(
        Object.freeze({
          kind: 'completed',
          stderr: new Uint8Array(),
          stdout: ENCODER.encode(stdout),
        }),
      );

      const result = await createGitVersionPreflight(processExecutor)();

      expect(result.kind).toBe('supported');
      expect(Object.isFrozen(result)).toBe(true);
    },
  );
});
