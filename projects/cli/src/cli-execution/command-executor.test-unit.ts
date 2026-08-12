// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import type { IMoldeaCliCommand } from '../command-line/index.js';
import type { IGitInventoryProbe } from '../git-inventory/index.js';
import type { IGitWorkingTreeDiscovery } from '../git-working-tree/index.js';

import { createMoldeaCliCommandExecutor } from './command-executor.js';
import type { IMoldeaCliCommandExecutionInput } from './types.js';

/** Creates one normalized command execution input. */
const createCommandInput = (
  command: IMoldeaCliCommand,
  isJson = false,
): IMoldeaCliCommandExecutionInput => ({
  cliVersion: '0.0.1',
  invocationDirectory: '/workspace',
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
  test.each(['validate', 'inspect'] as const)(
    'discovers the working tree once for %s',
    async (command) => {
      const workingTreeDiscovery = vi
        .fn<IGitWorkingTreeDiscovery>()
        .mockResolvedValue(Object.freeze({ kind: 'discovered', repositoryRoot: '/workspace' }));
      const gitInventoryProbe = vi
        .fn<IGitInventoryProbe>()
        .mockResolvedValue(Object.freeze({ candidates: Object.freeze([]), kind: 'probed' }));
      const executeCommand = createMoldeaCliCommandExecutor(
        workingTreeDiscovery,
        gitInventoryProbe,
      );

      await expect(executeCommand(createCommandInput(command))).resolves.toStrictEqual({
        exitCode: 3,
        stderr: 'cli:INTERNAL_ERROR The command could not be completed.\n',
        stdout: '',
      });
      expect(workingTreeDiscovery).toHaveBeenCalledOnce();
      expect(workingTreeDiscovery).toHaveBeenCalledWith({
        invocationDirectory: '/workspace',
        repositoryDirectory: null,
      });
      expect(gitInventoryProbe).toHaveBeenCalledOnce();
      expect(gitInventoryProbe).toHaveBeenCalledWith({
        maxEntries: 100_000,
        maxMetadataBytes: 134_217_728,
        repositoryRoot: '/workspace',
      });
    },
  );

  test('does not discover a working tree for compatibility', async () => {
    const workingTreeDiscovery = vi.fn<IGitWorkingTreeDiscovery>();
    const gitInventoryProbe = vi.fn<IGitInventoryProbe>();
    const executeCommand = createMoldeaCliCommandExecutor(workingTreeDiscovery, gitInventoryProbe);

    await expect(executeCommand(createCommandInput('compatibility'))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: 'cli:INTERNAL_ERROR The command could not be completed.\n',
      stdout: '',
    });
    expect(workingTreeDiscovery).not.toHaveBeenCalled();
    expect(gitInventoryProbe).not.toHaveBeenCalled();
  });

  test('returns a safe human Git discovery error', async () => {
    const workingTreeDiscovery = vi
      .fn<IGitWorkingTreeDiscovery>()
      .mockResolvedValue(Object.freeze({ errorCode: 'GIT_NOT_FOUND', kind: 'failed' }));
    const gitInventoryProbe = vi.fn<IGitInventoryProbe>();
    const executeCommand = createMoldeaCliCommandExecutor(workingTreeDiscovery, gitInventoryProbe);

    await expect(executeCommand(createCommandInput('validate'))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: 'git:GIT_NOT_FOUND The Git executable is unavailable.\n',
      stdout: '',
    });
    expect(gitInventoryProbe).not.toHaveBeenCalled();
  });

  test('returns a safe JSON Git discovery error', async () => {
    const workingTreeDiscovery = vi
      .fn<IGitWorkingTreeDiscovery>()
      .mockResolvedValue(Object.freeze({ errorCode: 'GIT_COMMAND_FAILED', kind: 'failed' }));
    const executeCommand = createMoldeaCliCommandExecutor(
      workingTreeDiscovery,
      vi.fn<IGitInventoryProbe>(),
    );

    await expect(executeCommand(createCommandInput('inspect', true))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: '',
      stdout:
        '{"cliVersion":"0.0.1","command":"inspect","error":{"code":"GIT_COMMAND_FAILED","details":{},"message":"The Git command failed.","path":null,"retryable":true,"source":"git"},"result":null,"schemaVersion":1,"status":"error"}\n',
    });
  });

  test('returns a safe inventory-probe failure without exposing candidates', async () => {
    const workingTreeDiscovery = vi
      .fn<IGitWorkingTreeDiscovery>()
      .mockResolvedValue(Object.freeze({ kind: 'discovered', repositoryRoot: '/workspace' }));
    const gitInventoryProbe = vi
      .fn<IGitInventoryProbe>()
      .mockResolvedValue(Object.freeze({ errorCode: 'RESOURCE_LIMIT_EXCEEDED', kind: 'failed' }));
    const executeCommand = createMoldeaCliCommandExecutor(workingTreeDiscovery, gitInventoryProbe);

    await expect(executeCommand(createCommandInput('inspect', true))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: '',
      stdout:
        '{"cliVersion":"0.0.1","command":"inspect","error":{"code":"RESOURCE_LIMIT_EXCEEDED","details":{},"message":"A resource limit was exceeded.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
    });
  });
});
