import type { IMoldeaCliGitErrorCode } from '../presentation/index.js';

import type { GIT_TRACKED_ENTRY_MODES } from './constants.js';
import type { IGitInventoryEntry } from './entry-type/index.js';

// Git index modes retained for later entry-type classification
export type IGitTrackedEntryMode = (typeof GIT_TRACKED_ENTRY_MODES)[number];

// Git index stages accepted from an unmerged or ordinary index entry
export type IGitTrackedEntryStage = 0 | 1 | 2 | 3;

// one strictly parsed selected-repository tracked candidate
export interface IGitTrackedInventoryCandidate {
  readonly kind: 'tracked';
  readonly mode: IGitTrackedEntryMode;
  readonly path: string;
  readonly stage: IGitTrackedEntryStage;
}

// one strictly parsed non-ignored untracked candidate
export interface IGitUntrackedInventoryCandidate {
  readonly kind: 'untracked';
  readonly path: string;
}

// raw candidate retained before type and logical-path normalization
export type IGitInventoryCandidate =
  IGitTrackedInventoryCandidate | IGitUntrackedInventoryCandidate;

// operational errors that can terminate a raw Git inventory probe
export type IGitInventoryProbeErrorCode = IMoldeaCliGitErrorCode | 'RESOURCE_LIMIT_EXCEEDED';

// limits and selected repository root for one normalized inventory probe
export interface IGitInventoryProbeInput {
  readonly maxEntries: number;
  readonly maxMetadataBytes: number;
  readonly repositoryRoot: string;
}

// complete immutable selected-repository entry set from one probe
export interface IGitInventoryProbedResult {
  readonly entries: readonly IGitInventoryEntry[];
  readonly kind: 'probed';
}

// safe terminal failure from one raw inventory probe
export interface IGitInventoryProbeFailedResult {
  readonly errorCode: IGitInventoryProbeErrorCode;
  readonly kind: 'failed';
}

// all-or-nothing normalized inventory probe result
export type IGitInventoryProbeResult = IGitInventoryProbeFailedResult | IGitInventoryProbedResult;

// injectable normalized inventory probe boundary
export type IGitInventoryProbe = (
  input: IGitInventoryProbeInput,
) => Promise<IGitInventoryProbeResult>;

// parser failure categories distinguished for safe CLI error mapping
export type IGitInventoryParserFailureReason = 'entry-limit-exceeded' | 'invalid';

// successful result from one strict NUL-delimited parser
export interface IGitInventoryParserCompletedResult<TCandidate extends IGitInventoryCandidate> {
  readonly candidates: readonly TCandidate[];
  readonly kind: 'completed';
}

// failed result from one strict NUL-delimited parser
export interface IGitInventoryParserFailedResult {
  readonly kind: 'failed';
  readonly reason: IGitInventoryParserFailureReason;
}

// all-or-nothing strict parser result
export type IGitInventoryParserResult<TCandidate extends IGitInventoryCandidate> =
  IGitInventoryParserCompletedResult<TCandidate> | IGitInventoryParserFailedResult;

// incremental parser boundary used by the streaming Git process executor
export interface IGitInventoryParser<TCandidate extends IGitInventoryCandidate> {
  consume(chunk: Uint8Array): void;
  finish(): IGitInventoryParserResult<TCandidate>;
}
