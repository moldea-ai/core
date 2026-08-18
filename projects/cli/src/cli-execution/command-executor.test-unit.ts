// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import {
  CoreOperationException,
  type IContentDigest,
  type IIndexedTextAsset,
  type IProjectInspectionResult,
} from '@moldea.ai/core';
import { parseRepositoryPath, type IRepositoryReader } from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

import type { IMoldeaCliCommand } from '../command-line/index.js';
import type { IMoldeaCliCompatibilityResolver } from '../compatibility/index.js';
import type { IMoldeaCliCoreInspectionExecutor } from '../core-composition/index.js';
import type { IGitWorkingTreeDiscovery } from '../git-working-tree/index.js';
import type { IMoldeaCliOwnedErrorCode } from '../presentation/index.js';
import { MOLDEA_CLI_RELEASE_METADATA } from '../release-metadata/index.js';
import { GitContentTransformUnsupportedException } from '../repository-content-transformation-guard/index.js';
import type {
  IWorkingTreeSnapshotExecutionInput,
  IWorkingTreeSnapshotExecutionResult,
  IWorkingTreeSnapshotExecutor,
} from '../working-tree-snapshot/index.js';

import { createMoldeaCliCommandExecutor } from './command-executor.js';
import type { IMoldeaCliCommandExecutionInput } from './types.js';

const INSTALLED_PACKAGE_METADATA = Object.freeze({
  dependencies: Object.freeze({
    '@moldea.ai/adapter-anthropic': 'workspace:2.0.1',
    '@moldea.ai/adapter-google-genai': 'workspace:1.0.0',
    '@moldea.ai/adapter-openai': 'workspace:2.0.3',
    '@moldea.ai/core': 'workspace:2.0.0',
    '@moldea.ai/repository': 'workspace:1.0.1',
    '@moldea.ai/repository-fs': 'workspace:1.0.1',
    semver: '7.8.5',
  }),
  installedPackageVersions: Object.freeze({
    '@moldea.ai/adapter-anthropic': '2.0.1',
    '@moldea.ai/adapter-google-genai': '1.0.0',
    '@moldea.ai/adapter-openai': '2.0.3',
    '@moldea.ai/core': '2.0.0',
    '@moldea.ai/repository': '1.0.1',
    '@moldea.ai/repository-fs': '1.0.1',
  }),
  supportedNodeRange: '^22.11.0 || ^24.11.0',
  version: '3.1.0',
});

/** Creates one normalized command execution input. */
const createCommandInput = (
  command: IMoldeaCliCommand,
  isJson = false,
): IMoldeaCliCommandExecutionInput => ({
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
  packageMetadata: INSTALLED_PACKAGE_METADATA,
  releaseMetadata: MOLDEA_CLI_RELEASE_METADATA,
});

/** Creates one immutable ASCII text asset for command-result composition tests. */
const createTextAsset = (path: string, content: string): IIndexedTextAsset =>
  Object.freeze({
    content,
    digest: `sha256:${path}` as IContentDigest,
    path: parseRepositoryPath(path),
    scalarLength: content.length,
    utf8ByteLength: content.length,
  });

/** Creates one contract-complete valid Core result without invoking the mocked dependency. */
const createValidInspection = (): IProjectInspectionResult => {
  const manifestAsset = createTextAsset('/moldea/moldea.yaml', 'version: 1\n');

  return Object.freeze({
    diagnostics: Object.freeze([]),
    evidence: Object.freeze([]),
    formatVersion: 1,
    project: Object.freeze({
      agents: Object.freeze([]),
      context: Object.freeze([]),
      decisions: Object.freeze([]),
      formatVersion: 1,
      manifest: Object.freeze({
        asset: manifestAsset,
        value: Object.freeze({ version: 1 as const }),
      }),
      project: createTextAsset('/moldea/project.md', '# Project\n'),
      runtimes: Object.freeze([]),
      unresolved: Object.freeze({}),
    }),
    valid: true,
  });
};

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
  readonly reader: IRepositoryReader;
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
    const result =
      input.signal === undefined
        ? await input.operation(reader)
        : await input.operation(reader, input.signal);

    execution.operationCalls += 1;

    return Object.freeze({ kind: 'completed', result });
  };

  return { execution, executor, reader };
};

/** Creates one generic safe snapshot failure executor. */
const createFailedSnapshotExecutor =
  (errorCode: IMoldeaCliOwnedErrorCode): IWorkingTreeSnapshotExecutor =>
  () =>
    Promise.resolve(Object.freeze({ errorCode, kind: 'failed' }));

