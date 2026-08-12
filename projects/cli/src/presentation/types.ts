import type { IMoldeaCliCommand } from '../command-line/index.js';

import type { MOLDEA_CLI_ERROR_DEFINITIONS } from './constants.js';

// error codes observable through the current executable foundation
export type IMoldeaCliErrorCode = keyof typeof MOLDEA_CLI_ERROR_DEFINITIONS;

// Git-specific errors produced by CLI-owned Git operations
export type IMoldeaCliGitErrorCode = Extract<IMoldeaCliErrorCode, `GIT_${string}`>;

// safe error sources exposed by the CLI
export type IMoldeaCliErrorSource =
  (typeof MOLDEA_CLI_ERROR_DEFINITIONS)[IMoldeaCliErrorCode]['source'];

// safe error fields serialized in version 1 JSON output
export interface IMoldeaCliJsonError {
  readonly code: IMoldeaCliErrorCode;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
  readonly message: string;
  readonly path: null;
  readonly retryable: boolean;
  readonly source: IMoldeaCliErrorSource;
}

// error-only envelope implemented before command result composition
export interface IMoldeaCliJsonErrorEnvelope {
  readonly cliVersion: string;
  readonly command: IMoldeaCliCommand | null;
  readonly error: IMoldeaCliJsonError;
  readonly result: null;
  readonly schemaVersion: 1;
  readonly status: 'error';
}
