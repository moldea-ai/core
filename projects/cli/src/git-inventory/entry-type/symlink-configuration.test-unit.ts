// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import type { IGitStreamingProcessExecutor } from '../../git-process/index.js';

import { GIT_SYMLINK_CONFIGURATION_ARGUMENTS } from './constants.js';
import { createGitSymlinkConfigurationResolver } from './symlink-configuration.js';

const ENCODER = new TextEncoder();

/** Creates one successful streamed Git fixture. */
const createCompletedExecutor = (
  stdout: Uint8Array,
  stderr = new Uint8Array(),
  reportedStdoutBytes = stdout.byteLength,
): IGitStreamingProcessExecutor =>
  vi.fn<IGitStreamingProcessExecutor>((options) => {
    options.consumeStdout(stdout.subarray(0, 2));
    options.consumeStdout(stdout.subarray(2));

    return Promise.resolve(
      Object.freeze({ kind: 'completed', stderr, stdoutBytes: reportedStdoutBytes }),
    );
  });

describe('createGitSymlinkConfigurationResolver', () => {
  test.each([
    ['true\n', true],
    ['false\r\n', false],
  ] as const)('parses canonical %s output', async (output, isEnabled) => {
    const processExecutor = createCompletedExecutor(ENCODER.encode(output));
    const resolveConfiguration = createGitSymlinkConfigurationResolver(processExecutor);

    await expect(
      resolveConfiguration({ maxMetadataBytes: 32, repositoryRoot: '/repository' }),
    ).resolves.toStrictEqual({
      gitMetadataBytes: ENCODER.encode(output).byteLength,
      isEnabled,
      kind: 'resolved',
    });
    const processOptions = vi.mocked(processExecutor).mock.calls[0]?.[0];

    expect(processOptions?.arguments).toStrictEqual([
      '-C',
      '/repository',
      ...GIT_SYMLINK_CONFIGURATION_ARGUMENTS,
    ]);
    expect(processOptions?.maxStderrBytes).toBe(4096);
    expect(processOptions?.maxStdoutBytes).toBe(32);
    expect(typeof processOptions?.consumeStdout).toBe('function');
  });

  test.each([
    ['not-found', 'GIT_NOT_FOUND'],
    ['repository-not-found', 'GIT_OUTPUT_INVALID'],
    ['access-denied', 'GIT_ACCESS_DENIED'],
    ['stderr-limit-exceeded', 'GIT_OUTPUT_INVALID'],
    ['output-limit-exceeded', 'RESOURCE_LIMIT_EXCEEDED'],
    ['stdout-limit-exceeded', 'RESOURCE_LIMIT_EXCEEDED'],
    ['command-failed', 'GIT_COMMAND_FAILED'],
  ] as const)('maps %s without exposing Git diagnostics', async (reason, errorCode) => {
    const processExecutor = vi
      .fn<IGitStreamingProcessExecutor>()
      .mockResolvedValue(Object.freeze({ kind: 'failed', reason }));
    const resolveConfiguration = createGitSymlinkConfigurationResolver(processExecutor);

    await expect(
      resolveConfiguration({ maxMetadataBytes: 8, repositoryRoot: '/private' }),
    ).resolves.toStrictEqual({ errorCode, kind: 'failed' });
  });

  test('rejects malformed output, successful stderr, and inconsistent byte accounting', async () => {
    const malformedResolver = createGitSymlinkConfigurationResolver(
      createCompletedExecutor(ENCODER.encode('yes\n')),
    );
    const stderrResolver = createGitSymlinkConfigurationResolver(
      createCompletedExecutor(ENCODER.encode('true\n'), ENCODER.encode('private warning')),
    );
    const byteMismatchResolver = createGitSymlinkConfigurationResolver(
      createCompletedExecutor(ENCODER.encode('true\n'), new Uint8Array(), 4),
    );

    await expect(
      malformedResolver({ maxMetadataBytes: 16, repositoryRoot: '/repository' }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
    await expect(
      stderrResolver({ maxMetadataBytes: 16, repositoryRoot: '/repository' }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
    await expect(
      byteMismatchResolver({ maxMetadataBytes: 16, repositoryRoot: '/repository' }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
  });

  test.each([-1, Number.NaN])('rejects an invalid metadata budget of %s', async (budget) => {
    const processExecutor = vi.fn<IGitStreamingProcessExecutor>();
    const resolveConfiguration = createGitSymlinkConfigurationResolver(processExecutor);

    await expect(
      resolveConfiguration({ maxMetadataBytes: budget, repositoryRoot: '/repository' }),
    ).resolves.toStrictEqual({ errorCode: 'RESOURCE_LIMIT_EXCEEDED', kind: 'failed' });
    expect(processExecutor).not.toHaveBeenCalled();
  });
});
