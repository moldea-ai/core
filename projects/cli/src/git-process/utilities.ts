import type { IGitProcessFailureReason } from './types.js';

/**
 * Classifies a subprocess error without retaining provider diagnostics.
 * @param error The Node.js subprocess error, or null for a nonzero exit.
 * @param stderr The bounded process diagnostic used only for classification.
 * @returns The normalized failure reason.
 */
export const classifyGitProcessError = (
  error: unknown,
  stderr: Uint8Array,
): IGitProcessFailureReason => {
  const errorCode =
    error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code.toUpperCase()
      : '';

  if (errorCode === 'ENOENT') {
    return 'not-found';
  }

  if (errorCode === 'EACCES' || errorCode === 'EPERM') {
    return 'access-denied';
  }

  if (errorCode === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return 'output-limit-exceeded';
  }

  const diagnostic = new TextDecoder().decode(stderr);

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
