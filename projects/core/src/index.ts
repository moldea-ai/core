export type { IFrameworkAdapterEvidence, IFrameworkAdapterEvidenceKind } from './adapter.js';
export { DEFAULT_CORE_RESOURCE_LIMITS, SUPPORTED_REPOSITORY_FORMAT_VERSIONS } from './constants.js';
export type {
  IContentDigest,
  IContentDigestResult,
  ICore,
  ICoreOptions,
  ICoreResourceLimits,
  IDecisionParseResult,
  IIndexedAgent,
  IIndexedContextAsset,
  IIndexedDecision,
  IIndexedDescriptionAsset,
  IIndexedManifest,
  IIndexedMirror,
  IIndexedRuntimeGuidance,
  IIndexedTextAsset,
  IManifestParseResult,
  IMoldeaProjectIndex,
  INormalizedText,
  IProjectInspectionInput,
  IProjectInspectionResult,
  ITextDocumentContent,
  ITextDocumentInput,
  ITextNormalizationResult,
} from './contracts.js';
export { createCore } from './core.js';
export type {
  IAdapterDiagnostic,
  ICoreDiagnostic,
  ICoreDiagnosticCode,
  IDiagnostic,
  IDiagnosticDetails,
  IDiagnosticEntity,
  ISourcePosition,
  ISourceRange,
} from './diagnostics.js';
export {
  CoreConfigurationException,
  CoreOperationException,
  type ICoreConfigurationErrorCode,
  type ICoreConfigurationExceptionOptions,
  type ICoreOperation,
  type ICoreOperationErrorCode,
  type ICoreOperationExceptionOptions,
} from './exceptions.js';
