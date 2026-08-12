import { execFile, type ExecFileException } from 'node:child_process';
import process from 'node:process';

import { GIT_PROCESS_GLOBAL_ARGUMENTS } from './constants.js';
import { createGitProcessEnvironment } from './environment.js';
import type { IGitProcessFailureReason, IGitProcessExecutor, IGitProcessResult } from './types.js';

/**
 * Classifies a subprocess error without retaining provider diagnostics.
 * @param error The Node.js subprocess error.
 * @param stderr The bounded process diagnostic used only for classification.
 * @returns The normalized failure reason.
 */
const classifyGitProcessError = (
  error: ExecFileException,
  stderr: Buffer,
): IGitProcessFailureReason => {
  const errorCode = typeof error.code === 'string' ? error.code.toUpperCase() : '';

  if (errorCode === 'ENOENT') {
    return 'not-found';
  }

  if (errorCode === 'EACCES' || errorCode === 'EPERM') {
    return 'access-denied';
  }

  if (errorCode === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return 'output-limit-exceeded';
  }

  const diagnostic = stderr.toString('utf8');

  if (diagnostic.startsWith('fatal: not a git repository')) {
    return 'repository-not-found';
  }

  if (
    diagnostic.startsWith('fatal: detected dubious ownership in repository at ') ||
    (diagnostic.startsWith('fatal: ') && /: Permission denied(?:\r?\n)?$/u.test(diagnostic))
  ) {
    return 'access-denied';
  }

  return 'command-failed';
};

/**
 * Executes Git directly with trusted arguments, a sanitized environment, and bounded output.
 * @param options The trusted arguments, environment, and output limit.
 * @returns A promise that resolves to normalized process output or failure.
 */
export const executeGitProcess: IGitProcessExecutor = async (options): Promise<IGitProcessResult> =>
  new Promise((resolve) => {
    execFile(
      'git',
      [...GIT_PROCESS_GLOBAL_ARGUMENTS, ...options.arguments],
      {
        encoding: 'buffer',
        env: createGitProcessEnvironment(options.environment ?? process.env),
        maxBuffer: options.maxBufferBytes,
        shell: false,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
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
