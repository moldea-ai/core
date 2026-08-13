import { execFile } from 'node:child_process';
import process from 'node:process';

import { GIT_PROCESS_GLOBAL_ARGUMENTS } from './constants.js';
import { createGitProcessEnvironment } from './environment.js';
import type { IGitProcessExecutor, IGitProcessResult } from './types.js';
import { classifyGitProcessError } from './utilities.js';

/**
 * Executes Git directly with trusted arguments, a sanitized environment, and bounded output.
 * @param options The trusted arguments, environment, output limit, and optional signal.
 * @returns A promise that resolves to normalized process output or failure.
 */
export const executeGitProcess: IGitProcessExecutor = async (options): Promise<IGitProcessResult> =>
  new Promise((resolve) => {
    if (options.signal?.aborted) {
      resolve(Object.freeze({ kind: 'failed', reason: 'aborted' }));
      return;
    }

    execFile(
      'git',
      [...GIT_PROCESS_GLOBAL_ARGUMENTS, ...options.arguments],
      {
        encoding: 'buffer',
        env: createGitProcessEnvironment(options.environment ?? process.env),
        maxBuffer: options.maxBufferBytes,
        shell: false,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (options.signal?.aborted) {
          resolve(Object.freeze({ kind: 'failed', reason: 'aborted' }));
          return;
        }

        if (error) {
          resolve(
            Object.freeze({
              kind: 'failed',
              reason: classifyGitProcessError(error, stderr),
            }),
          );
          return;
        }

        resolve(
          Object.freeze({
            kind: 'completed',
            stdout: Uint8Array.from(stdout),
            stderr: Uint8Array.from(stderr),
          }),
        );
      },
    );
  });
