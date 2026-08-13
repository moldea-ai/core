import type {
  IGitInventoryCandidate,
  IGitInventoryProbeErrorCode,
  IGitTrackedEntryMode,
  IGitTrackedEntryStage,
} from '../types.js';

// one retained Git index entry after path-level collapse
export interface IGitInventoryIndexEntry {
  readonly mode: IGitTrackedEntryMode;
  readonly stage: IGitTrackedEntryStage;
}

// one path-level tracked candidate with deterministic index metadata
export interface ICollapsedGitTrackedInventoryCandidate {
  readonly indexEntries: readonly IGitInventoryIndexEntry[];
  readonly kind: 'tracked';
  readonly path: string;
}

// one path-level untracked candidate
export interface ICollapsedGitUntrackedInventoryCandidate {
  readonly kind: 'untracked';
  readonly path: string;
}

// one candidate after path-level stage collapse and deduplication
export type ICollapsedGitInventoryCandidate =
  ICollapsedGitTrackedInventoryCandidate | ICollapsedGitUntrackedInventoryCandidate;

// successful all-or-nothing candidate collapse
export interface IGitInventoryCandidatesCollapsedResult {
  readonly candidates: readonly ICollapsedGitInventoryCandidate[];
  readonly kind: 'collapsed';
}

// invalid duplicate or contradictory candidate state
export interface IGitInventoryCandidateCollapseFailedResult {
  readonly kind: 'failed';
}

// result of path-level candidate collapse
export type IGitInventoryCandidateCollapseResult =
  IGitInventoryCandidateCollapseFailedResult | IGitInventoryCandidatesCollapsedResult;

// supported no-follow host entry classifications
export type IGitInventoryHostEntryType = 'file' | 'symlink';

// no-follow filesystem observations required for entry classification
export interface IGitInventoryEntryStatistics {
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

// injectable no-follow filesystem stat boundary
export type IGitInventoryEntryLstat = (hostPath: string) => Promise<IGitInventoryEntryStatistics>;

// successful no-follow host entry inspection
export interface IGitInventoryHostEntryInspectedResult {
  readonly entryType: IGitInventoryHostEntryType | 'unsupported';
  readonly kind: 'inspected';
}

// candidate confirmed absent from the current working tree
export interface IGitInventoryHostEntryMissingResult {
  readonly kind: 'missing';
}

// safe no-follow host entry inspection failure
export interface IGitInventoryHostEntryInspectionFailedResult {
  readonly errorCode: IGitInventoryProbeErrorCode;
  readonly kind: 'failed';
}

// result of inspecting one current host entry without following its leaf
export type IGitInventoryHostEntryInspectionResult =
  | IGitInventoryHostEntryInspectedResult
  | IGitInventoryHostEntryInspectionFailedResult
  | IGitInventoryHostEntryMissingResult;

// injectable host entry inspection boundary
export type IGitInventoryEntryInspector = (
  repositoryRoot: string,
  candidatePath: string,
) => Promise<IGitInventoryHostEntryInspectionResult>;

// remaining metadata budget for one effective Git symlink configuration query
export interface IGitSymlinkConfigurationInput {
  readonly maxMetadataBytes: number;
  readonly repositoryRoot: string;
}

// successfully resolved effective Git symlink configuration
export interface IGitSymlinkConfigurationResolvedResult {
  readonly gitMetadataBytes: number;
  readonly isEnabled: boolean;
  readonly kind: 'resolved';
}

// safe effective Git symlink configuration failure
export interface IGitSymlinkConfigurationFailedResult {
  readonly errorCode: IGitInventoryProbeErrorCode;
  readonly kind: 'failed';
}

// result of resolving the selected repository's effective core.symlinks value
export type IGitSymlinkConfigurationResult =
  IGitSymlinkConfigurationFailedResult | IGitSymlinkConfigurationResolvedResult;

// injectable effective Git symlink configuration boundary
export type IGitSymlinkConfigurationResolver = (
  input: IGitSymlinkConfigurationInput,
) => Promise<IGitSymlinkConfigurationResult>;

// entry-type-normalized tracked path with retained Git index metadata
export interface IGitEntryTypeNormalizedTrackedEntry {
  readonly entryType: IGitInventoryHostEntryType;
  readonly indexEntries: readonly IGitInventoryIndexEntry[];
  readonly kind: 'tracked';
  readonly path: string;
  readonly requiresSymlinkOverlay: boolean;
}

// entry-type-normalized untracked path
export interface IGitEntryTypeNormalizedUntrackedEntry {
  readonly entryType: IGitInventoryHostEntryType;
  readonly kind: 'untracked';
  readonly path: string;
  readonly requiresSymlinkOverlay: false;
}

// one existing Git-relative path after entry-type normalization
export type IGitEntryTypeNormalizedEntry =
  IGitEntryTypeNormalizedTrackedEntry | IGitEntryTypeNormalizedUntrackedEntry;

// ownership-filtered candidates entering current entry-type normalization
export interface IGitInventoryEntryTypeNormalizerInput {
  readonly candidates: readonly IGitInventoryCandidate[];
  readonly maxMetadataBytes: number;
  readonly repositoryRoot: string;
}

// complete normalized current working-tree inventory
export interface IGitInventoryEntryTypeNormalizedResult {
  readonly entries: readonly IGitEntryTypeNormalizedEntry[];
  readonly gitMetadataBytes: number;
  readonly kind: 'normalized';
}

// safe entry-type normalization failure
export interface IGitInventoryEntryTypeNormalizationFailedResult {
  readonly errorCode: IGitInventoryProbeErrorCode;
  readonly kind: 'failed';
}

// all-or-nothing current entry-type normalization result
export type IGitInventoryEntryTypeNormalizationResult =
  IGitInventoryEntryTypeNormalizationFailedResult | IGitInventoryEntryTypeNormalizedResult;

// injectable current entry-type normalization boundary
export type IGitInventoryEntryTypeNormalizer = (
  input: IGitInventoryEntryTypeNormalizerInput,
) => Promise<IGitInventoryEntryTypeNormalizationResult>;
