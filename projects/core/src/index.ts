// framework adapter evidence contracts
export type { IFrameworkAdapterEvidence, IFrameworkAdapterEvidenceKind } from './adapter.js';

// supported versions and default resource limits
export { DEFAULT_CORE_RESOURCE_LIMITS, SUPPORTED_REPOSITORY_FORMAT_VERSIONS } from './constants.js';

// Core operation, result, and project-index contracts
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

// Core construction
export { createCore } from './core.js';

// diagnostic contracts
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

// exception contracts
export type {
  ICoreConfigurationErrorCode,
  ICoreConfigurationExceptionOptions,
  ICoreOperation,
  ICoreOperationErrorCode,
  ICoreOperationExceptionOptions,
} from './exceptions.js';

// exceptions
export { CoreConfigurationException, CoreOperationException } from './exceptions.js';
