import type {
  ICoreConfigurationErrorCode,
  ICoreOperationErrorCode,
  IDiagnostic,
  IProjectInspectionResult,
} from '@moldea.ai/core';
import type { IRepositorySourceErrorCode } from '@moldea.ai/repository';

import type { IMoldeaCliCommand } from '../command-line/index.js';

import type { MOLDEA_CLI_ERROR_DEFINITIONS } from './constants.js';

// errors owned directly by the CLI executable and its Git integration
export type IMoldeaCliOwnedErrorCode = keyof typeof MOLDEA_CLI_ERROR_DEFINITIONS;

// operational error codes observable through the current executable foundation
export type IMoldeaCliErrorCode =
  | IMoldeaCliOwnedErrorCode
  | IRepositorySourceErrorCode
  | ICoreConfigurationErrorCode
  | ICoreOperationErrorCode;

// Git-specific errors produced by CLI-owned Git operations
export type IMoldeaCliGitErrorCode = Extract<IMoldeaCliOwnedErrorCode, `GIT_${string}`>;

// safe error sources exposed by the CLI
export type IMoldeaCliErrorSource = 'cli' | 'git' | 'repository' | 'core';

// safe operational error fields shared by human and JSON presentation
export interface IMoldeaCliError {
  readonly code: IMoldeaCliErrorCode;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
  readonly message: string;
  readonly path: string | null;
  readonly retryable: boolean;
  readonly source: IMoldeaCliErrorSource;
}

// source descriptor shared by validation and inspection results
export interface IMoldeaCliSource {
  readonly kind: 'git-working-tree';
}

// content-minimized validation result derived from one complete Core inspection
export interface IMoldeaCliValidateResult {
  readonly diagnostics: readonly IDiagnostic[];
  readonly formatVersion: IProjectInspectionResult['formatVersion'];
  readonly source: IMoldeaCliSource;
}

// complete inspection result paired with its non-confidential source descriptor
export interface IMoldeaCliInspectResult {
  readonly inspection: IProjectInspectionResult;
  readonly source: IMoldeaCliSource;
}

// error-only envelope implemented before command result composition
export interface IMoldeaCliJsonErrorEnvelope {
  readonly cliVersion: string;
  readonly command: IMoldeaCliCommand | null;
  readonly error: IMoldeaCliError;
  readonly result: null;
  readonly schemaVersion: 1;
  readonly status: 'error';
}

// version 1 JSON envelope for a completed validate command
export interface IMoldeaCliJsonValidateEnvelope {
  readonly cliVersion: string;
  readonly command: 'validate';
  readonly error: null;
  readonly result: IMoldeaCliValidateResult;
  readonly schemaVersion: 1;
  readonly status: 'valid' | 'invalid';
}

// version 1 JSON envelope for a completed inspect command
export interface IMoldeaCliJsonInspectEnvelope {
  readonly cliVersion: string;
  readonly command: 'inspect';
  readonly error: null;
  readonly result: IMoldeaCliInspectResult;
  readonly schemaVersion: 1;
  readonly status: 'valid' | 'invalid';
}
