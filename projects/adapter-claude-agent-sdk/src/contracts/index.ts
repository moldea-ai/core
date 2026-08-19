import type ts from 'typescript';

import type { ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

// stable package-owned diagnostic codes
export type IClaudeAgentSdkAdapterDiagnosticCode =
  | 'CLAUDE_AGENT_SDK_PACKAGE_MANIFEST_INVALID'
  | 'CLAUDE_AGENT_SDK_VERSION_UNSUPPORTED'
  | 'CLAUDE_AGENT_SDK_SOURCE_TEXT_INVALID'
  | 'CLAUDE_AGENT_SDK_SOURCE_SYNTAX_INVALID'
  | 'CLAUDE_AGENT_SDK_RUNTIME_AGENT_SYMBOL_NOT_FOUND'
  | 'CLAUDE_AGENT_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND'
  | 'CLAUDE_AGENT_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'CLAUDE_AGENT_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND'
  | 'CLAUDE_AGENT_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND'
  | 'CLAUDE_AGENT_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'CLAUDE_AGENT_SDK_MCP_SERVER_KEY_UNSUPPORTED'
  | 'CLAUDE_AGENT_SDK_INSTRUCTION_LOADER_NOT_WIRED'
  | 'CLAUDE_AGENT_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED'
  | 'CLAUDE_AGENT_SDK_TOOL_IMPLEMENTATION_NOT_WIRED'
  | 'CLAUDE_AGENT_SDK_TOOL_REGISTRATION_NOT_WIRED'
  | 'CLAUDE_AGENT_SDK_TOOL_NAME_MISMATCH'
  | 'CLAUDE_AGENT_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED'
  | 'CLAUDE_AGENT_SDK_HANDOFF_TARGET_AMBIGUOUS'
  | 'CLAUDE_AGENT_SDK_HANDOFF_ROUTING_DESCRIPTION_MISSING'
  | 'CLAUDE_AGENT_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED';

export type IClaudeAgentSdkPackageCompatibility = 'ambiguous' | 'supported' | 'unsupported';

export type IClaudeAgentSdkPackageDependencyKind =
  'dependencies' | 'optionalDependencies' | 'peerDependencies' | 'devDependencies';

export interface IClaudeAgentSdkPackageDeclaration {
  readonly declaredRange: string;
  readonly dependencyKind: IClaudeAgentSdkPackageDependencyKind;
}

// nearest owning package observation
export interface IClaudeAgentSdkPackageObservation {
  readonly compatibility: IClaudeAgentSdkPackageCompatibility;
  readonly declarations: readonly IClaudeAgentSdkPackageDeclaration[];
  readonly path: IRepositoryPath;
}

export type IClaudeAgentSdkPackageDiscoveryResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid'; readonly path: IRepositoryPath }
  | { readonly kind: 'observed'; readonly observation: IClaudeAgentSdkPackageObservation };

// SDK helper imports indexed in addition to provider-neutral imports
export interface IClaudeAgentSdkImports {
  readonly createSdkMcpServerNames: ReadonlySet<string>;
  readonly queryNames: ReadonlySet<string>;
  readonly toolNames: ReadonlySet<string>;
}

export type IClaudeAgentSdkModuleExportState =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-supported' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' };

export type IClaudeAgentSdkTextResult =
  | { readonly valid: false }
  | {
      readonly locator: { locateRange(startOffset: number, endOffset: number): ISourceRange };
      readonly valid: true;
      readonly value: string;
    };

// parsed source and Claude Agent SDK bindings used only within one inspection
export interface IClaudeAgentSdkSourceAnalysis {
  readonly clientNames: ReadonlySet<string>;
  readonly constructorNames: ReadonlySet<string>;
  readonly exports: ReadonlyMap<
    string,
    IClaudeAgentSdkModuleExportState & { readonly declaration: ts.Node }
  >;
  readonly identifierUses: ReadonlyMap<string, readonly ts.Identifier[]>;
  readonly imports: IClaudeAgentSdkImports;
  readonly localBindingNames: ReadonlyMap<ts.Node, ReadonlySet<string>>;
  readonly moduleArrays: ReadonlyMap<
    string,
    { readonly declaration: ts.VariableDeclaration; readonly expression: ts.ArrayLiteralExpression }
  >;
  readonly moduleConstDeclarations: ReadonlyMap<string, ts.VariableDeclaration>;
  readonly namedImports: ReadonlyMap<
    string,
    { readonly importedName: string; readonly moduleSpecifier: string }
  >;
  readonly path: IRepositoryPath;
  readonly safeModuleArrayNames: ReadonlySet<string>;
  readonly sourceFile: ts.SourceFile;
  readonly text: IClaudeAgentSdkTextResult & { readonly valid: true };
}

