import { parseRepositoryPath, type IRepositoryReader } from '@moldea.ai/repository';
import {
  CoreConfigurationException,
  CoreOperationException,
  DEFAULT_CORE_RESOURCE_LIMITS,
  SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
  createCore,
  type IAdapterDiagnostic,
  type IContentDigest,
  type IContentDigestResult,
  type ICore,
  type ICoreConfigurationErrorCode,
  type ICoreConfigurationExceptionOptions,
  type ICoreDiagnostic,
  type ICoreDiagnosticCode,
  type ICoreOperation,
  type ICoreOperationErrorCode,
  type ICoreOperationExceptionOptions,
  type ICoreOptions,
  type ICoreResourceLimits,
  type IDecisionParseResult,
  type IDiagnostic,
  type IDiagnosticDetails,
  type IDiagnosticEntity,
  type IFrameworkAdapterEvidence,
  type IFrameworkAdapterEvidenceKind,
  type IIndexedAgent,
  type IIndexedContextAsset,
  type IIndexedDecision,
  type IIndexedDescriptionAsset,
  type IIndexedManifest,
  type IIndexedMirror,
  type IIndexedRuntimeGuidance,
  type IIndexedTextAsset,
  type IManifestParseResult,
  type IMoldeaProjectIndex,
  type INormalizedText,
  type IProjectInspectionInput,
  type IProjectInspectionResult,
  type ISourcePosition,
  type ISourceRange,
  type ITextDocumentContent,
  type ITextDocumentInput,
  type ITextNormalizationResult,
} from '@moldea.ai/core';
import type {
  IAdapterDiagnostic as IAdapterSubpathDiagnostic,
  IFrameworkAdapter,
  IFrameworkAdapterContext,
  IFrameworkAdapterEvidence as IAdapterSubpathEvidence,
  IFrameworkAdapterEvidenceKind as IAdapterSubpathEvidenceKind,
  IFrameworkAdapterResult,
} from '@moldea.ai/core/adapter';
import type {
  IAgentBindingsManifestEntry,
  IAgentManifestEntry,
  IDecisionStatus,
  IFrameworkManifestEntry,
  IMoldeaManifestV1,
  IParsedDecision,
  IRelationshipManifestEntry,
  IRepositoryFormatVersion,
  IRepositoryReference,
  IRuntimeVariableManifestEntry,
  ISkillManifestEntry,
  IToolManifestEntry,
  IUnresolvedRequirementEffect,
  IUnresolvedRequirementManifestEntry,
} from '@moldea.ai/core/format';
// @ts-expect-error Repository format version 1 has no manifest handoff relationship.
import type { IHandoffManifestEntry } from '@moldea.ai/core/format';

type IRootSurface = readonly [
  IAdapterDiagnostic,
  IContentDigest,
  IContentDigestResult,
  ICore,
  ICoreConfigurationErrorCode,
  ICoreConfigurationExceptionOptions,
  ICoreDiagnostic,
  ICoreDiagnosticCode,
  ICoreOperation,
  ICoreOperationErrorCode,
  ICoreOperationExceptionOptions,
  ICoreOptions,
  ICoreResourceLimits,
  IDecisionParseResult,
  IDiagnostic,
  IDiagnosticDetails,
  IDiagnosticEntity,
  IFrameworkAdapterEvidence,
  IFrameworkAdapterEvidenceKind,
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
  ISourcePosition,
  ISourceRange,
  ITextDocumentContent,
  ITextDocumentInput,
  ITextNormalizationResult,
];

type IFormatSurface = readonly [
  IAgentBindingsManifestEntry,
  IAgentManifestEntry,
  IDecisionStatus,
  IFrameworkManifestEntry,
  IMoldeaManifestV1,
  IParsedDecision,
  IRelationshipManifestEntry,
  IRepositoryFormatVersion,
  IRepositoryReference,
  IRuntimeVariableManifestEntry,
  ISkillManifestEntry,
  IToolManifestEntry,
  IUnresolvedRequirementEffect,
  IUnresolvedRequirementManifestEntry,
];

type IAdapterSurface = readonly [
  IAdapterSubpathDiagnostic,
  IFrameworkAdapter,
  IFrameworkAdapterContext,
  IAdapterSubpathEvidence,
  IAdapterSubpathEvidenceKind,
  IFrameworkAdapterResult,
];

type IRemovedHandoffSurface = IHandoffManifestEntry;

declare const rootSurface: IRootSurface;
declare const formatSurface: IFormatSurface;
declare const adapterSurface: IAdapterSurface;
declare const removedHandoffSurface: IRemovedHandoffSurface;
declare const repository: IRepositoryReader;

const path = parseRepositoryPath('/moldea/project.md');
const adapter: IFrameworkAdapter = {
  id: 'test-adapter',
  inspect: () => Promise.resolve({ diagnostics: [], evidence: [] }),
  supportedRepositoryFormatVersions: [1],
};
const options: ICoreOptions = { adapters: [adapter], limits: { maxFileBytes: 1024 } };
const core: ICore = createCore(options);
const input: ITextDocumentInput = { content: 'project\n', path };
const normalized: ITextNormalizationResult = core.normalizeText(input);
const parsedManifest: Promise<IManifestParseResult> = core.parseManifest({
  content: 'version: 1\n',
  path: parseRepositoryPath('/moldea/moldea.yaml'),
});
const parsedDecision: Promise<IDecisionParseResult> = core.parseDecision({
  content: '---\nstatus: accepted\ncreatedAt: "2026-08-07T19:42:03.456Z"\n---\nBody.\n',
  path: parseRepositoryPath('/moldea/decisions/1786131723456-use-postgresql.md'),
});
const inspectedProject: Promise<IProjectInspectionResult> = core.inspectProject({ repository });
const configurationException = new CoreConfigurationException({
  code: 'INVALID_RESOURCE_LIMIT',
  operation: 'create-core',
});
const operationException = new CoreOperationException({
  code: 'RESOURCE_LIMIT_EXCEEDED',
  limit: 'maxFileBytes',
  operation: 'normalize-text',
  retryable: false,
});

if (SUPPORTED_REPOSITORY_FORMAT_VERSIONS[0] !== 1) {
  throw new Error('The packaged Core does not advertise repository format version 1.');
}

void [
  rootSurface,
  formatSurface,
  adapterSurface,
  DEFAULT_CORE_RESOURCE_LIMITS,
  normalized,
  inspectedProject,
  parsedDecision,
  parsedManifest,
  configurationException,
  operationException,
  removedHandoffSurface,
];
