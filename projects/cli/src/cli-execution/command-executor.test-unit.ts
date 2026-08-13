// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

import type { IMoldeaCliCommand } from '../command-line/index.js';
import type { IGitWorkingTreeDiscovery } from '../git-working-tree/index.js';
import type { IMoldeaCliErrorCode } from '../presentation/index.js';
import type {
  IWorkingTreeSnapshotExecutionInput,
  IWorkingTreeSnapshotExecutionResult,
  IWorkingTreeSnapshotExecutor,
} from '../working-tree-snapshot/index.js';

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

// observable state from one test snapshot executor
interface ITestSnapshotExecution {
  calls: number;
  operationCalls: number;
  repositoryRoot: string | null;
  resourceLimits: IMoldeaCliCommandExecutionInput['invocation']['options']['resourceLimits'] | null;
}

/** Creates a snapshot executor that records and completes its provisional operation. */
const createCompletedSnapshotExecutor = (): {
  readonly execution: ITestSnapshotExecution;
  readonly executor: IWorkingTreeSnapshotExecutor;
} => {
  const reader = createMemoryRepositoryReader([]);
  const execution: ITestSnapshotExecution = {
    calls: 0,
    operationCalls: 0,
    repositoryRoot: null,
    resourceLimits: null,
  };
  const executor = async <TResult>(
    input: IWorkingTreeSnapshotExecutionInput<TResult>,
  ): Promise<IWorkingTreeSnapshotExecutionResult<TResult>> => {
    execution.calls += 1;
    execution.repositoryRoot = input.repositoryRoot;
    execution.resourceLimits = input.resourceLimits;
    const result = await input.operation(reader);

    execution.operationCalls += 1;

    return Object.freeze({ kind: 'completed', result });
  };

  return { execution, executor };
};

/** Creates one generic safe snapshot failure executor. */
const createFailedSnapshotExecutor =
  (errorCode: IMoldeaCliErrorCode): IWorkingTreeSnapshotExecutor =>
  () =>
    Promise.resolve(Object.freeze({ errorCode, kind: 'failed' }));

describe('createMoldeaCliCommandExecutor', () => {
  test.each(['validate', 'inspect'] as const)(
    'discovers and executes one bounded working-tree snapshot for %s',
    async (command) => {
      const workingTreeDiscovery = vi
        .fn<IGitWorkingTreeDiscovery>()
        .mockResolvedValue(Object.freeze({ kind: 'discovered', repositoryRoot: '/workspace' }));
      const snapshot = createCompletedSnapshotExecutor();
      const executeCommand = createMoldeaCliCommandExecutor(
        workingTreeDiscovery,
        snapshot.executor,
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
      expect(snapshot.execution).toStrictEqual({
        calls: 1,
        operationCalls: 1,
        repositoryRoot: '/workspace',
        resourceLimits: {
          maxDiagnostics: 10_000,
          maxEntries: 100_000,
          maxEvidence: 10_000,
          maxFileBytes: 8_388_608,
          maxManifestBytes: 2_097_152,
          maxTotalBytes: 134_217_728,
        },
      });
    },
  );

  test('does not discover a working tree for compatibility', async () => {
    const workingTreeDiscovery = vi.fn<IGitWorkingTreeDiscovery>();
    const snapshot = createCompletedSnapshotExecutor();
    const executeCommand = createMoldeaCliCommandExecutor(workingTreeDiscovery, snapshot.executor);

    await expect(executeCommand(createCommandInput('compatibility'))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: 'cli:INTERNAL_ERROR The command could not be completed.\n',
      stdout: '',
    });
    expect(workingTreeDiscovery).not.toHaveBeenCalled();
    expect(snapshot.execution.calls).toBe(0);
  });

  test('returns a safe human Git discovery error', async () => {
    const workingTreeDiscovery = vi
      .fn<IGitWorkingTreeDiscovery>()
      .mockResolvedValue(Object.freeze({ errorCode: 'GIT_NOT_FOUND', kind: 'failed' }));
    const snapshot = createCompletedSnapshotExecutor();
    const executeCommand = createMoldeaCliCommandExecutor(workingTreeDiscovery, snapshot.executor);

    await expect(executeCommand(createCommandInput('validate'))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: 'git:GIT_NOT_FOUND The Git executable is unavailable.\n',
      stdout: '',
    });
    expect(snapshot.execution.calls).toBe(0);
  });

  test('returns a safe JSON Git discovery error', async () => {
    const workingTreeDiscovery = vi
      .fn<IGitWorkingTreeDiscovery>()
      .mockResolvedValue(Object.freeze({ errorCode: 'GIT_COMMAND_FAILED', kind: 'failed' }));
    const executeCommand = createMoldeaCliCommandExecutor(
      workingTreeDiscovery,
      createFailedSnapshotExecutor('INTERNAL_ERROR'),
    );

    await expect(executeCommand(createCommandInput('inspect', true))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: '',
      stdout:
        '{"cliVersion":"0.0.1","command":"inspect","error":{"code":"GIT_COMMAND_FAILED","details":{},"message":"The Git command failed.","path":null,"retryable":true,"source":"git"},"result":null,"schemaVersion":1,"status":"error"}\n',
    });
  });

  test.each([
    [
      'RESOURCE_LIMIT_EXCEEDED',
      '{"cliVersion":"0.0.1","command":"inspect","error":{"code":"RESOURCE_LIMIT_EXCEEDED","details":{},"message":"A resource limit was exceeded.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
    ],
    [
      'WORKING_TREE_UNSTABLE',
      '{"cliVersion":"0.0.1","command":"inspect","error":{"code":"WORKING_TREE_UNSTABLE","details":{},"message":"The working tree did not remain stable.","path":null,"retryable":true,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
    ],
  ] as const)('returns safe snapshot failure %s', async (errorCode, expectedOutput) => {
    const workingTreeDiscovery = vi
      .fn<IGitWorkingTreeDiscovery>()
      .mockResolvedValue(Object.freeze({ kind: 'discovered', repositoryRoot: '/workspace' }));
    const executeCommand = createMoldeaCliCommandExecutor(
      workingTreeDiscovery,
      createFailedSnapshotExecutor(errorCode),
    );

    await expect(executeCommand(createCommandInput('inspect', true))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: '',
      stdout: expectedOutput,
    });
  });
});