export type IClaudeAgentSdkSourceAnalysisResult =
  | { readonly kind: 'invalid-syntax'; readonly range: ISourceRange | null }
  | { readonly kind: 'invalid-text' }
  | { readonly analysis: IClaudeAgentSdkSourceAnalysis; readonly kind: 'valid' };

export type IClaudeAgentSdkRelationship =
  | { readonly kind: 'absent' }
  | { readonly expression: ts.Expression; readonly kind: 'present' }
  | { readonly kind: 'unresolved' };

export type IClaudeAgentSdkAvailability = 'available' | 'unavailable' | 'unresolved';

// one supported direct query call and its relationship-local options state
export interface IClaudeAgentSdkQueryContext {
  readonly agents: IClaudeAgentSdkRelationship;
  readonly agentSelection: IClaudeAgentSdkRelationship;
  readonly call: ts.CallExpression;
  readonly disallowedTools: IClaudeAgentSdkRelationship;
  readonly mcpServers: IClaudeAgentSdkRelationship;
  readonly outputFormat: IClaudeAgentSdkRelationship;
  readonly systemPrompt: IClaudeAgentSdkRelationship;
  readonly toolAliases: IClaudeAgentSdkRelationship;
  readonly tools: IClaudeAgentSdkRelationship;
}

// complete direct-call set for one directly exported query wrapper
export interface IClaudeAgentSdkQueryWrapper {
  readonly contexts: readonly IClaudeAgentSdkQueryContext[];
  readonly declaration: ts.Node;
  readonly hasAmbiguousCandidate: boolean;
}

// supported immutable programmatic subagent definition
export interface IClaudeAgentSdkAgentDefinition {
  readonly config: ts.ObjectLiteralExpression;
  readonly declaration: ts.VariableDeclaration;
  readonly description: IClaudeAgentSdkRelationship;
  readonly disallowedTools: IClaudeAgentSdkRelationship;
  readonly mcpServers: IClaudeAgentSdkRelationship;
  readonly prompt: IClaudeAgentSdkRelationship;
  readonly tools: IClaudeAgentSdkRelationship;
}

export type IClaudeAgentSdkAgentDefinitionResult =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' }
  | {
      readonly definition: IClaudeAgentSdkAgentDefinition;
      readonly kind: 'present-supported';
    };

// exact static source string or conservative unsupported state
export type IClaudeAgentSdkStaticStringResult =
  | { readonly expression: ts.Expression; readonly kind: 'supported'; readonly value: string }
  | { readonly kind: 'unsupported' };

// supported root tool(...) declaration
export interface IClaudeAgentSdkToolDefinition {
  readonly call: ts.CallExpression;
  readonly declaration: ts.VariableDeclaration;
  readonly implementation: ts.Expression;
  readonly inputSchema: ts.Expression;
  readonly name: ts.Expression;
}

export type IClaudeAgentSdkToolDefinitionResult =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' }
  | { readonly kind: 'present-supported'; readonly tool: IClaudeAgentSdkToolDefinition };

// supported createSdkMcpServer(...) declaration
export interface IClaudeAgentSdkMcpServerDefinition {
  readonly config: ts.ObjectLiteralExpression;
  readonly declaration: ts.VariableDeclaration;
  readonly name: ts.Expression;
  readonly tools: IClaudeAgentSdkRelationship;
  readonly version: IClaudeAgentSdkRelationship;
}

// one supported static map entry before its target is resolved
export interface IClaudeAgentSdkMapEntry {
  readonly keyExpression: ts.Expression | ts.PropertyName;
  readonly name: string | null;
  readonly value: ts.Expression;
}

// supported programmatic definition identity across one relative import edge
export interface IClaudeAgentSdkResolvedAgentDefinition {
  readonly analysis: IClaudeAgentSdkSourceAnalysis;
  readonly definition: IClaudeAgentSdkAgentDefinition;
  readonly path: IRepositoryPath;
  readonly symbol: string;
}

// operation-local repository access isolates bytes and parse results per inspection
export interface IClaudeAgentSdkInspectionSession {
  readonly signal?: AbortSignal;
  analyzeSource(path: IRepositoryPath): Promise<IClaudeAgentSdkSourceAnalysisResult>;
  discoverPackage(path: IRepositoryPath): Promise<IClaudeAgentSdkPackageDiscoveryResult>;
  getEntry(path: IRepositoryPath): Promise<IRepositoryEntry | null>;
}

// complete input used to construct one safe adapter diagnostic
export type IClaudeAgentSdkDiagnosticInput = Omit<IAdapterDiagnostic, 'message' | 'source'> & {
  readonly code: IClaudeAgentSdkAdapterDiagnosticCode;
};
