import { spawn } from 'node:child_process';
import process from 'node:process';

import { GIT_PROCESS_GLOBAL_ARGUMENTS } from './constants.js';
import { createGitProcessEnvironment } from './environment.js';
import type {
  IGitStreamingProcessExecutor,
  IGitStreamingProcessFailureReason,
  IGitStreamingProcessResult,
} from './types.js';
import { classifyGitProcessError } from './utilities.js';

/** Concatenates the bounded stderr chunks retained for classification. */
const concatenateChunks = (chunks: readonly Buffer[], byteLength: number): Uint8Array =>
  Uint8Array.from(Buffer.concat(chunks, byteLength));

/**
 * Executes Git directly while consuming bounded stdout incrementally.
 * @param options The trusted arguments, stream consumer, environment, and independent limits.
 * @returns A promise that resolves to a normalized streamed process result.
 */
export const executeGitStreamingProcess: IGitStreamingProcessExecutor = async (
  options,
): Promise<IGitStreamingProcessResult> =>
  new Promise((resolve, reject) => {
    const stderrChunks: Buffer[] = [];
    let failureReason: IGitStreamingProcessFailureReason | null = null;
    let isSettled = false;
    let stderrBytes = 0;
    let stdoutBytes = 0;

    const childProcess = spawn('git', [...GIT_PROCESS_GLOBAL_ARGUMENTS, ...options.arguments], {
      env: createGitProcessEnvironment(options.environment ?? process.env),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    childProcess.stdout.on('data', (chunk: Buffer) => {
      if (failureReason !== null || isSettled) {
        return;
      }

      if (stdoutBytes + chunk.byteLength > options.maxStdoutBytes) {
        failureReason = 'stdout-limit-exceeded';
        childProcess.kill();
        return;
      }

      stdoutBytes += chunk.byteLength;

      try {
        options.consumeStdout(Uint8Array.from(chunk));
      } catch (error) {
        isSettled = true;
        childProcess.kill();
        reject(
          error instanceof Error
            ? error
            : new Error('The Git stdout consumer failed.', { cause: error }),
        );
      }
    });

    childProcess.stderr.on('data', (chunk: Buffer) => {
      if (failureReason !== null || isSettled) {
        return;
      }

      if (stderrBytes + chunk.byteLength > options.maxStderrBytes) {
        failureReason = 'stderr-limit-exceeded';
        childProcess.kill();
        return;
      }

      stderrBytes += chunk.byteLength;
      stderrChunks.push(chunk);
    });

    childProcess.on('error', (error) => {
      if (failureReason !== null || isSettled) {
        return;
      }

      isSettled = true;
      resolve(
        Object.freeze({
          kind: 'failed',
          reason: classifyGitProcessError(error, concatenateChunks(stderrChunks, stderrBytes)),
        }),
      );
    });

    childProcess.on('close', (exitCode) => {
      if (isSettled) {
        return;
      }

      isSettled = true;

      if (failureReason !== null) {
        resolve(Object.freeze({ kind: 'failed', reason: failureReason }));
        return;
      }

      const stderr = concatenateChunks(stderrChunks, stderrBytes);

      if (exitCode !== 0) {
        resolve(
          Object.freeze({
            kind: 'failed',
            reason: classifyGitProcessError(null, stderr),
          }),
        );
        return;
      }

      resolve(Object.freeze({ kind: 'completed', stderr, stdoutBytes }));
    });
  });
