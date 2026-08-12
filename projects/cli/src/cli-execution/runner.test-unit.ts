// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import { MOLDEA_CLI_TOP_LEVEL_HELP } from '../presentation/index.js';

import { runMoldeaCli } from './runner.js';
import type { IMoldeaCliCommandExecutor } from './types.js';

describe('runMoldeaCli', () => {
  test('returns top-level help without dispatching a command', async () => {
    const executeCommand = vi.fn<IMoldeaCliCommandExecutor>();

    await expect(
      runMoldeaCli({ cliVersion: '0.0.1', commandLineArguments: [], executeCommand }),
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
        cliVersion: '0.0.1',
        commandLineArguments: [command, '--help'],
        executeCommand,
      }),
    ).resolves.toStrictEqual({ exitCode: 0, stderr: '', stdout: expectedHelp });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  test('returns the exact installed version without dispatching a command', async () => {
    const executeCommand = vi.fn<IMoldeaCliCommandExecutor>();

    await expect(
      runMoldeaCli({
        cliVersion: '0.0.1',
        commandLineArguments: ['--version'],
        executeCommand,
      }),
    ).resolves.toStrictEqual({ exitCode: 0, stderr: '', stdout: '0.0.1\n' });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  test('isolates human usage failures on stderr', async () => {
    await expect(
      runMoldeaCli({ cliVersion: '0.0.1', commandLineArguments: ['unknown'] }),
    ).resolves.toStrictEqual({
      exitCode: 2,
      stderr: 'cli:INVALID_ARGUMENT The command invocation is invalid.\n',
      stdout: '',
    });
  });

  test('isolates JSON usage failures on stdout with a null unresolved command', async () => {
    await expect(
      runMoldeaCli({ cliVersion: '0.0.1', commandLineArguments: ['--json'] }),
    ).resolves.toStrictEqual({
      exitCode: 2,
      stderr: '',
      stdout:
        '{"cliVersion":"0.0.1","command":null,"error":{"code":"INVALID_ARGUMENT","details":{},"message":"The command invocation is invalid.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
    });
  });

  test('dispatches one immutable normalized command', async () => {
    const executionResult = { exitCode: 0, stderr: '', stdout: 'complete\n' };
    const executeCommand = vi.fn<IMoldeaCliCommandExecutor>().mockResolvedValue(executionResult);

    await expect(
      runMoldeaCli({
        cliVersion: '0.0.1',
        commandLineArguments: ['validate', '--json'],
        executeCommand,
      }),
    ).resolves.toBe(executionResult);
    expect(executeCommand).toHaveBeenCalledOnce();
    expect(executeCommand).toHaveBeenCalledWith({
      cliVersion: '0.0.1',
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
    });
  });

  test('reports unavailable and failed command execution as a safe operational error', async () => {
    await expect(
      runMoldeaCli({ cliVersion: '0.0.1', commandLineArguments: ['compatibility'] }),
    ).resolves.toStrictEqual({
      exitCode: 3,
      stderr: 'cli:INTERNAL_ERROR The command could not be completed.\n',
      stdout: '',
    });

    const executeCommand = vi
      .fn<IMoldeaCliCommandExecutor>()
      .mockRejectedValue(new Error('private host path: /tmp/private'));

    await expect(
      runMoldeaCli({
        cliVersion: '0.0.1',
        commandLineArguments: ['inspect', '--json'],
        executeCommand,
      }),
    ).resolves.toStrictEqual({
      exitCode: 3,
      stderr: '',
      stdout:
        '{"cliVersion":"0.0.1","command":"inspect","error":{"code":"INTERNAL_ERROR","details":{},"message":"The command could not be completed.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
    });
  });
});
