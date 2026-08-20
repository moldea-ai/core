import type ts from 'typescript';

import type {
  IStaticAnalysisModuleValueSource,
  IStaticAnalysisPackageCompatibility,
  IStaticAnalysisPackageDeclaration,
  IStaticAnalysisSourceResult,
} from '@moldea.ai/adapter-static-analysis';
import type { IIndexedAgent, ISourceRange, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryEntry, IRepositoryPath, IRepositoryReader } from '@moldea.ai/repository';

export type IEveAdapterDiagnosticCode =
  | 'EVE_PACKAGE_MANIFEST_INVALID'
  | 'EVE_SDK_VERSION_UNSUPPORTED'
  | 'EVE_SOURCE_TEXT_INVALID'
  | 'EVE_SOURCE_SYNTAX_INVALID'
  | 'EVE_RUNTIME_AGENT_SYMBOL_NOT_FOUND'
  | 'EVE_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND'
  | 'EVE_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'EVE_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND'
  | 'EVE_TOOL_REGISTRATION_SYMBOL_NOT_FOUND'
  | 'EVE_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'EVE_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'EVE_SKILL_IMPLEMENTATION_SYMBOL_NOT_FOUND'
  | 'EVE_SKILL_REGISTRATION_SYMBOL_NOT_FOUND'
  | 'EVE_INSTRUCTION_ROOT_CONFLICT'
  | 'EVE_INSTRUCTION_LOADER_NOT_WIRED'
  | 'EVE_AGENT_OUTPUT_SCHEMA_NOT_WIRED'
  | 'EVE_TOOL_IMPLEMENTATION_NOT_WIRED'
  | 'EVE_TOOL_REGISTRATION_NOT_WIRED'
  | 'EVE_TOOL_NAME_INVALID'
  | 'EVE_TOOL_NAME_RESERVED'
  | 'EVE_TOOL_RUNTIME_NAME_COLLISION'
  | 'EVE_TOOL_NAME_MISMATCH'
  | 'EVE_TOOL_INPUT_SCHEMA_NOT_WIRED'
  | 'EVE_TOOL_OUTPUT_SCHEMA_NOT_WIRED'
  | 'EVE_SKILL_IMPLEMENTATION_NOT_WIRED'
  | 'EVE_SKILL_REGISTRATION_NOT_WIRED'
  | 'EVE_SKILL_NAME_MISMATCH'
  | 'EVE_TOOL_SUBAGENT_NAME_COLLISION'
  | 'EVE_SUBAGENT_PARENT_AMBIGUOUS'
  | 'EVE_ROUTING_DESCRIPTION_MISSING'
  | 'EVE_ROUTING_DESCRIPTION_NOT_WIRED';

export type IEveDiagnosticInput = Omit<IAdapterDiagnostic, 'message' | 'source'> & {
  readonly code: IEveAdapterDiagnosticCode;
};

export interface IEvePackageObservation {
  readonly compatibility: IStaticAnalysisPackageCompatibility;
  readonly declarations: readonly IStaticAnalysisPackageDeclaration[];
  readonly manifestPackageName: string | null;
  readonly path: IRepositoryPath;
}

export type IEvePackageDiscoveryResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid'; readonly path: IRepositoryPath }
  | { readonly kind: 'observed'; readonly observation: IEvePackageObservation };

export interface IEveHelperImports {
  readonly defineAgent: ReadonlySet<string>;
  readonly defineInstructions: ReadonlySet<string>;
  readonly defineSkill: ReadonlySet<string>;
  readonly defineTool: ReadonlySet<string>;
}

export interface IEveSourceAnalysis extends IStaticAnalysisModuleValueSource {
  readonly defaultExports: readonly ts.ExportAssignment[];
  readonly helperImports: IEveHelperImports;
  readonly path: IRepositoryPath;
  readonly runtimeSymbols: ReadonlyMap<string, ts.Declaration>;
}

export type IEveSourceAnalysisResult =
  | Exclude<IStaticAnalysisSourceResult, { readonly kind: 'valid' }>
  | { readonly analysis: IEveSourceAnalysis; readonly kind: 'valid' };

export type IEveDefinitionKind = 'agent' | 'instructions' | 'skill' | 'tool';

export type IEveDefinitionResult =
  | { readonly hasDefaultExport: false; readonly kind: 'absent' }
  | { readonly hasDefaultExport: boolean; readonly kind: 'present-unsupported' }
  | {
      readonly call: ts.CallExpression;
      readonly declaration: ts.ExportAssignment;
      readonly kind: 'present-supported';
      readonly object: ts.ObjectLiteralExpression;
      readonly properties: ReadonlyMap<string, ts.ObjectLiteralElementLike>;
    };

export interface IEveAgentRoot {
  readonly agentKind: 'local-subagent' | 'root';
  readonly agentRoot: IRepositoryPath;
  readonly layout: 'flat' | 'nested';
  readonly parentRoot: IRepositoryPath | null;
  readonly runtimeName: string | null;
}

export interface IEveToolCandidate {
  readonly isCollidedSlot: boolean;
  readonly isExtensionReserved: boolean;
  readonly isSupportedSource: boolean;
  readonly path: IRepositoryPath;
  readonly relativePath: string;
  readonly runtimeName: string;
  readonly segments: readonly string[];
}

export interface IEveSkillCandidate {
  readonly identity: string;
  readonly isCollidedSlot: boolean;
  readonly kind: 'markdown' | 'packaged' | 'typescript';
  readonly path: IRepositoryPath;
}

export interface IEveSubagentCandidate {
  readonly agentPath: IRepositoryPath;
  readonly isDirectoryBacked: boolean;
  readonly isExtensionReserved: boolean;
  readonly runtimeName: string;
}

export interface IEveAgentRootIndex {
  readonly extensionNamespaces: ReadonlySet<string>;
  readonly instructionEntries: readonly IRepositoryEntry[];
  readonly isAgentSlotCollided: boolean;
  readonly skillCandidates: readonly IEveSkillCandidate[];
  readonly subagentCandidates: readonly IEveSubagentCandidate[];
  readonly toolCandidates: readonly IEveToolCandidate[];
}

export interface IEveInspectionSession {
  readonly reader: IRepositoryReader;
  readonly signal?: AbortSignal;
  analyzeSource(path: IRepositoryPath): Promise<IEveSourceAnalysisResult>;
  discoverPackage(path: IRepositoryPath): Promise<IEvePackageDiscoveryResult>;
  getEntry(path: IRepositoryPath): Promise<IRepositoryEntry | null>;
  indexAgentRoot(path: IRepositoryPath): Promise<IEveAgentRootIndex>;
}

export interface IEveAgentDefinition {
  readonly agent: IIndexedAgent;
  readonly analysis: IEveSourceAnalysis;
  readonly definition: Extract<IEveDefinitionResult, { readonly kind: 'present-supported' }>;
  readonly packageObservation: IEvePackageObservation;
  readonly root: IEveAgentRoot;
  readonly rootIndex: IEveAgentRootIndex;
  readonly routingDescription:
    | { readonly kind: 'absent'; readonly range: ISourceRange | null }
    | { readonly kind: 'supported'; readonly range: ISourceRange; readonly value: string }
    | { readonly kind: 'unsupported'; readonly range: ISourceRange };
}

export interface IEveInspectionState {
  readonly definitions: readonly IEveAgentDefinition[];
  readonly diagnostics: IAdapterDiagnostic[];
  readonly evidence: IRuntimeAdapterEvidence[];
}
