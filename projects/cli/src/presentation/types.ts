import type { IMoldeaCliArgumentErrorCode, IMoldeaCliCommand } from '../command-line/index.js';

// CLI-owned error codes observable through the current executable foundation
export type IMoldeaCliErrorCode = IMoldeaCliArgumentErrorCode | 'INTERNAL_ERROR';

// safe error fields serialized in version 1 JSON output
export interface IMoldeaCliJsonError {
  readonly code: IMoldeaCliErrorCode;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
  readonly message: string;
  readonly path: null;
  readonly retryable: false;
  readonly source: 'cli';
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
