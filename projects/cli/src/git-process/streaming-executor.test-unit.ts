// @vitest-environment node
import { type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, test, vi } from 'vitest';

interface ISpawnTestOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly shell: false;
  readonly signal?: AbortSignal;
  readonly stdio: readonly ['ignore' | 'pipe', 'pipe', 'pipe'];
  readonly windowsHide: true;
}

type ISpawnTestDouble = (
  command: string,
  arguments_: string[],
  options: ISpawnTestOptions,
) => ChildProcessWithoutNullStreams;

const { spawnTestDouble } = vi.hoisted(() => ({
  spawnTestDouble: vi.fn<ISpawnTestDouble>(),
}));

vi.mock('node:child_process', () => ({ spawn: spawnTestDouble }));

import { GIT_PROCESS_GLOBAL_ARGUMENTS } from './constants.js';
import { executeGitStreamingProcess } from './streaming-executor.js';

interface ITestChildProcess {
  readonly childProcess: ChildProcessWithoutNullStreams;
  readonly kill: ReturnType<typeof vi.fn<() => boolean>>;
  readonly stderr: PassThrough;
  readonly stdin: PassThrough;
  readonly stdout: PassThrough;
}

/** Creates the minimal evented child-process surface used by the executor. */
const createTestChildProcess = (): ITestChildProcess => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const kill = vi.fn<() => boolean>(() => true);
  const childProcess = Object.assign(new EventEmitter(), {
    kill,
    stderr,
    stdin,
    stdio: [stdin, stdout, stderr],
    stdout,
  }) as unknown as ChildProcessWithoutNullStreams;

  return { childProcess, kill, stderr, stdin, stdout };
};

