import type ts from 'typescript';

import type { ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

// stable package-owned diagnostic codes
export type IOpenAiAgentsSdkAdapterDiagnosticCode =
  | 'OPENAI_AGENTS_SDK_PACKAGE_MANIFEST_INVALID'
  | 'OPENAI_AGENTS_SDK_VERSION_UNSUPPORTED'
  | 'OPENAI_AGENTS_SDK_SOURCE_TEXT_INVALID'
  | 'OPENAI_AGENTS_SDK_SOURCE_SYNTAX_INVALID'
  | 'OPENAI_AGENTS_SDK_RUNTIME_AGENT_SYMBOL_NOT_FOUND'
  | 'OPENAI_AGENTS_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND'
  | 'OPENAI_AGENTS_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'OPENAI_AGENTS_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND'
  | 'OPENAI_AGENTS_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND'
  | 'OPENAI_AGENTS_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'OPENAI_AGENTS_SDK_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'OPENAI_AGENTS_SDK_INSTRUCTION_LOADER_NOT_WIRED'
  | 'OPENAI_AGENTS_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED'
  | 'OPENAI_AGENTS_SDK_TOOL_IMPLEMENTATION_NOT_WIRED'
  | 'OPENAI_AGENTS_SDK_TOOL_REGISTRATION_NOT_WIRED'
  | 'OPENAI_AGENTS_SDK_TOOL_NAME_MISMATCH'
  | 'OPENAI_AGENTS_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED'
  | 'OPENAI_AGENTS_SDK_TOOL_OUTPUT_SCHEMA_NOT_WIRED'
  | 'OPENAI_AGENTS_SDK_HANDOFF_TARGET_AMBIGUOUS'
  | 'OPENAI_AGENTS_SDK_HANDOFF_ROUTING_DESCRIPTION_MISSING'
  | 'OPENAI_AGENTS_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED';

export type IOpenAiAgentsSdkPackageCompatibility = 'ambiguous' | 'supported' | 'unsupported';

export type IOpenAiAgentsSdkPackageDependencyKind =
  'dependencies' | 'optionalDependencies' | 'peerDependencies' | 'devDependencies';

export interface IOpenAiAgentsSdkPackageDeclaration {
  readonly declaredRange: string;
  readonly dependencyKind: IOpenAiAgentsSdkPackageDependencyKind;
}

// nearest owning package observation
export interface IOpenAiAgentsSdkPackageObservation {
  readonly compatibility: IOpenAiAgentsSdkPackageCompatibility;
  readonly declarations: readonly IOpenAiAgentsSdkPackageDeclaration[];
  readonly path: IRepositoryPath;
}

export type IOpenAiAgentsSdkPackageDiscoveryResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid'; readonly path: IRepositoryPath }
  | { readonly kind: 'observed'; readonly observation: IOpenAiAgentsSdkPackageObservation };

// SDK helper imports indexed in addition to provider-neutral constructor imports
export interface IOpenAiAgentsSdkImports {
  readonly agentNames: ReadonlySet<string>;
  readonly handoffNames: ReadonlySet<string>;
  readonly toolNames: ReadonlySet<string>;
}

// static ESM named import resolved within one parsed source file
export interface IOpenAiAgentsSdkNamedImport {
  readonly importedName: string;
  readonly moduleSpecifier: string;
}

export type IOpenAiAgentsSdkModuleExportState =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-supported' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' };

export interface IOpenAiAgentsSdkModuleArray {
  readonly declaration: ts.VariableDeclaration;
  readonly expression: ts.ArrayLiteralExpression;
}

export type IOpenAiAgentsSdkTextResult =
  | { readonly valid: false }
  | {
      readonly locator: { locateRange(startOffset: number, endOffset: number): ISourceRange };
      readonly valid: true;
      readonly value: string;
    };

// parsed source and Agents SDK bindings used only within one inspection
export interface IOpenAiAgentsSdkSourceAnalysis {
  readonly clientNames: ReadonlySet<string>;
  readonly constructorNames: ReadonlySet<string>;
  readonly exports: ReadonlyMap<
    string,
    IOpenAiAgentsSdkModuleExportState & { readonly declaration: ts.Node }
  >;
  readonly identifierUses: ReadonlyMap<string, readonly ts.Identifier[]>;
  readonly imports: IOpenAiAgentsSdkImports;
  readonly localBindingNames: ReadonlyMap<ts.Node, ReadonlySet<string>>;
  readonly moduleArrays: ReadonlyMap<string, IOpenAiAgentsSdkModuleArray>;
  readonly moduleConstDeclarations: ReadonlyMap<string, ts.VariableDeclaration>;
  readonly namedImports: ReadonlyMap<string, IOpenAiAgentsSdkNamedImport>;
  readonly path: IRepositoryPath;
  readonly safeModuleArrayNames: ReadonlySet<string>;
  readonly sourceFile: ts.SourceFile;
  readonly text: IOpenAiAgentsSdkTextResult & { readonly valid: true };
}

