import type ts from 'typescript';

import type { IIndexedAgent, ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

export type ILangChainAdapterDiagnosticCode =
  | 'LANGCHAIN_PACKAGE_MANIFEST_INVALID'
  | 'LANGCHAIN_VERSION_UNSUPPORTED'
  | 'LANGCHAIN_SOURCE_TEXT_INVALID'
  | 'LANGCHAIN_SOURCE_SYNTAX_INVALID'
  | 'LANGCHAIN_RUNTIME_AGENT_SYMBOL_NOT_FOUND'
  | 'LANGCHAIN_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND'
  | 'LANGCHAIN_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'LANGCHAIN_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND'
  | 'LANGCHAIN_TOOL_REGISTRATION_SYMBOL_NOT_FOUND'
  | 'LANGCHAIN_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'LANGCHAIN_INSTRUCTION_LOADER_NOT_WIRED'
  | 'LANGCHAIN_AGENT_OUTPUT_SCHEMA_NOT_WIRED'
  | 'LANGCHAIN_TOOL_IMPLEMENTATION_NOT_WIRED'
  | 'LANGCHAIN_TOOL_REGISTRATION_NOT_WIRED'
  | 'LANGCHAIN_TOOL_NAME_MISMATCH'
  | 'LANGCHAIN_TOOL_INPUT_SCHEMA_NOT_WIRED';

export type ILangChainDiagnosticInput = Omit<IAdapterDiagnostic, 'message' | 'source'> & {
  readonly code: ILangChainAdapterDiagnosticCode;
};

export type ILangChainTargetPackageClassification =
  'absent' | 'ambiguous' | 'incomplete' | 'supported' | 'unsupported';

export type ILangChainPackageCompatibility = 'absent' | 'ambiguous' | 'supported' | 'unsupported';

export interface ILangChainPackageDeclaration {
  readonly declaredRange: string;
  readonly dependencyKind:
    'dependencies' | 'optionalDependencies' | 'peerDependencies' | 'devDependencies';
}

export interface ILangChainDiscoveredPackage {
  readonly compatibility: ILangChainPackageCompatibility;
  readonly declarations: readonly ILangChainPackageDeclaration[];
  readonly packageName: string;
}

export interface ILangChainPackageObservation {
  readonly packages: readonly ILangChainDiscoveredPackage[];
  readonly path: IRepositoryPath;
  readonly targetClassification: ILangChainTargetPackageClassification;
}

export type ILangChainPackageDiscoveryResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid'; readonly path: IRepositoryPath }
  | { readonly kind: 'observed'; readonly observation: ILangChainPackageObservation };

// exact supported runtime imports indexed for one source module
export interface ILangChainImports {
  readonly createAgentNames: ReadonlySet<string>;
  readonly providerStrategyNames: ReadonlySet<string>;
  readonly systemMessageNames: ReadonlySet<string>;
  readonly toolNames: ReadonlyMap<string, string>;
  readonly toolStrategyNames: ReadonlySet<string>;
}

export interface ILangChainSourceAnalysis {
  readonly clientNames: ReadonlySet<string>;
  readonly constructorNames: ReadonlySet<string>;
  readonly exports: ReadonlyMap<
    string,
    | { readonly declaration: ts.Node; readonly kind: 'absent' }
    | { readonly declaration: ts.Node; readonly kind: 'present-supported' }
    | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' }
  >;
  readonly identifierUses: ReadonlyMap<string, readonly ts.Identifier[]>;
  readonly imports: ILangChainImports;
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
  readonly text: {
    readonly locator: { locateRange(startOffset: number, endOffset: number): ISourceRange };
    readonly valid: true;
    readonly value: string;
  };
}

export type ILangChainSourceAnalysisResult =
  | { readonly kind: 'invalid-syntax'; readonly range: ISourceRange | null }
  | { readonly kind: 'invalid-text' }
  | { readonly analysis: ILangChainSourceAnalysis; readonly kind: 'valid' };

// invalid imported source observed while resolving a declared relationship
export type ILangChainSourceFailure =
  | {
      readonly kind: 'invalid-syntax';
      readonly path: IRepositoryPath;
      readonly range: ISourceRange | null;
    }
  | { readonly kind: 'invalid-text'; readonly path: IRepositoryPath };

export type ILangChainStaticStringResult =
  | { readonly expression: ts.Expression; readonly kind: 'supported'; readonly value: string }
  | { readonly kind: 'unsupported' };

export type ILangChainRelationship =
  | { readonly expression: ts.Expression | null; readonly kind: 'absent' }
  | { readonly kind: 'unresolved' }
  | { readonly expression: ts.Expression; readonly kind: 'present' };

// required relationship retains its declaration expression when later mutation obscures it
export interface ILangChainRequiredRelationship {
  readonly expression: ts.Expression;
  readonly kind: 'present' | 'unresolved';
}

export type ILangChainMiddlewareState = 'active' | 'inactive' | 'unresolved';

export interface ILangChainAgentDefinition {
  // tools relationship as declared before returned-agent mutations are applied
  readonly configuredTools: ILangChainRelationship;
  readonly declaration: ts.VariableDeclaration;
  readonly middleware: ILangChainRelationship;
  readonly name: ILangChainRelationship;
  readonly object: ts.ObjectLiteralExpression;
  readonly responseFormat: ILangChainRelationship;
  readonly systemPrompt: ILangChainRelationship;
  readonly tools: ILangChainRelationship;
}

export type ILangChainAgentDefinitionResult =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' }
  | { readonly definition: ILangChainAgentDefinition; readonly kind: 'present-supported' };

export interface ILangChainFunctionToolShape {
  readonly description: ILangChainRelationship;
  readonly fields: ts.ObjectLiteralExpression;
  readonly helperSource: string;
  readonly implementation: ILangChainRequiredRelationship;
  readonly name: ILangChainRequiredRelationship;
  readonly schema: ILangChainRelationship;
}

export interface ILangChainFunctionTool extends ILangChainFunctionToolShape {
  readonly declaration: ts.VariableDeclaration;
}

export type ILangChainFunctionToolResult =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' }
  | { readonly kind: 'present-supported'; readonly tool: ILangChainFunctionTool };

export interface ILangChainInspectionSession {
  readonly signal?: AbortSignal;
  analyzeSource(path: IRepositoryPath): Promise<ILangChainSourceAnalysisResult>;
  discoverPackage(path: IRepositoryPath): Promise<ILangChainPackageDiscoveryResult>;
  getEntry(path: IRepositoryPath): Promise<IRepositoryEntry | null>;
}

export interface ILangChainInspectedAgent {
  readonly agent: IIndexedAgent;
  readonly analysis: ILangChainSourceAnalysis;
  readonly definition: ILangChainAgentDefinition;
  readonly middlewareState: ILangChainMiddlewareState;
}

export interface ILangChainResolvedArray {
  readonly analysis: ILangChainSourceAnalysis;
  readonly expression: ts.ArrayLiteralExpression;
  readonly reference: { readonly path: IRepositoryPath; readonly symbol: string } | null;
}

// conservative outcome of resolving an agent relationship to a closed source array
export type ILangChainResolvedArrayResult =
  | { readonly failure: ILangChainSourceFailure; readonly kind: 'source-failure' }
  | { readonly kind: 'resolved'; readonly value: ILangChainResolvedArray }
  | { readonly kind: 'unresolved' };

// relationship result retains a proving expression for narrow diagnostics
export type ILangChainBindingResult =
  | { readonly expression: ts.Expression | null; readonly kind: 'different' }
  | { readonly kind: 'unresolved' }
  | { readonly expression: ts.Expression; readonly kind: 'wired' };
