import type { IGitInventoryProbeErrorCode } from '../types.js';
import type {
  IGitEntryTypeNormalizedEntry,
  IGitEntryTypeNormalizedTrackedEntry,
  IGitEntryTypeNormalizedUntrackedEntry,
} from '../entry-type/index.js';

import type { GIT_CONTENT_TRANSFORMATION_ATTRIBUTES } from './constants.js';

// Git attribute names retained for working-tree content-transformation safety
export type IGitContentTransformationAttribute =
  (typeof GIT_CONTENT_TRANSFORMATION_ATTRIBUTES)[number];

// exact effective Git attribute values for one inventory path
export interface IGitContentTransformationAttributeValues {
  readonly filter: string;
  readonly ident: string;
  readonly workingTreeEncoding: string;
}

// parser-owned attribute values associated with one exact Git-relative path
export interface IGitContentTransformationParsedAttributes extends IGitContentTransformationAttributeValues {
  readonly path: string;
}

// immutable content-transformation classification retained in inventory records
export interface IGitContentTransformationClassification extends IGitContentTransformationAttributeValues {
  readonly isGuarded: boolean;
}

// tracked inventory entry with effective content-transformation metadata
export interface IGitContentTransformationClassifiedTrackedEntry extends IGitEntryTypeNormalizedTrackedEntry {
  readonly contentTransformation: IGitContentTransformationClassification;
}

// untracked inventory entry with effective content-transformation metadata
export interface IGitContentTransformationClassifiedUntrackedEntry extends IGitEntryTypeNormalizedUntrackedEntry {
  readonly contentTransformation: IGitContentTransformationClassification;
}

// one existing inventory path after effective Git attribute classification
export type IGitContentTransformationClassifiedEntry =
  | IGitContentTransformationClassifiedTrackedEntry
  | IGitContentTransformationClassifiedUntrackedEntry;

// expected paths for one strict incremental Git attribute parser
export interface IGitContentTransformationParserInput {
  readonly paths: readonly string[];
}

// complete strict Git attribute parser output
export interface IGitContentTransformationParserCompletedResult {
  readonly attributes: readonly IGitContentTransformationParsedAttributes[];
  readonly kind: 'completed';
}

// malformed or contradictory Git attribute parser output
export interface IGitContentTransformationParserFailedResult {
  readonly kind: 'failed';
}

// all-or-nothing Git attribute parser result
export type IGitContentTransformationParserResult =
  IGitContentTransformationParserCompletedResult | IGitContentTransformationParserFailedResult;

// incremental parser boundary used by the streamed Git attribute command
export interface IGitContentTransformationParser {
  consume(chunk: Uint8Array): void;
  finish(): IGitContentTransformationParserResult;
}

// effective inventory and remaining Git metadata budget entering classification
export interface IGitContentTransformationClassifierInput {
  readonly entries: readonly IGitEntryTypeNormalizedEntry[];
  readonly maxMetadataBytes: number;
  readonly repositoryRoot: string;
}

// complete classified inventory and the Git metadata bytes it consumed
export interface IGitContentTransformationClassifiedResult {
  readonly entries: readonly IGitContentTransformationClassifiedEntry[];
  readonly gitMetadataBytes: number;
  readonly kind: 'classified';
}

// safe terminal failure from effective Git attribute classification
export interface IGitContentTransformationClassificationFailedResult {
  readonly errorCode: IGitInventoryProbeErrorCode;
  readonly kind: 'failed';
}

// all-or-nothing effective Git content-transformation classification result
export type IGitContentTransformationClassificationResult =
  IGitContentTransformationClassificationFailedResult | IGitContentTransformationClassifiedResult;

// injectable effective Git content-transformation classification boundary
export type IGitContentTransformationClassifier = (
  input: IGitContentTransformationClassifierInput,
) => Promise<IGitContentTransformationClassificationResult>;
