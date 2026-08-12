// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import type { IMoldeaCliCommand } from '../command-line/index.js';
import type { IGitVersionPreflight } from '../git-version/index.js';

import { createMoldeaCliCommandExecutor } from './command-executor.js';
import type { IMoldeaCliCommandExecutionInput } from './types.js';

/** Creates one normalized command execution input. */
const createCommandInput = (
  command: IMoldeaCliCommand,
  isJson = false,
): IMoldeaCliCommandExecutionInput => ({
  cliVersion: '0.0.1',
  invocation: {
    command,
    options: {
      isColorDisabled: false,
      isJson,
      repositoryDirectory: null,
      resourceLimits: {
        maxDiagnostics: 10_000,
        maxEntries: 100_000,
        maxEvidence: 10_000,
        maxFileBytes: 8_388_608,
        maxManifestBytes: 2_097_152,
        maxTotalBytes: 134_217_728,
      },
    },
  },
});

describe('createMoldeaCliCommandExecutor', () => {
  test.each(['validate', 'inspect'] as const)('preflights Git once for %s', async (command) => {
    const gitVersionPreflight = vi.fn<IGitVersionPreflight>().mockResolvedValue(
      Object.freeze({
        kind: 'supported',
        version: Object.freeze({ major: 2, minor: 30, patch: 0 }),
      }),
    );
    const executeCommand = createMoldeaCliCommandExecutor(gitVersionPreflight);

    await expect(executeCommand(createCommandInput(command))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: 'cli:INTERNAL_ERROR The command could not be completed.\n',
      stdout: '',
    });
    expect(gitVersionPreflight).toHaveBeenCalledOnce();
  });

  test('does not preflight Git for compatibility', async () => {
    const gitVersionPreflight = vi.fn<IGitVersionPreflight>();
    const executeCommand = createMoldeaCliCommandExecutor(gitVersionPreflight);

    await expect(executeCommand(createCommandInput('compatibility'))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: 'cli:INTERNAL_ERROR The command could not be completed.\n',
      stdout: '',
    });
    expect(gitVersionPreflight).not.toHaveBeenCalled();
  });

  test('returns a safe human Git prerequisite error', async () => {
    const gitVersionPreflight = vi
      .fn<IGitVersionPreflight>()
      .mockResolvedValue(Object.freeze({ errorCode: 'GIT_NOT_FOUND', kind: 'failed' }));
    const executeCommand = createMoldeaCliCommandExecutor(gitVersionPreflight);

    await expect(executeCommand(createCommandInput('validate'))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: 'git:GIT_NOT_FOUND The Git executable is unavailable.\n',
      stdout: '',
    });
  });

  test('returns a safe JSON Git prerequisite error', async () => {
    const gitVersionPreflight = vi
      .fn<IGitVersionPreflight>()
      .mockResolvedValue(Object.freeze({ errorCode: 'GIT_COMMAND_FAILED', kind: 'failed' }));
    const executeCommand = createMoldeaCliCommandExecutor(gitVersionPreflight);

    await expect(executeCommand(createCommandInput('inspect', true))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: '',
      stdout:
        '{"cliVersion":"0.0.1","command":"inspect","error":{"code":"GIT_COMMAND_FAILED","details":{},"message":"The Git command failed.","path":null,"retryable":true,"source":"git"},"result":null,"schemaVersion":1,"status":"error"}\n',
    });
  });
});
