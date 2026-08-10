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

export type IContentDigest = string & {
  readonly [contentDigestBrand]: true;
};

export interface IContentDigestResult {
  readonly valid: boolean;
  readonly text: INormalizedText | null;
  readonly digest: IContentDigest | null;
  readonly diagnostics: readonly ICoreDiagnostic[];
}

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

export interface ICore {
  normalizeText(input: ITextDocumentInput): ITextNormalizationResult;

  calculateContentDigest(input: ITextDocumentInput): Promise<IContentDigestResult>;
}