export type IOpenAiAgentsSdkSourceAnalysisResult =
  | { readonly kind: 'invalid-syntax'; readonly range: ISourceRange | null }
  | { readonly kind: 'invalid-text' }
  | { readonly analysis: IOpenAiAgentsSdkSourceAnalysis; readonly kind: 'valid' };

export type IOpenAiAgentsSdkRelationship =
  | { readonly kind: 'absent' }
  | { readonly expression: ts.Expression; readonly kind: 'present' }
  | { readonly kind: 'unresolved' };

export type IOpenAiAgentsSdkExportState =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' }
  | {
      readonly config: ts.ObjectLiteralExpression;
      readonly declaration: ts.VariableDeclaration;
      readonly kind: 'present-supported';
    };

// supported directly exported Agent definition and its closed relationships
export interface IOpenAiAgentsSdkAgentDefinition {
  readonly config: ts.ObjectLiteralExpression;
  readonly declaration: ts.VariableDeclaration;
  readonly handoffDescription: IOpenAiAgentsSdkRelationship;
  readonly handoffs: IOpenAiAgentsSdkRelationship;
  readonly instructions: IOpenAiAgentsSdkRelationship;
  readonly name: IOpenAiAgentsSdkRelationship;
  readonly outputType: IOpenAiAgentsSdkRelationship;
  readonly tools: IOpenAiAgentsSdkRelationship;
}

// exact static source string or conservative unresolved state
export type IOpenAiAgentsSdkStaticStringResult =
  | { readonly expression: ts.Expression; readonly kind: 'supported'; readonly value: string }
  | { readonly kind: 'unsupported' };

// supported root tool(...) declaration
export interface IOpenAiAgentsSdkFunctionTool {
  readonly declaration: ts.VariableDeclaration;
  readonly execute: IOpenAiAgentsSdkRelationship;
  readonly name: ts.Expression;
  readonly object: ts.ObjectLiteralExpression;
  readonly outputSchema: IOpenAiAgentsSdkRelationship;
  readonly parameters: IOpenAiAgentsSdkRelationship;
}

export type IOpenAiAgentsSdkFunctionToolResult =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' }
  | { readonly kind: 'present-supported'; readonly tool: IOpenAiAgentsSdkFunctionTool };

// one mechanically observable handoff registration in a closed collection
export interface IOpenAiAgentsSdkHandoffRegistration {
  readonly expression: ts.Expression;
  readonly kind: 'agent' | 'handoff';
  readonly target: ts.Expression;
  readonly toolDescriptionOverride: IOpenAiAgentsSdkRelationship;
  readonly toolNameOverride: IOpenAiAgentsSdkRelationship;
}

// supported Agent target definition identity across one relative import edge
export interface IOpenAiAgentsSdkResolvedAgentTarget {
  readonly analysis: IOpenAiAgentsSdkSourceAnalysis;
  readonly definition: IOpenAiAgentsSdkAgentDefinition;
  readonly path: IRepositoryPath;
  readonly runtimeName: string | null;
  readonly symbol: string;
}

// operation-local repository access isolates bytes and parse results per inspection
export interface IOpenAiAgentsSdkInspectionSession {
  readonly signal?: AbortSignal;
  analyzeSource(path: IRepositoryPath): Promise<IOpenAiAgentsSdkSourceAnalysisResult>;
  discoverPackage(path: IRepositoryPath): Promise<IOpenAiAgentsSdkPackageDiscoveryResult>;
  getEntry(path: IRepositoryPath): Promise<IRepositoryEntry | null>;
}

// complete input used to construct one safe adapter diagnostic
export type IOpenAiAgentsSdkDiagnosticInput = Omit<IAdapterDiagnostic, 'message' | 'source'> & {
  readonly code: IOpenAiAgentsSdkAdapterDiagnosticCode;
};

// source range paired with a relevant AST expression
export interface IOpenAiAgentsSdkLocatedExpression {
  readonly expression: ts.Expression;
  readonly range: ISourceRange;
}
