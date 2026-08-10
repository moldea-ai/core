import type { IRepositoryPath, IRepositoryReader } from '@moldea.ai/repository';

import type { IFrameworkAdapter, IFrameworkAdapterEvidence } from './adapter.js';
import type { ICoreDiagnostic, IDiagnostic } from './diagnostics.js';
import type {
  IAgentManifestEntry,
  IMoldeaManifestV1,
  IParsedDecision,
  IRelationshipManifestEntry,
  IRepositoryFormatVersion,
  IUnresolvedRequirementManifestEntry,
} from './format.js';

// immutable operation budgets and Core construction inputs
export interface ICoreResourceLimits {
  readonly maxEntries: number;
  readonly maxTotalBytesRead: number;
  readonly maxFileBytes: number;
  readonly maxManifestBytes: number;
  readonly maxDiagnostics: number;
}

export interface ICoreOptions {
  readonly adapters?: readonly IFrameworkAdapter[];
  readonly limits?: Partial<ICoreResourceLimits>;
}

// caller-supplied text input and deterministic normalization output
export type ITextDocumentContent = string | Uint8Array;

export interface ITextDocumentInput {
  readonly path: IRepositoryPath;
  readonly content: ITextDocumentContent;
}

export interface INormalizedText {
  readonly value: string;
  readonly utf8ByteLength: number;
  readonly scalarLength: number;
}

export interface ITextNormalizationResult {
  readonly valid: boolean;
  readonly text: INormalizedText | null;
  readonly diagnostics: readonly ICoreDiagnostic[];
}

declare const contentDigestBrand: unique symbol;

// normalized SHA-256 digest and the result that owns it
export type IContentDigest = string & {
  readonly [contentDigestBrand]: true;
};

export interface IContentDigestResult {
  readonly valid: boolean;
  readonly text: INormalizedText | null;
  readonly digest: IContentDigest | null;
  readonly diagnostics: readonly ICoreDiagnostic[];
}

// all-or-nothing document parsing results reserved by the public contract
export interface IManifestParseResult {
  readonly valid: boolean;
  readonly asset: IIndexedTextAsset | null;
  readonly manifest: IMoldeaManifestV1 | null;
  readonly diagnostics: readonly ICoreDiagnostic[];
}

export interface IDecisionParseResult {
  readonly valid: boolean;
  readonly decision: IParsedDecision | null;
  readonly diagnostics: readonly ICoreDiagnostic[];
}

// repository-level inspection input and final structural result
export interface IProjectInspectionInput {
  readonly repository: IRepositoryReader;
  readonly signal?: AbortSignal;
}

export interface IProjectInspectionResult {
  readonly valid: boolean;
  readonly formatVersion: IRepositoryFormatVersion | null;
  readonly project: IMoldeaProjectIndex | null;
  readonly evidence: readonly IFrameworkAdapterEvidence[];
  readonly diagnostics: readonly IDiagnostic[];
}

// normalized immutable assets that compose a valid project index
export interface IIndexedTextAsset {
  readonly path: IRepositoryPath;
  readonly content: string;
  readonly digest: IContentDigest;
  readonly utf8ByteLength: number;
  readonly scalarLength: number;
}

export interface IIndexedDescriptionAsset {
  readonly asset: IIndexedTextAsset;
  readonly value: string;
  readonly scalarLength: number;
}

export interface IIndexedContextAsset {
  readonly asset: IIndexedTextAsset;
  readonly relationships: IRelationshipManifestEntry | null;
}

export interface IIndexedDecision {
  readonly decision: IParsedDecision;
  readonly relationships: IRelationshipManifestEntry | null;
}

export interface IIndexedRuntimeGuidance {
  readonly asset: IIndexedTextAsset;
}

export interface IIndexedMirror {
  readonly path: IRepositoryPath;
  readonly digest: IContentDigest;
  readonly canonicalDigest: IContentDigest;
}

export interface IIndexedAgent {
  readonly id: string;
  readonly declaration: IAgentManifestEntry;
  readonly description: IIndexedDescriptionAsset;
  readonly instruction: IIndexedTextAsset;
  readonly handoffDescription: IIndexedDescriptionAsset | null;
  readonly context: readonly IRepositoryPath[];
  readonly decisions: readonly IRepositoryPath[];
  readonly mirrors: readonly IIndexedMirror[];
}

export interface IIndexedManifest {
  readonly asset: IIndexedTextAsset;
  readonly value: IMoldeaManifestV1;
}

export interface IMoldeaProjectIndex {
  readonly formatVersion: 1;
  readonly manifest: IIndexedManifest;
  readonly project: IIndexedTextAsset;
  readonly context: readonly IIndexedContextAsset[];
  readonly decisions: readonly IIndexedDecision[];
  readonly runtimes: readonly IIndexedRuntimeGuidance[];
  readonly agents: readonly IIndexedAgent[];
  readonly unresolved: Readonly<Record<string, IUnresolvedRequirementManifestEntry>>;
}

// immutable document-level Core operations available in the current behavioral slice
export interface ICore {
  /**
   * Validates and normalizes one supplied text document.
   * @param input The logical path and decoded string or exact source bytes.
   * @returns The frozen normalized text or structural text diagnostics.
   * @throws
   * - INVALID_REPOSITORY_PATH: The repository path is invalid.
   * - INVALID_ARGUMENT: The Core operation received an invalid argument.
   * - RESOURCE_LIMIT_EXCEEDED: A Core resource limit was exceeded.
   */
  normalizeText(input: ITextDocumentInput): ITextNormalizationResult;

  /**
   * Calculates a normalized SHA-256 digest for one supplied text document.
   * @param input The logical path and decoded string or exact source bytes.
   * @returns A promise resolving to the frozen digest result or structural text diagnostics.
   * @throws
   * - INVALID_REPOSITORY_PATH: The repository path is invalid.
   * - INVALID_ARGUMENT: The Core operation received an invalid argument.
   * - RESOURCE_LIMIT_EXCEEDED: A Core resource limit was exceeded.
   */
  calculateContentDigest(input: ITextDocumentInput): Promise<IContentDigestResult>;
}
