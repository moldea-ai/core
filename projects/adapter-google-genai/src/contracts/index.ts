import type ts from 'typescript';

import type { ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

// stable package-owned diagnostic codes
export type IGoogleGenAiAdapterDiagnosticCode =
  | 'GOOGLE_GENAI_PACKAGE_MANIFEST_INVALID'
  | 'GOOGLE_GENAI_SDK_VERSION_UNSUPPORTED'
  | 'GOOGLE_GENAI_SOURCE_TEXT_INVALID'
  | 'GOOGLE_GENAI_SOURCE_SYNTAX_INVALID'
  | 'GOOGLE_GENAI_RUNTIME_AGENT_SYMBOL_NOT_FOUND'
  | 'GOOGLE_GENAI_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND'
  | 'GOOGLE_GENAI_TOOL_REGISTRATION_SYMBOL_NOT_FOUND'
  | 'GOOGLE_GENAI_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'GOOGLE_GENAI_INSTRUCTION_LOADER_NOT_WIRED'
  | 'GOOGLE_GENAI_TOOL_REGISTRATION_NOT_WIRED'
  | 'GOOGLE_GENAI_TOOL_NAME_MISMATCH'
  | 'GOOGLE_GENAI_TOOL_NAME_INVALID'
  | 'GOOGLE_GENAI_TOOL_INPUT_SCHEMA_NOT_WIRED'
  | 'GOOGLE_GENAI_FUNCTION_DECLARATION_LIMIT_EXCEEDED';

// normalized repository text and scalar source lookup
export interface IGoogleGenAiSourceLocator {
  locateRange(startOffset: number, endOffset: number): ISourceRange;
}

export type IGoogleGenAiTextResult =
  | { readonly valid: false }
  | {
      readonly locator: IGoogleGenAiSourceLocator;
      readonly valid: true;
      readonly value: string;
    };

// package declaration observation nearest to one bound source
export type IGoogleGenAiPackageCompatibility = 'ambiguous' | 'supported' | 'unsupported';

export type IGoogleGenAiPackageDependencyKind =
  'dependencies' | 'optionalDependencies' | 'peerDependencies' | 'devDependencies';

export interface IGoogleGenAiPackageDeclaration {
  readonly declaredRange: string;
  readonly dependencyKind: IGoogleGenAiPackageDependencyKind;
}

export interface IGoogleGenAiPackageObservation {
  readonly compatibility: IGoogleGenAiPackageCompatibility;
  readonly declarations: readonly IGoogleGenAiPackageDeclaration[];
  readonly path: IRepositoryPath;
}

export type IGoogleGenAiPackageDiscoveryResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid'; readonly path: IRepositoryPath }
  | { readonly kind: 'observed'; readonly observation: IGoogleGenAiPackageObservation };

// static ESM import resolved within one parsed source file
export interface IGoogleGenAiNamedImport {
  readonly importedName: string;
  readonly moduleSpecifier: string;
}

export type IGoogleGenAiExportState =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-supported' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' };

export interface IGoogleGenAiModuleArray {
  readonly declaration: ts.VariableDeclaration;
  readonly expression: ts.ArrayLiteralExpression;
}

// parsed and indexed source used only for one inspection
export interface IGoogleGenAiSourceAnalysis {
  readonly clientNames: ReadonlySet<string>;
  readonly constructorNames: ReadonlySet<string>;
  readonly exports: ReadonlyMap<
    string,
    IGoogleGenAiExportState & { readonly declaration: ts.Node }
  >;
  readonly googleGenAiConstructorNames: ReadonlySet<string>;
  readonly identifierUses: ReadonlyMap<string, readonly ts.Identifier[]>;
  readonly localBindingNames: ReadonlyMap<ts.Node, ReadonlySet<string>>;
  readonly moduleArrays: ReadonlyMap<string, IGoogleGenAiModuleArray>;
  readonly moduleConstDeclarations: ReadonlyMap<string, ts.VariableDeclaration>;
  readonly namedImports: ReadonlyMap<string, IGoogleGenAiNamedImport>;
  readonly path: IRepositoryPath;
  readonly safeModuleArrayNames: ReadonlySet<string>;
  readonly sourceFile: ts.SourceFile;
  readonly text: IGoogleGenAiTextResult & { readonly valid: true };
}

export type IGoogleGenAiSourceAnalysisResult =
  | { readonly kind: 'invalid-syntax'; readonly range: ISourceRange | null }
  | { readonly kind: 'invalid-text' }
  | { readonly analysis: IGoogleGenAiSourceAnalysis; readonly kind: 'valid' };

export type IGoogleGenAiRequestRelationship =
  | { readonly kind: 'absent' }
  | { readonly expression: ts.Expression; readonly kind: 'present' }
  | { readonly kind: 'unresolved' };

export interface IGoogleGenAiGenerateContentRequest {
  readonly config: IGoogleGenAiRequestRelationship;
  readonly object: ts.ObjectLiteralExpression;
  readonly systemInstruction: IGoogleGenAiRequestRelationship;
  readonly tools: IGoogleGenAiRequestRelationship;
}

export interface IGoogleGenAiGenerateContentAnalysis {
  readonly hasAmbiguousCandidate: boolean;
  readonly requests: readonly IGoogleGenAiGenerateContentRequest[];
}

// operation-local repository access isolates bytes and parse results per inspection
export interface IGoogleGenAiInspectionSession {
  readonly signal?: AbortSignal;
  analyzeSource(path: IRepositoryPath): Promise<IGoogleGenAiSourceAnalysisResult>;
  discoverPackage(path: IRepositoryPath): Promise<IGoogleGenAiPackageDiscoveryResult>;
  getEntry(path: IRepositoryPath): Promise<IRepositoryEntry | null>;
}

// complete input used to construct one safe adapter diagnostic
export type IGoogleGenAiDiagnosticInput = Omit<IAdapterDiagnostic, 'message' | 'source'> & {
  readonly code: IGoogleGenAiAdapterDiagnosticCode;
};