describe('createMoldeaCliCommandExecutor', () => {
  test('returns a valid human result after one bounded validation snapshot', async () => {
    const workingTreeDiscovery = vi
      .fn<IGitWorkingTreeDiscovery>()
      .mockResolvedValue(Object.freeze({ kind: 'discovered', repositoryRoot: '/workspace' }));
    const snapshot = createCompletedSnapshotExecutor();
    const coreInspection = vi.fn<IMoldeaCliCoreInspectionExecutor>().mockResolvedValue(
      Object.freeze({
        diagnostics: Object.freeze([]),
        evidence: Object.freeze([]),
        formatVersion: 1,
        project: null,
        valid: true,
      }),
    );
    const executeCommand = createMoldeaCliCommandExecutor(
      workingTreeDiscovery,
      snapshot.executor,
      coreInspection,
    );

    await expect(executeCommand(createCommandInput('validate'))).resolves.toStrictEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'The moldea project is valid.\nRepository format: 1\n',
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
    expect(coreInspection).toHaveBeenCalledOnce();
    expect(coreInspection).toHaveBeenCalledWith({
      repository: snapshot.reader,
      resourceLimits: {
        maxDiagnostics: 10_000,
        maxEntries: 100_000,
        maxEvidence: 10_000,
        maxFileBytes: 8_388_608,
        maxManifestBytes: 2_097_152,
        maxTotalBytes: 134_217_728,
      },
    });
  });

  test('forwards one operation signal through discovery, snapshot, and Core', async () => {
    const controller = new AbortController();
    const workingTreeDiscovery = vi
      .fn<IGitWorkingTreeDiscovery>()
      .mockResolvedValue(Object.freeze({ kind: 'discovered', repositoryRoot: '/workspace' }));
    const snapshot = createCompletedSnapshotExecutor();
    const coreInspection = vi
      .fn<IMoldeaCliCoreInspectionExecutor>()
      .mockResolvedValue(createValidInspection());
    const executeCommand = createMoldeaCliCommandExecutor(
      workingTreeDiscovery,
      snapshot.executor,
      coreInspection,
    );

    await executeCommand({
      ...createCommandInput('validate'),
      signal: controller.signal,
    });

    expect(workingTreeDiscovery).toHaveBeenCalledWith({
      invocationDirectory: '/workspace',
      repositoryDirectory: null,
      signal: controller.signal,
    });
    expect(coreInspection).toHaveBeenCalledWith({
      repository: snapshot.reader,
      resourceLimits: createCommandInput('validate').invocation.options.resourceLimits,
      signal: controller.signal,
    });
  });

  test('returns a structurally invalid JSON validation result without project or evidence', async () => {
    const workingTreeDiscovery = vi
      .fn<IGitWorkingTreeDiscovery>()
      .mockResolvedValue(Object.freeze({ kind: 'discovered', repositoryRoot: '/workspace' }));
    const snapshot = createCompletedSnapshotExecutor();
    const coreInspection = vi.fn<IMoldeaCliCoreInspectionExecutor>().mockResolvedValue(
      Object.freeze({
        diagnostics: Object.freeze([
          Object.freeze({
            code: 'MOLDEA_MANIFEST_MISSING' as const,
            details: Object.freeze({}),
            entity: null,
            message: 'The project manifest is missing.',
            path: parseRepositoryPath('/moldea/moldea.yaml'),
            pointer: null,
            range: null,
            source: 'core' as const,
          }),
        ]),
        evidence: Object.freeze([]),
        formatVersion: null,
        project: null,
        valid: false,
      }),
    );
    const executeCommand = createMoldeaCliCommandExecutor(
      workingTreeDiscovery,
      snapshot.executor,
      coreInspection,
    );

    const result = await executeCommand(createCommandInput('validate', true));

    expect(result).toStrictEqual({
      exitCode: 1,
      stderr: '',
      stdout:
        '{"cliVersion":"3.1.0","command":"validate","error":null,"result":{"diagnostics":[{"code":"MOLDEA_MANIFEST_MISSING","details":{},"entity":null,"message":"The project manifest is missing.","path":"/moldea/moldea.yaml","pointer":null,"range":null,"source":"core"}],"formatVersion":null,"source":{"kind":"git-working-tree"}},"schemaVersion":1,"status":"invalid"}\n',
    });
    const envelope = JSON.parse(result.stdout) as {
      readonly result: Readonly<Record<string, unknown>>;
    };

    expect(envelope.result).not.toHaveProperty('evidence');
    expect(envelope.result).not.toHaveProperty('project');
  });

  test('returns a valid human inspection result after one completed snapshot', async () => {
    const workingTreeDiscovery = vi
      .fn<IGitWorkingTreeDiscovery>()
      .mockResolvedValue(Object.freeze({ kind: 'discovered', repositoryRoot: '/workspace' }));
    const snapshot = createCompletedSnapshotExecutor();
    const coreInspection = vi
      .fn<IMoldeaCliCoreInspectionExecutor>()
      .mockResolvedValue(createValidInspection());
    const executeCommand = createMoldeaCliCommandExecutor(
      workingTreeDiscovery,
      snapshot.executor,
      coreInspection,
    );

    await expect(executeCommand(createCommandInput('inspect'))).resolves.toStrictEqual({
      exitCode: 0,
      stderr: '',
      stdout: `The moldea project is valid.
Repository format: 1
Context assets: 0
Decisions: 0
Runtime-guidance assets: 0
Agents: 0
Mirrors: 0
Adapter evidence items: 0
`,
    });
    expect(snapshot.execution.operationCalls).toBe(1);
    expect(coreInspection).toHaveBeenCalledOnce();
  });

  test('returns a structurally invalid JSON inspection with the complete Core result', async () => {
    const workingTreeDiscovery = vi
      .fn<IGitWorkingTreeDiscovery>()
      .mockResolvedValue(Object.freeze({ kind: 'discovered', repositoryRoot: '/workspace' }));
    const snapshot = createCompletedSnapshotExecutor();
    const coreInspection = vi.fn<IMoldeaCliCoreInspectionExecutor>().mockResolvedValue(
      Object.freeze({
        diagnostics: Object.freeze([
          Object.freeze({
            code: 'MOLDEA_MANIFEST_MISSING' as const,
            details: Object.freeze({}),
            entity: null,
            message: 'The project manifest is missing.',
            path: parseRepositoryPath('/moldea/moldea.yaml'),
            pointer: null,
            range: null,
            source: 'core' as const,
          }),
        ]),
        evidence: Object.freeze([]),
        formatVersion: null,
        project: null,
        valid: false,
      }),
    );
    const executeCommand = createMoldeaCliCommandExecutor(
      workingTreeDiscovery,
      snapshot.executor,
      coreInspection,
    );

    await expect(executeCommand(createCommandInput('inspect', true))).resolves.toStrictEqual({
      exitCode: 1,
      stderr: '',
      stdout:
        '{"cliVersion":"3.1.0","command":"inspect","error":null,"result":{"inspection":{"diagnostics":[{"code":"MOLDEA_MANIFEST_MISSING","details":{},"entity":null,"message":"The project manifest is missing.","path":"/moldea/moldea.yaml","pointer":null,"range":null,"source":"core"}],"evidence":[],"formatVersion":null,"project":null,"valid":false},"source":{"kind":"git-working-tree"}},"schemaVersion":1,"status":"invalid"}\n',
    });
  });

  test('maps a contradictory completed Core result to the safe internal error', async () => {
    const workingTreeDiscovery = vi
      .fn<IGitWorkingTreeDiscovery>()
      .mockResolvedValue(Object.freeze({ kind: 'discovered', repositoryRoot: '/workspace' }));
    const snapshot = createCompletedSnapshotExecutor();
    const coreInspection = vi.fn<IMoldeaCliCoreInspectionExecutor>().mockResolvedValue(
      Object.freeze({
        diagnostics: Object.freeze([]),
        evidence: Object.freeze([]),
        formatVersion: 1,
        project: null,
        valid: true,
      }),
    );
    const executeCommand = createMoldeaCliCommandExecutor(
      workingTreeDiscovery,
      snapshot.executor,
      coreInspection,
    );

    await expect(executeCommand(createCommandInput('inspect', true))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: '',
      stdout:
        '{"cliVersion":"3.1.0","command":"inspect","error":{"code":"INTERNAL_ERROR","details":{},"message":"The command could not be completed.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
    });
  });

  test('does not discover a working tree for compatibility', async () => {
    const workingTreeDiscovery = vi.fn<IGitWorkingTreeDiscovery>();
    const snapshot = createCompletedSnapshotExecutor();
    const executeCommand = createMoldeaCliCommandExecutor(workingTreeDiscovery, snapshot.executor);

    const result = await executeCommand(createCommandInput('compatibility', true));
    const envelope = JSON.parse(result.stdout) as {
      readonly command: string;
      readonly result: {
        readonly adapters: readonly { readonly id: string }[];
        readonly matrixVersion: number;
      };
      readonly status: string;
    };

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(envelope).toMatchObject({
      command: 'compatibility',
      result: { matrixVersion: 1 },
      status: 'valid',
    });
    expect(envelope.result.adapters.map(({ id }) => id)).toStrictEqual([
      'anthropic',
      'claude-agent-sdk',
      'cloudflare-agents',
      'custom',
      'eve',
      'google-genai',
      'langchain',
      'langgraph',
      'openai',
      'openai-agents-sdk',
      'vercel-ai-sdk',
    ]);
    expect(workingTreeDiscovery).not.toHaveBeenCalled();
    expect(snapshot.execution.calls).toBe(0);
  });

  test.each(['validate', 'inspect', 'compatibility'] as const)(
    'rejects invalid installed compatibility before %s side effects',
    async (command) => {
      const workingTreeDiscovery = vi.fn<IGitWorkingTreeDiscovery>();
      const snapshot = createCompletedSnapshotExecutor();
      const coreInspection = vi.fn<IMoldeaCliCoreInspectionExecutor>();
      const compatibilityResolver = vi
        .fn<IMoldeaCliCompatibilityResolver>()
        .mockReturnValue(Object.freeze({ kind: 'invalid' }));
      const executeCommand = createMoldeaCliCommandExecutor(
        workingTreeDiscovery,
        snapshot.executor,
        coreInspection,
        compatibilityResolver,
      );

      await expect(executeCommand(createCommandInput(command, true))).resolves.toStrictEqual({
        exitCode: 3,
        stderr: '',
        stdout: `{"cliVersion":"3.1.0","command":"${command}","error":{"code":"COMPATIBILITY_STATE_INVALID","details":{},"message":"The installed compatibility state is invalid.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n`,
      });
      expect(workingTreeDiscovery).not.toHaveBeenCalled();
      expect(snapshot.execution.calls).toBe(0);
      expect(coreInspection).not.toHaveBeenCalled();
    },
  );

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
        '{"cliVersion":"3.1.0","command":"inspect","error":{"code":"GIT_COMMAND_FAILED","details":{},"message":"The Git command failed.","path":null,"retryable":true,"source":"git"},"result":null,"schemaVersion":1,"status":"error"}\n',
    });
  });

  test.each([
    [
      'GIT_OPERATION_ABORTED',
      '{"cliVersion":"3.1.0","command":"inspect","error":{"code":"GIT_OPERATION_ABORTED","details":{},"message":"The Git operation was aborted.","path":null,"retryable":true,"source":"git"},"result":null,"schemaVersion":1,"status":"error"}\n',
    ],
    [
      'RESOURCE_LIMIT_EXCEEDED',
      '{"cliVersion":"3.1.0","command":"inspect","error":{"code":"RESOURCE_LIMIT_EXCEEDED","details":{},"message":"A resource limit was exceeded.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
    ],
    [
      'WORKING_TREE_UNSTABLE',
      '{"cliVersion":"3.1.0","command":"inspect","error":{"code":"WORKING_TREE_UNSTABLE","details":{},"message":"The working tree did not remain stable.","path":null,"retryable":true,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
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

  test('maps a guarded Core read to the safe Git transformation error', async () => {
    const workingTreeDiscovery = vi
      .fn<IGitWorkingTreeDiscovery>()
      .mockResolvedValue(Object.freeze({ kind: 'discovered', repositoryRoot: '/workspace' }));
    const snapshot = createCompletedSnapshotExecutor();
    const coreInspection = vi
      .fn<IMoldeaCliCoreInspectionExecutor>()
      .mockRejectedValue(
        new GitContentTransformUnsupportedException(parseRepositoryPath('/assets/model.bin')),
      );
    const executeCommand = createMoldeaCliCommandExecutor(
      workingTreeDiscovery,
      snapshot.executor,
      coreInspection,
    );

    await expect(executeCommand(createCommandInput('inspect', true))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: '',
      stdout:
        '{"cliVersion":"3.1.0","command":"inspect","error":{"code":"GIT_CONTENT_TRANSFORM_UNSUPPORTED","details":{},"message":"The requested file uses an unsupported Git content transformation.","path":"/assets/model.bin","retryable":false,"source":"git"},"result":null,"schemaVersion":1,"status":"error"}\n',
    });
  });

  test('maps a Core operation failure without exposing its cause', async () => {
    const workingTreeDiscovery = vi
      .fn<IGitWorkingTreeDiscovery>()
      .mockResolvedValue(Object.freeze({ kind: 'discovered', repositoryRoot: '/workspace' }));
    const snapshot = createCompletedSnapshotExecutor();
    const coreInspection = vi.fn<IMoldeaCliCoreInspectionExecutor>().mockRejectedValue(
      new CoreOperationException({
        adapterId: 'openai',
        cause: new Error('private adapter detail'),
        code: 'ADAPTER_EXECUTION_FAILED',
        operation: 'validate-adapter',
      }),
    );
    const executeCommand = createMoldeaCliCommandExecutor(
      workingTreeDiscovery,
      snapshot.executor,
      coreInspection,
    );

    await expect(executeCommand(createCommandInput('validate', true))).resolves.toStrictEqual({
      exitCode: 3,
      stderr: '',
      stdout:
        '{"cliVersion":"3.1.0","command":"validate","error":{"code":"ADAPTER_EXECUTION_FAILED","details":{"adapterId":"openai","operation":"validate-adapter"},"message":"A runtime adapter failed during inspection.","path":null,"retryable":false,"source":"core"},"result":null,"schemaVersion":1,"status":"error"}\n',
    });
  });
});
