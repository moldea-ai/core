// @vitest-environment node
import type { ExecFileException } from 'node:child_process';
import { beforeEach, describe, expect, test, vi } from 'vitest';

interface IExecFileTestOptions {
  readonly encoding: 'buffer';
  readonly env: NodeJS.ProcessEnv;
  readonly maxBuffer: number;
  readonly shell: false;
  readonly signal?: AbortSignal;
  readonly windowsHide: true;
}

type IExecFileTestCallback = (
  error: ExecFileException | null,
  stdout: Buffer,
  stderr: Buffer,
) => void;

type IExecFileTestDouble = (
  file: string,
  arguments_: string[],
  options: IExecFileTestOptions,
  callback: IExecFileTestCallback,
) => void;

const { execFileTestDouble } = vi.hoisted(() => ({
  execFileTestDouble: vi.fn<IExecFileTestDouble>(),
}));

vi.mock('node:child_process', () => ({ execFile: execFileTestDouble }));

import { GIT_PROCESS_GLOBAL_ARGUMENTS } from './constants.js';
import { executeGitProcess } from './executor.js';

/** Creates a subprocess error carrying one Node.js error code. */
const createProcessError = (code: string): ExecFileException =>
  Object.assign(new Error('private process diagnostic'), { code });

describe('executeGitProcess', () => {
  beforeEach(() => {
    execFileTestDouble.mockReset();
  });

  test('executes Git directly with fixed arguments, sanitized environment, and bounded output', async () => {
    execFileTestDouble.mockImplementation((_file, _arguments, _options, callback) => {
      callback(null, Buffer.from('git version 2.53.0\n'), Buffer.alloc(0));
    });

    const result = await executeGitProcess({
      arguments: ['--version'],
      environment: {
        GIT_DIR: '/unsafe/repository',
        HOME: '/safe/home',
        PATH: '/safe/bin',
      },
      maxBufferBytes: 4096,
    });

    expect(result).toStrictEqual({
      kind: 'completed',
      stderr: new Uint8Array(),
      stdout: Uint8Array.from(Buffer.from('git version 2.53.0\n')),
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(execFileTestDouble).toHaveBeenCalledOnce();
    expect(execFileTestDouble.mock.calls[0]?.[0]).toBe('git');
    expect(execFileTestDouble.mock.calls[0]?.[1]).toStrictEqual([
      ...GIT_PROCESS_GLOBAL_ARGUMENTS,
      '--version',
    ]);
    const processOptions = execFileTestDouble.mock.calls[0]?.[2];

    expect(processOptions).toMatchObject({
      encoding: 'buffer',
      maxBuffer: 4096,
      shell: false,
      windowsHide: true,
    });
    expect(processOptions?.env).toMatchObject({
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
      HOME: '/safe/home',
      PATH: '/safe/bin',
    });
    expect(processOptions?.env).not.toHaveProperty('GIT_DIR');
    expect(Object.isFrozen(processOptions?.env)).toBe(true);
  });

  test.each([
    ['ENOENT', 'not-found'],
    ['EACCES', 'access-denied'],
    ['EPERM', 'access-denied'],
    ['ERR_CHILD_PROCESS_STDIO_MAXBUFFER', 'output-limit-exceeded'],
    ['UNKNOWN_FAILURE', 'command-failed'],
  ] as const)('normalizes %s without exposing process diagnostics', async (code, reason) => {
    execFileTestDouble.mockImplementation((_file, _arguments, _options, callback) => {
      callback(
        createProcessError(code),
        Buffer.from('private stdout'),
        Buffer.from('private stderr'),
      );
    });

    await expect(
      executeGitProcess({ arguments: ['--version'], maxBufferBytes: 4096 }),
    ).resolves.toStrictEqual({ kind: 'failed', reason });
  });

  test.each([
    [
      'fatal: not a git repository (or any of the parent directories): .git\n',
      'repository-not-found',
    ],
    ["fatal: detected dubious ownership in repository at '/private/repository'\n", 'access-denied'],
    ["fatal: cannot change to '/private/repository': Permission denied\n", 'access-denied'],
    ["fatal: cannot change to '/private/repository': unknown failure\n", 'command-failed'],
  ] as const)('normalizes bounded Git diagnostic signatures', async (stderr, reason) => {
    execFileTestDouble.mockImplementation((_file, _arguments, _options, callback) => {
      callback(createProcessError('128'), Buffer.alloc(0), Buffer.from(stderr));
    });

    await expect(
      executeGitProcess({ arguments: ['rev-parse'], maxBufferBytes: 4096 }),
    ).resolves.toStrictEqual({ kind: 'failed', reason });
  });

  test('does not launch Git for an already-aborted operation', async () => {
    const controller = new AbortController();

    controller.abort();

    await expect(
      executeGitProcess({
        arguments: ['--version'],
        maxBufferBytes: 4096,
        signal: controller.signal,
      }),
    ).resolves.toStrictEqual({ kind: 'failed', reason: 'aborted' });
    expect(execFileTestDouble).not.toHaveBeenCalled();
  });

  test('normalizes an in-flight signal without exposing the abort reason', async () => {
    const controller = new AbortController();

    execFileTestDouble.mockImplementation((_file, _arguments, options, callback) => {
      expect(options.signal).toBe(controller.signal);
      controller.abort(new Error('private cancellation reason'));
      callback(createProcessError('ABORT_ERR'), Buffer.alloc(0), Buffer.alloc(0));
    });

    await expect(
      executeGitProcess({
        arguments: ['--version'],
        maxBufferBytes: 4096,
        signal: controller.signal,
      }),
    ).resolves.toStrictEqual({ kind: 'failed', reason: 'aborted' });
  });
});