describe('executeGitStreamingProcess', () => {
  beforeEach(() => {
    spawnTestDouble.mockReset();
  });

  test('executes Git directly and consumes stdout incrementally without retaining it', async () => {
    const testProcess = createTestChildProcess();
    const chunks: Uint8Array[] = [];

    spawnTestDouble.mockReturnValue(testProcess.childProcess);

    const resultPromise = executeGitStreamingProcess({
      arguments: ['ls-files', '-z'],
      consumeStdout: (chunk) => chunks.push(chunk),
      environment: {
        GIT_DIR: '/unsafe/repository',
        HOME: '/safe/home',
        PATH: '/safe/bin',
      },
      maxStderrBytes: 16,
      maxStdoutBytes: 16,
    });

    testProcess.stdout.write(Buffer.from('first'));
    testProcess.stdout.write(Buffer.from('second'));
    testProcess.childProcess.emit('close', 0);

    const result = await resultPromise;

    expect(result).toStrictEqual({ kind: 'completed', stderr: new Uint8Array(), stdoutBytes: 11 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(chunks).toStrictEqual([
      Uint8Array.from(Buffer.from('first')),
      Uint8Array.from(Buffer.from('second')),
    ]);
    expect(spawnTestDouble).toHaveBeenCalledWith(
      'git',
      [...GIT_PROCESS_GLOBAL_ARGUMENTS, 'ls-files', '-z'],
      expect.objectContaining({
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }),
    );
    const processEnvironment = spawnTestDouble.mock.calls[0]?.[2].env;

    expect(processEnvironment).toMatchObject({
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
      HOME: '/safe/home',
      PATH: '/safe/bin',
    });
    expect(processEnvironment).not.toHaveProperty('GIT_DIR');
  });

  test('terminates Git when stdout exceeds its independent byte limit', async () => {
    const testProcess = createTestChildProcess();

    spawnTestDouble.mockReturnValue(testProcess.childProcess);

    const resultPromise = executeGitStreamingProcess({
      arguments: ['ls-files'],
      consumeStdout: vi.fn(),
      maxStderrBytes: 16,
      maxStdoutBytes: 2,
    });

    testProcess.stdout.write(Buffer.from('123'));
    testProcess.childProcess.emit('close', null);

    await expect(resultPromise).resolves.toStrictEqual({
      kind: 'failed',
      reason: 'stdout-limit-exceeded',
    });
    expect(testProcess.kill).toHaveBeenCalledOnce();
  });

  test('terminates Git when stderr exceeds its independent diagnostic limit', async () => {
    const testProcess = createTestChildProcess();

    spawnTestDouble.mockReturnValue(testProcess.childProcess);

    const resultPromise = executeGitStreamingProcess({
      arguments: ['ls-files'],
      consumeStdout: vi.fn(),
      maxStderrBytes: 2,
      maxStdoutBytes: 16,
    });

    testProcess.stderr.write(Buffer.from('123'));
    testProcess.childProcess.emit('close', null);

    await expect(resultPromise).resolves.toStrictEqual({
      kind: 'failed',
      reason: 'stderr-limit-exceeded',
    });
    expect(testProcess.kill).toHaveBeenCalledOnce();
  });

  test('writes one detached stdin snapshot and closes the piped stream', async () => {
    const testProcess = createTestChildProcess();
    const stdinChunks: Buffer[] = [];
    const stdin = new Uint8Array([1, 2, 3]);

    testProcess.stdin.on('data', (chunk: Buffer) => stdinChunks.push(chunk));
    spawnTestDouble.mockReturnValue(testProcess.childProcess);

    const resultPromise = executeGitStreamingProcess({
      arguments: ['check-attr', '--stdin', '-z', 'filter'],
      consumeStdout: vi.fn(),
      maxStderrBytes: 16,
      maxStdoutBytes: 16,
      stdin,
    });

    stdin.fill(9);
    testProcess.childProcess.emit('close', 0);

    await expect(resultPromise).resolves.toStrictEqual({
      kind: 'completed',
      stderr: new Uint8Array(),
      stdoutBytes: 0,
    });
    expect(Buffer.concat(stdinChunks)).toStrictEqual(Buffer.from([1, 2, 3]));
    expect(testProcess.stdin.writableEnded).toBe(true);
    expect(spawnTestDouble).toHaveBeenCalledWith(
      'git',
      [...GIT_PROCESS_GLOBAL_ARGUMENTS, 'check-attr', '--stdin', '-z', 'filter'],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
    );
  });

  test('normalizes a piped stdin failure and terminates Git', async () => {
    const testProcess = createTestChildProcess();

    spawnTestDouble.mockReturnValue(testProcess.childProcess);

    const resultPromise = executeGitStreamingProcess({
      arguments: ['check-attr', '--stdin', '-z', 'filter'],
      consumeStdout: vi.fn(),
      maxStderrBytes: 16,
      maxStdoutBytes: 16,
      stdin: new Uint8Array([1]),
    });

    testProcess.stdin.emit('error', new Error('private pipe failure'));
    testProcess.childProcess.emit('close', null);

    await expect(resultPromise).resolves.toStrictEqual({
      kind: 'failed',
      reason: 'command-failed',
    });
    expect(testProcess.kill).toHaveBeenCalledOnce();
  });

  test('classifies a nonzero Git result from bounded stderr', async () => {
    const testProcess = createTestChildProcess();

    spawnTestDouble.mockReturnValue(testProcess.childProcess);

    const resultPromise = executeGitStreamingProcess({
      arguments: ['ls-files'],
      consumeStdout: vi.fn(),
      maxStderrBytes: 128,
      maxStdoutBytes: 16,
    });

    testProcess.stderr.write(Buffer.from('fatal: not a git repository\n'));
    testProcess.childProcess.emit('close', 128);

    await expect(resultPromise).resolves.toStrictEqual({
      kind: 'failed',
      reason: 'repository-not-found',
    });
  });

  test('rejects a stdout-consumer failure and terminates the child process', async () => {
    const testProcess = createTestChildProcess();
    const consumerError = new Error('parser failure');

    spawnTestDouble.mockReturnValue(testProcess.childProcess);

    const resultPromise = executeGitStreamingProcess({
      arguments: ['ls-files'],
      consumeStdout: () => {
        throw consumerError;
      },
      maxStderrBytes: 16,
      maxStdoutBytes: 16,
    });

    testProcess.stdout.write(Buffer.from('record'));
    testProcess.childProcess.emit('close', null);

    await expect(resultPromise).rejects.toBe(consumerError);
    expect(testProcess.kill).toHaveBeenCalledOnce();
  });

  test('classifies a process launch failure without waiting for close', async () => {
    const testProcess = createTestChildProcess();

    spawnTestDouble.mockReturnValue(testProcess.childProcess);

    const resultPromise = executeGitStreamingProcess({
      arguments: ['ls-files'],
      consumeStdout: vi.fn(),
      maxStderrBytes: 16,
      maxStdoutBytes: 16,
    });

    testProcess.childProcess.emit(
      'error',
      Object.assign(new Error('private executable path'), { code: 'ENOENT' }),
    );

    await expect(resultPromise).resolves.toStrictEqual({ kind: 'failed', reason: 'not-found' });
  });

  test('does not launch Git for an already-aborted streamed operation', async () => {
    const controller = new AbortController();

    controller.abort();

    await expect(
      executeGitStreamingProcess({
        arguments: ['ls-files'],
        consumeStdout: vi.fn(),
        maxStderrBytes: 16,
        maxStdoutBytes: 16,
        signal: controller.signal,
      }),
    ).resolves.toStrictEqual({ kind: 'failed', reason: 'aborted' });
    expect(spawnTestDouble).not.toHaveBeenCalled();
  });

  test('normalizes an in-flight streamed abort exactly once', async () => {
    const controller = new AbortController();
    const testProcess = createTestChildProcess();

    spawnTestDouble.mockReturnValue(testProcess.childProcess);

    const resultPromise = executeGitStreamingProcess({
      arguments: ['ls-files'],
      consumeStdout: vi.fn(),
      maxStderrBytes: 16,
      maxStdoutBytes: 16,
      signal: controller.signal,
    });

    expect(spawnTestDouble.mock.calls[0]?.[2].signal).toBe(controller.signal);
    controller.abort(new Error('private cancellation reason'));
    testProcess.childProcess.emit(
      'error',
      Object.assign(new Error('aborted'), { code: 'ABORT_ERR' }),
    );
    testProcess.childProcess.emit('close', null);

    await expect(resultPromise).resolves.toStrictEqual({ kind: 'failed', reason: 'aborted' });
  });
});
