import type ts from 'typescript';

import type { ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

// stable package-owned diagnostic codes
export type IAnthropicAdapterDiagnosticCode =
  | 'ANTHROPIC_PACKAGE_MANIFEST_INVALID'
  | 'ANTHROPIC_SDK_VERSION_UNSUPPORTED'
  | 'ANTHROPIC_SOURCE_TEXT_INVALID'
  | 'ANTHROPIC_SOURCE_SYNTAX_INVALID'
  | 'ANTHROPIC_RUNTIME_AGENT_SYMBOL_NOT_FOUND'
  | 'ANTHROPIC_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND'
  | 'ANTHROPIC_TOOL_REGISTRATION_SYMBOL_NOT_FOUND'
  | 'ANTHROPIC_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'ANTHROPIC_INSTRUCTION_LOADER_NOT_WIRED'
  | 'ANTHROPIC_TOOL_REGISTRATION_NOT_WIRED'
  | 'ANTHROPIC_TOOL_NAME_MISMATCH'
  | 'ANTHROPIC_TOOL_NAME_INVALID'
  | 'ANTHROPIC_TOOL_INPUT_SCHEMA_NOT_WIRED';

// normalized repository text and scalar source lookup
export interface IAnthropicSourceLocator {
  locateRange(startOffset: number, endOffset: number): ISourceRange;
}

export type IAnthropicTextResult =
  | { readonly valid: false }
  | {
      readonly locator: IAnthropicSourceLocator;
      readonly valid: true;
      readonly value: string;
    };

// package declaration observation nearest to one bound source
export type IAnthropicPackageCompatibility = 'ambiguous' | 'supported' | 'unsupported';

export type IAnthropicPackageDependencyKind =
  'dependencies' | 'optionalDependencies' | 'peerDependencies' | 'devDependencies';

export interface IAnthropicPackageDeclaration {
  readonly declaredRange: string;
  readonly dependencyKind: IAnthropicPackageDependencyKind;
}

export interface IAnthropicPackageObservation {
  readonly compatibility: IAnthropicPackageCompatibility;
  readonly declarations: readonly IAnthropicPackageDeclaration[];
  readonly path: IRepositoryPath;
}

export type IAnthropicPackageDiscoveryResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid'; readonly path: IRepositoryPath }
  | { readonly kind: 'observed'; readonly observation: IAnthropicPackageObservation };

// static ESM import resolved within one parsed source file
export interface IAnthropicNamedImport {
  readonly importedName: string;
  readonly moduleSpecifier: string;
}

export type IAnthropicExportState =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-supported' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' };

export interface IAnthropicModuleArray {
  readonly declaration: ts.VariableDeclaration;
  readonly expression: ts.ArrayLiteralExpression;
}

// parsed and indexed source used only for one inspection
export interface IAnthropicSourceAnalysis {
  readonly clientNames: ReadonlySet<string>;
  readonly exports: ReadonlyMap<string, IAnthropicExportState & { readonly declaration: ts.Node }>;
  readonly identifierUses: ReadonlyMap<string, readonly ts.Identifier[]>;
  readonly localBindingNames: ReadonlyMap<ts.Node, ReadonlySet<string>>;
  readonly moduleArrays: ReadonlyMap<string, IAnthropicModuleArray>;
  readonly moduleConstDeclarations: ReadonlyMap<string, ts.VariableDeclaration>;
  readonly namedImports: ReadonlyMap<string, IAnthropicNamedImport>;
  readonly constructorNames: ReadonlySet<string>;
  readonly anthropicConstructorNames: ReadonlySet<string>;
  readonly path: IRepositoryPath;
  readonly safeModuleArrayNames: ReadonlySet<string>;
  readonly sourceFile: ts.SourceFile;
  readonly text: IAnthropicTextResult & { readonly valid: true };
}

export type IAnthropicSourceAnalysisResult =
  | { readonly kind: 'invalid-syntax'; readonly range: ISourceRange | null }
  | { readonly kind: 'invalid-text' }
  | { readonly analysis: IAnthropicSourceAnalysis; readonly kind: 'valid' };

export type IAnthropicRequestRelationship =
  | { readonly kind: 'absent' }
  | { readonly expression: ts.Expression; readonly kind: 'present' }
  | { readonly kind: 'unresolved' };

export interface IAnthropicMessagesRequest {
  readonly object: ts.ObjectLiteralExpression;
  readonly system: IAnthropicRequestRelationship;
  readonly tools: IAnthropicRequestRelationship;
}

export interface IAnthropicMessagesAnalysis {
  readonly hasAmbiguousCandidate: boolean;
  readonly requests: readonly IAnthropicMessagesRequest[];
}

// operation-local repository access isolates bytes and parse results per inspection
export interface IAnthropicInspectionSession {
  readonly signal?: AbortSignal;
  analyzeSource(path: IRepositoryPath): Promise<IAnthropicSourceAnalysisResult>;
  discoverPackage(path: IRepositoryPath): Promise<IAnthropicPackageDiscoveryResult>;
  getEntry(path: IRepositoryPath): Promise<IRepositoryEntry | null>;
}

// complete input used to construct one safe adapter diagnostic
export type IAnthropicDiagnosticInput = Omit<IAdapterDiagnostic, 'message' | 'source'> & {
  readonly code: IAnthropicAdapterDiagnosticCode;
};
