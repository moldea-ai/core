import type { IMoldeaCliGitErrorCode } from '../presentation/index.js';

// parsed numeric Git version used for compatibility decisions
export interface IGitVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

// successful Git prerequisite result
export interface IGitVersionSupportedResult {
  readonly kind: 'supported';
  readonly version: IGitVersion;
}

// safe Git prerequisite failure result
export interface IGitVersionFailedResult {
  readonly errorCode: IMoldeaCliGitErrorCode;
  readonly kind: 'failed';
}

// result of the Git prerequisite preflight
export type IGitVersionPreflightResult = IGitVersionSupportedResult | IGitVersionFailedResult;

// injectable Git prerequisite preflight
export type IGitVersionPreflight = () => Promise<IGitVersionPreflightResult>;
