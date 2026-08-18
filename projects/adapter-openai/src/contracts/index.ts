import type ts from 'typescript';

import type { ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

// stable package-owned diagnostic codes
export type IOpenAiAdapterDiagnosticCode =
  | 'OPENAI_PACKAGE_MANIFEST_INVALID'
  | 'OPENAI_SDK_VERSION_UNSUPPORTED'
  | 'OPENAI_SOURCE_TEXT_INVALID'
  | 'OPENAI_SOURCE_SYNTAX_INVALID'
  | 'OPENAI_RUNTIME_AGENT_SYMBOL_NOT_FOUND'
  | 'OPENAI_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND'
  | 'OPENAI_TOOL_REGISTRATION_SYMBOL_NOT_FOUND'
  | 'OPENAI_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'OPENAI_INSTRUCTION_LOADER_NOT_WIRED'
  | 'OPENAI_TOOL_REGISTRATION_NOT_WIRED'
  | 'OPENAI_TOOL_NAME_MISMATCH'
  | 'OPENAI_TOOL_INPUT_SCHEMA_NOT_WIRED';

// normalized repository text and scalar source lookup
export interface IOpenAiSourceLocator {
  locateRange(startOffset: number, endOffset: number): ISourceRange;
}

export type IOpenAiTextResult =
  | { readonly valid: false }
  | {
      readonly locator: IOpenAiSourceLocator;
      readonly valid: true;
      readonly value: string;
    };

// package declaration observation nearest to one bound source
export type IOpenAiPackageCompatibility = 'ambiguous' | 'supported' | 'unsupported';

export type IOpenAiPackageDependencyKind =
  'dependencies' | 'optionalDependencies' | 'peerDependencies' | 'devDependencies';

export interface IOpenAiPackageDeclaration {
  readonly declaredRange: string;
  readonly dependencyKind: IOpenAiPackageDependencyKind;
}

export interface IOpenAiPackageObservation {
  readonly compatibility: IOpenAiPackageCompatibility;
  readonly declarations: readonly IOpenAiPackageDeclaration[];
  readonly path: IRepositoryPath;
}

export type IOpenAiPackageDiscoveryResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid'; readonly path: IRepositoryPath }
  | { readonly kind: 'observed'; readonly observation: IOpenAiPackageObservation };

// static ESM import resolved within one parsed source file
export interface IOpenAiNamedImport {
  readonly importedName: string;
  readonly moduleSpecifier: string;
}

export type IOpenAiExportState =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-supported' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' };

export interface IOpenAiModuleArray {
  readonly declaration: ts.VariableDeclaration;
  readonly expression: ts.ArrayLiteralExpression;
}

// parsed and indexed source used only for one inspection
export interface IOpenAiSourceAnalysis {
  readonly clientNames: ReadonlySet<string>;
  readonly exports: ReadonlyMap<string, IOpenAiExportState & { readonly declaration: ts.Node }>;
  readonly identifierUses: ReadonlyMap<string, readonly ts.Identifier[]>;
  readonly localBindingNames: ReadonlyMap<ts.Node, ReadonlySet<string>>;
  readonly moduleArrays: ReadonlyMap<string, IOpenAiModuleArray>;
  readonly moduleConstDeclarations: ReadonlyMap<string, ts.VariableDeclaration>;
  readonly namedImports: ReadonlyMap<string, IOpenAiNamedImport>;
  readonly constructorNames: ReadonlySet<string>;
  readonly openAiConstructorNames: ReadonlySet<string>;
  readonly path: IRepositoryPath;
  readonly safeModuleArrayNames: ReadonlySet<string>;
  readonly sourceFile: ts.SourceFile;
  readonly text: IOpenAiTextResult & { readonly valid: true };
}

export type IOpenAiSourceAnalysisResult =
  | { readonly kind: 'invalid-syntax'; readonly range: ISourceRange | null }
  | { readonly kind: 'invalid-text' }
  | { readonly analysis: IOpenAiSourceAnalysis; readonly kind: 'valid' };

export type IOpenAiRequestRelationship =
  | { readonly kind: 'absent' }
  | { readonly expression: ts.Expression; readonly kind: 'present' }
  | { readonly kind: 'unresolved' };

export interface IOpenAiResponsesRequest {
  readonly instructions: IOpenAiRequestRelationship;
  readonly object: ts.ObjectLiteralExpression;
  readonly tools: IOpenAiRequestRelationship;
}

export interface IOpenAiResponsesAnalysis {
  readonly hasAmbiguousCandidate: boolean;
  readonly requests: readonly IOpenAiResponsesRequest[];
}

// operation-local repository access isolates bytes and parse results per inspection
export interface IOpenAiInspectionSession {
  readonly signal?: AbortSignal;
  analyzeSource(path: IRepositoryPath): Promise<IOpenAiSourceAnalysisResult>;
  discoverPackage(path: IRepositoryPath): Promise<IOpenAiPackageDiscoveryResult>;
  getEntry(path: IRepositoryPath): Promise<IRepositoryEntry | null>;
}

// complete input used to construct one safe adapter diagnostic
export type IOpenAiDiagnosticInput = Omit<IAdapterDiagnostic, 'message' | 'source'> & {
  readonly code: IOpenAiAdapterDiagnosticCode;
};
