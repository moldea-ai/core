import type ts from 'typescript';

import type { ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

export type ILangGraphAdapterDiagnosticCode =
  | 'LANGGRAPH_PACKAGE_MANIFEST_INVALID'
  | 'LANGGRAPH_VERSION_UNSUPPORTED'
  | 'LANGGRAPH_SOURCE_TEXT_INVALID'
  | 'LANGGRAPH_SOURCE_SYNTAX_INVALID'
  | 'LANGGRAPH_RUNTIME_AGENT_SYMBOL_NOT_FOUND'
  | 'LANGGRAPH_AGENT_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'LANGGRAPH_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'LANGGRAPH_AGENT_INPUT_SCHEMA_NOT_WIRED'
  | 'LANGGRAPH_AGENT_OUTPUT_SCHEMA_NOT_WIRED';

export type ILangGraphDiagnosticInput = Omit<IAdapterDiagnostic, 'message' | 'source'> & {
  readonly code: ILangGraphAdapterDiagnosticCode;
};

export type ILangGraphTargetId = 'typescript-state-graph-1-4' | 'typescript-functional-api-1-4';

export type ILangGraphTargetPackageClassification =
  'absent' | 'ambiguous' | 'incomplete' | 'supported' | 'unsupported';

export type ILangGraphPackageCompatibility = 'absent' | 'ambiguous' | 'supported' | 'unsupported';

export interface ILangGraphPackageDeclaration {
  readonly declaredRange: string;
  readonly dependencyKind:
    'dependencies' | 'optionalDependencies' | 'peerDependencies' | 'devDependencies';
}

export interface ILangGraphDiscoveredPackage {
  readonly compatibility: ILangGraphPackageCompatibility;
  readonly declarations: readonly ILangGraphPackageDeclaration[];
  readonly packageName: string;
}

export interface ILangGraphPackageObservation {
  readonly packages: readonly ILangGraphDiscoveredPackage[];
  readonly path: IRepositoryPath;
  readonly targetClassification: ILangGraphTargetPackageClassification;
}

export type ILangGraphPackageDiscoveryResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid'; readonly path: IRepositoryPath }
  | { readonly kind: 'observed'; readonly observation: ILangGraphPackageObservation };

// exact supported LangGraph package-root runtime imports
export interface ILangGraphImports {
  readonly endNames: ReadonlySet<string>;
  readonly entrypointNames: ReadonlySet<string>;
  readonly getPreviousStateNames: ReadonlySet<string>;
  readonly interruptNames: ReadonlySet<string>;
  readonly startNames: ReadonlySet<string>;
  readonly stateGraphNames: ReadonlySet<string>;
  readonly taskNames: ReadonlySet<string>;
}

export interface ILangGraphSourceAnalysis {
  readonly clientNames: ReadonlySet<string>;
  readonly constructorNames: ReadonlySet<string>;
  readonly exports: ReadonlyMap<
    string,
    | { readonly declaration: ts.Node; readonly kind: 'absent' }
    | { readonly declaration: ts.Node; readonly kind: 'present-supported' }
    | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' }
  >;
  readonly identifierUses: ReadonlyMap<string, readonly ts.Identifier[]>;
  readonly imports: ILangGraphImports;
  readonly localBindingNames: ReadonlyMap<ts.Node, ReadonlySet<string>>;
  readonly moduleArrays: ReadonlyMap<
    string,
    {
      readonly declaration: ts.VariableDeclaration;
      readonly expression: ts.ArrayLiteralExpression;
    }
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

export type ILangGraphSourceAnalysisResult =
  | { readonly kind: 'invalid-syntax'; readonly range: ISourceRange | null }
  | { readonly kind: 'invalid-text' }
  | { readonly analysis: ILangGraphSourceAnalysis; readonly kind: 'valid' };

export type ILangGraphSourceFailure =
  | {
      readonly kind: 'invalid-syntax';
      readonly path: IRepositoryPath;
      readonly range: ISourceRange | null;
    }
  | { readonly kind: 'invalid-text'; readonly path: IRepositoryPath };

export interface ILangGraphInspectionSession {
  readonly signal?: AbortSignal;
  analyzeSource(path: IRepositoryPath): Promise<ILangGraphSourceAnalysisResult>;
  discoverPackage(path: IRepositoryPath): Promise<ILangGraphPackageDiscoveryResult>;
  getEntry(path: IRepositoryPath): Promise<IRepositoryEntry | null>;
}

export type ILangGraphRelationship =
  | { readonly expression: ts.Expression | null; readonly kind: 'absent' }
  | { readonly kind: 'unresolved' }
  | {
      readonly analysis: ILangGraphSourceAnalysis;
      readonly expression: ts.Expression;
      readonly kind: 'present';
    };

export interface ILangGraphStaticString {
  readonly analysis: ILangGraphSourceAnalysis;
  readonly expression: ts.Expression;
  readonly value: string;
}

export type ILangGraphStaticStringResult =
  | { readonly kind: 'supported'; readonly value: ILangGraphStaticString }
  | { readonly kind: 'unsupported' };

export interface ILangGraphSchemaSource {
  readonly analysis: ILangGraphSourceAnalysis;
  readonly expression: ts.Identifier;
  readonly path: IRepositoryPath;
  readonly symbol: string;
}

export type ILangGraphSchemaRelationship =
  | { readonly kind: 'absent' }
  | { readonly kind: 'unresolved' }
  | {
      readonly kind: 'present';
      readonly schemaSource: 'explicit-input' | 'explicit-output' | 'state-fallback';
      readonly source: ILangGraphSchemaSource;
    };

export interface ILangGraphStateGraphOperation {
  readonly analysis: ILangGraphSourceAnalysis;
  readonly call: ts.CallExpression;
  readonly methodName: string;
}

export interface ILangGraphRuntimePattern {
  readonly details: Readonly<Record<string, boolean | number | string>>;
  readonly patternId:
    | 'state-graph-node'
    | 'state-graph-edge'
    | 'state-graph-conditional-edge'
    | 'functional-task'
    | 'functional-interrupt'
    | 'functional-previous-state'
    | 'functional-final-state';
  readonly references: readonly { readonly path: IRepositoryPath; readonly symbol?: string }[];
  readonly runtimeName: string | null;
}

export interface ILangGraphStateGraphDefinition {
  readonly analysis: ILangGraphSourceAnalysis;
  readonly builderForm: 'inline-fluent' | 'module-local';
  readonly compileCall: ts.CallExpression;
  readonly declaration: ts.VariableDeclaration;
  readonly inputSchema: ILangGraphSchemaRelationship;
  readonly name: ILangGraphRelationship;
  readonly operations: readonly ILangGraphStateGraphOperation[];
  readonly outputSchema: ILangGraphSchemaRelationship;
  readonly patterns: readonly ILangGraphRuntimePattern[];
}

export interface ILangGraphFunctionalDefinition {
  readonly analysis: ILangGraphSourceAnalysis;
  readonly declaration: ts.VariableDeclaration;
  readonly entrypointCall: ts.CallExpression;
  readonly functionAnalysis: ILangGraphSourceAnalysis;
  readonly functionExpression: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression;
  readonly name: ILangGraphRelationship;
  readonly patterns: readonly ILangGraphRuntimePattern[];
}

export type ILangGraphAgentDefinitionResult =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' }
  | {
      readonly definition: ILangGraphStateGraphDefinition;
      readonly kind: 'present-supported';
      readonly targetId: 'typescript-state-graph-1-4';
    }
  | {
      readonly definition: ILangGraphFunctionalDefinition;
      readonly kind: 'present-supported';
      readonly targetId: 'typescript-functional-api-1-4';
    };
