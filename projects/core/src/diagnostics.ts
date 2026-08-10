import type { IRepositoryPath } from '@moldea.ai/repository';

// scalar-based normalized source coordinates
export interface ISourcePosition {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export interface ISourceRange {
  readonly start: ISourcePosition;
  readonly end: ISourcePosition;
}

// diagnostic entity and JSON-safe metadata contracts
export type ICapabilityKind = 'tool' | 'skill';

export interface IDiagnosticEntity {
  readonly agentId?: string;
  readonly capabilityKind?: ICapabilityKind;
  readonly capabilityId?: string;
  readonly decisionId?: string;
  readonly variableId?: string;
  readonly adapterId?: string;
}

export type IDiagnosticDetails = Readonly<Record<string, string | number | boolean | null>>;

// closed repository-format version 1 structural diagnostic catalog
export type ICoreDiagnosticCode =
  | 'MOLDEA_MANIFEST_MISSING'
  | 'MOLDEA_MANIFEST_PATH_INVALID'
  | 'MOLDEA_PROJECT_FILE_MISSING'
  | 'MOLDEA_PROJECT_FILE_EMPTY'
  | 'MOLDEA_ENTRY_TYPE_INVALID'
  | 'MOLDEA_CANONICAL_PATH_UNRECOGNIZED'
  | 'MOLDEA_CANONICAL_ASSET_SYMLINK'
  | 'MOLDEA_TEXT_INVALID_UTF8'
  | 'MOLDEA_TEXT_INVALID_UNICODE'
  | 'MOLDEA_TEXT_NUL_FORBIDDEN'
  | 'MOLDEA_TEXT_EMPTY'
  | 'MOLDEA_YAML_MALFORMED'
  | 'MOLDEA_YAML_MULTIPLE_DOCUMENTS'
  | 'MOLDEA_YAML_FEATURE_UNSUPPORTED'
  | 'MOLDEA_YAML_DUPLICATE_KEY'
  | 'MOLDEA_MANIFEST_ROOT_INVALID'
  | 'MOLDEA_MANIFEST_VERSION_MISSING'
  | 'MOLDEA_MANIFEST_VERSION_INVALID'
  | 'MOLDEA_MANIFEST_VERSION_UNSUPPORTED'
  | 'MOLDEA_MANIFEST_PROPERTY_UNKNOWN'
  | 'MOLDEA_MANIFEST_VALUE_INVALID'
  | 'MOLDEA_ID_INVALID'
  | 'MOLDEA_ID_RESERVED'
  | 'MOLDEA_ID_DUPLICATE'
  | 'MOLDEA_VARIABLE_ID_INVALID'
  | 'MOLDEA_PATH_INVALID'
  | 'MOLDEA_GLOB_INVALID'
  | 'MOLDEA_PATH_DUPLICATE'
  | 'MOLDEA_PATTERN_DUPLICATE'
  | 'MOLDEA_IMPACT_PATH_MISSING'
  | 'MOLDEA_IMPACT_PATH_NOT_FILE'
  | 'MOLDEA_REFERENCE_MISSING'
  | 'MOLDEA_REFERENCE_NOT_FILE'
  | 'MOLDEA_REFERENCE_SYMLINK'
  | 'MOLDEA_SYMBOL_INVALID'
  | 'MOLDEA_SYMBOL_FORBIDDEN'
  | 'MOLDEA_CONTEXT_PATH_INVALID'
  | 'MOLDEA_CONTEXT_RELATIONSHIP_EMPTY'
  | 'MOLDEA_CONTEXT_FILE_EMPTY'
  | 'MOLDEA_RUNTIME_GUIDANCE_MISSING'
  | 'MOLDEA_RUNTIME_GUIDANCE_EMPTY'
  | 'MOLDEA_DECISION_FILENAME_INVALID'
  | 'MOLDEA_DECISION_FRONTMATTER_MISSING'
  | 'MOLDEA_DECISION_FRONTMATTER_INVALID'
  | 'MOLDEA_DECISION_PROPERTY_UNKNOWN'
  | 'MOLDEA_DECISION_STATUS_INVALID'
  | 'MOLDEA_DECISION_CREATED_AT_INVALID'
  | 'MOLDEA_DECISION_TIMESTAMP_MISMATCH'
  | 'MOLDEA_DECISION_BODY_EMPTY'
  | 'MOLDEA_DECISION_ID_DUPLICATE'
  | 'MOLDEA_DECISION_REFERENCE_MISSING'
  | 'MOLDEA_DECISION_SELF_SUPERSESSION'
  | 'MOLDEA_DECISION_SUPERSESSION_CYCLE'
  | 'MOLDEA_DECISION_SUPERSESSION_STATUS_INVALID'
  | 'MOLDEA_DECISION_SUPERSEDED_ORPHAN'
  | 'MOLDEA_DECISION_RELATIONSHIP_INACTIVE'
  | 'MOLDEA_AGENT_DIRECTORY_UNREGISTERED'
  | 'MOLDEA_AGENT_DIRECTORY_MISSING'
  | 'MOLDEA_AGENT_DESCRIPTION_MISSING'
  | 'MOLDEA_AGENT_DESCRIPTION_INVALID'
  | 'MOLDEA_AGENT_INSTRUCTION_MISSING'
  | 'MOLDEA_AGENT_INSTRUCTION_EMPTY'
  | 'MOLDEA_AGENT_IDENTITY_INVALID'
  | 'MOLDEA_AGENT_HANDOFF_DESCRIPTION_INVALID'
  | 'MOLDEA_FRAMEWORK_ID_INVALID'
  | 'MOLDEA_FRAMEWORK_ADAPTER_UNAVAILABLE'
  | 'MOLDEA_FRAMEWORK_ADAPTER_FORMAT_UNSUPPORTED'
  | 'MOLDEA_VARIABLE_PLACEHOLDER_MALFORMED'
  | 'MOLDEA_VARIABLE_UNDECLARED'
  | 'MOLDEA_VARIABLE_UNUSED'
  | 'MOLDEA_VARIABLE_PROVIDER_UNDECLARED'
  | 'MOLDEA_CAPABILITY_DESCRIPTION_MISSING'
  | 'MOLDEA_CAPABILITY_DESCRIPTION_INVALID'
  | 'MOLDEA_TOOL_IMPLEMENTATION_MISSING'
  | 'MOLDEA_SKILL_IMPLEMENTATION_MISSING'
  | 'MOLDEA_MIRROR_PATH_INVALID'
  | 'MOLDEA_MIRROR_PATH_INSIDE_MOLDEA'
  | 'MOLDEA_MIRROR_PATH_DUPLICATE'
  | 'MOLDEA_MIRROR_MISSING'
  | 'MOLDEA_MIRROR_NOT_FILE'
  | 'MOLDEA_MIRROR_SYMLINK'
  | 'MOLDEA_MIRROR_STALE';

// Core-owned and adapter-owned diagnostic shapes
export interface ICoreDiagnostic {
  readonly source: 'core';
  readonly code: ICoreDiagnosticCode;
  readonly message: string;
  readonly path: IRepositoryPath | null;
  readonly pointer: string | null;
  readonly range: ISourceRange | null;
  readonly entity: IDiagnosticEntity | null;
  readonly details: IDiagnosticDetails;
}

export interface IAdapterDiagnostic {
  readonly source: string;
  readonly code: string;
  readonly message: string;
  readonly path: IRepositoryPath | null;
  readonly pointer: string | null;
  readonly range: ISourceRange | null;
  readonly entity: IDiagnosticEntity | null;
  readonly details: IDiagnosticDetails;
}

export type IDiagnostic = ICoreDiagnostic | IAdapterDiagnostic;
