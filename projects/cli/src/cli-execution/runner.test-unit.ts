// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import { MOLDEA_CLI_TOP_LEVEL_HELP } from '../presentation/index.js';
import { MOLDEA_CLI_RELEASE_METADATA } from '../release-metadata/index.js';

import { runMoldeaCli } from './runner.js';
import type { IMoldeaCliCommandExecutor } from './types.js';

const INVOCATION_DIRECTORY = '/workspace';
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

describe('runMoldeaCli', () => {
  test('returns top-level help without dispatching a command', async () => {
    const executeCommand = vi.fn<IMoldeaCliCommandExecutor>();

    await expect(
      runMoldeaCli({
        commandLineArguments: [],
        executeCommand,
        invocationDirectory: INVOCATION_DIRECTORY,
        packageMetadata: INSTALLED_PACKAGE_METADATA,
        releaseMetadata: MOLDEA_CLI_RELEASE_METADATA,
      }),
    ).resolves.toStrictEqual({
      exitCode: 0,
      stderr: '',
      stdout: MOLDEA_CLI_TOP_LEVEL_HELP,
    });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  test.each([
    [
      'validate',
      `Usage: moldea validate [options]

Validate the current moldea project.

Options:
  --repository <path>                Select a Git working-tree directory.
  --json                             Emit one machine-readable JSON result.
  --no-color                         Disable ANSI styling in human output.
  --max-entries <integer>            Override the repository entry limit.
  --max-file-bytes <integer>         Override the per-file byte limit.
  --max-total-bytes <integer>        Override the total cached-byte limit.
  --max-manifest-bytes <integer>     Override the manifest byte limit.
  --max-diagnostics <integer>        Override the diagnostic count limit.
  --max-evidence <integer>           Override the adapter evidence count limit.
  --help                             Show this help.
`,
    ],
    [
      'inspect',
      `Usage: moldea inspect [options]

Inspect the current moldea project.

Options:
  --repository <path>                Select a Git working-tree directory.
  --json                             Emit one machine-readable JSON result.
  --no-color                         Disable ANSI styling in human output.
  --max-entries <integer>            Override the repository entry limit.
  --max-file-bytes <integer>         Override the per-file byte limit.
  --max-total-bytes <integer>        Override the total cached-byte limit.
  --max-manifest-bytes <integer>     Override the manifest byte limit.
  --max-diagnostics <integer>        Override the diagnostic count limit.
  --max-evidence <integer>           Override the adapter evidence count limit.
  --help                             Show this help.
`,
    ],
    [
      'compatibility',
      `Usage: moldea compatibility [options]

Report the installed CLI compatibility state.

Options:
  --json      Emit one machine-readable JSON result.
  --no-color  Disable ANSI styling in human output.
  --help      Show this help.
`,
    ],
  ])('returns exact %s help without dispatching a command', async (command, expectedHelp) => {
    const executeCommand = vi.fn<IMoldeaCliCommandExecutor>();

    await expect(
      runMoldeaCli({
        commandLineArguments: [command, '--help'],
        executeCommand,
        invocationDirectory: INVOCATION_DIRECTORY,
        packageMetadata: INSTALLED_PACKAGE_METADATA,
        releaseMetadata: MOLDEA_CLI_RELEASE_METADATA,
      }),
    ).resolves.toStrictEqual({ exitCode: 0, stderr: '', stdout: expectedHelp });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  test('returns the exact installed version without dispatching a command', async () => {
    const executeCommand = vi.fn<IMoldeaCliCommandExecutor>();

    await expect(
      runMoldeaCli({
        commandLineArguments: ['--version'],
        executeCommand,
        invocationDirectory: INVOCATION_DIRECTORY,
        packageMetadata: INSTALLED_PACKAGE_METADATA,
        releaseMetadata: MOLDEA_CLI_RELEASE_METADATA,
      }),
    ).resolves.toStrictEqual({ exitCode: 0, stderr: '', stdout: '3.1.0\n' });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  test('isolates human usage failures on stderr', async () => {
    await expect(
      runMoldeaCli({
        commandLineArguments: ['unknown'],
        invocationDirectory: INVOCATION_DIRECTORY,
        packageMetadata: INSTALLED_PACKAGE_METADATA,
        releaseMetadata: MOLDEA_CLI_RELEASE_METADATA,
      }),
    ).resolves.toStrictEqual({
      exitCode: 2,
      stderr: 'cli:INVALID_ARGUMENT The command invocation is invalid.\n',
      stdout: '',
    });
  });

  test('isolates JSON usage failures on stdout with a null unresolved command', async () => {
    await expect(
      runMoldeaCli({
        commandLineArguments: ['--json'],
        invocationDirectory: INVOCATION_DIRECTORY,
        packageMetadata: INSTALLED_PACKAGE_METADATA,
        releaseMetadata: MOLDEA_CLI_RELEASE_METADATA,
      }),
    ).resolves.toStrictEqual({
      exitCode: 2,
      stderr: '',
      stdout:
        '{"cliVersion":"3.1.0","command":null,"error":{"code":"INVALID_ARGUMENT","details":{},"message":"The command invocation is invalid.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
    });
  });

  test('dispatches one immutable normalized command', async () => {
    const controller = new AbortController();
    const executionResult = { exitCode: 0, stderr: '', stdout: 'complete\n' };
    const executeCommand = vi.fn<IMoldeaCliCommandExecutor>().mockResolvedValue(executionResult);

    await expect(
      runMoldeaCli({
        commandLineArguments: ['validate', '--json'],
        executeCommand,
        invocationDirectory: INVOCATION_DIRECTORY,
        packageMetadata: INSTALLED_PACKAGE_METADATA,
        releaseMetadata: MOLDEA_CLI_RELEASE_METADATA,
        signal: controller.signal,
      }),
    ).resolves.toBe(executionResult);
    expect(executeCommand).toHaveBeenCalledOnce();
    expect(executeCommand).toHaveBeenCalledWith({
      invocationDirectory: INVOCATION_DIRECTORY,
      invocation: {
        command: 'validate',
        options: {
          isColorDisabled: false,
          isJson: true,
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
      signal: controller.signal,
    });
  });

  test('reports compatibility and maps failed command execution to a safe error', async () => {
    const compatibilityResult = await runMoldeaCli({
      commandLineArguments: ['compatibility', '--json'],
      invocationDirectory: INVOCATION_DIRECTORY,
      packageMetadata: INSTALLED_PACKAGE_METADATA,
      releaseMetadata: MOLDEA_CLI_RELEASE_METADATA,
    });

    expect(compatibilityResult.exitCode).toBe(0);
    expect(compatibilityResult.stderr).toBe('');
    expect(JSON.parse(compatibilityResult.stdout)).toMatchObject({
      cliVersion: '3.1.0',
      command: 'compatibility',
      result: { matrixVersion: 1 },
      status: 'valid',
    });

    const executeCommand = vi
      .fn<IMoldeaCliCommandExecutor>()
      .mockRejectedValue(new Error('private host path: /tmp/private'));

    await expect(
      runMoldeaCli({
        commandLineArguments: ['inspect', '--json'],
        executeCommand,
        invocationDirectory: INVOCATION_DIRECTORY,
        packageMetadata: INSTALLED_PACKAGE_METADATA,
        releaseMetadata: MOLDEA_CLI_RELEASE_METADATA,
      }),
    ).resolves.toStrictEqual({
      exitCode: 3,
      stderr: '',
      stdout:
        '{"cliVersion":"3.1.0","command":"inspect","error":{"code":"INTERNAL_ERROR","details":{},"message":"The command could not be completed.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
    });
  });
});
