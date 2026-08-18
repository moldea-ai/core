import type ts from 'typescript';

// normalized source positions use one-based lines and columns with scalar offsets
export interface IStaticAnalysisSourcePosition {
  readonly column: number;
  readonly line: number;
  readonly offset: number;
}

// normalized source range returned by parser and relationship observations
export interface IStaticAnalysisSourceRange {
  readonly end: IStaticAnalysisSourcePosition;
  readonly start: IStaticAnalysisSourcePosition;
}

// scalar-aware locator over normalized valid text
export interface IStaticAnalysisSourceLocator {
  locateRange(startOffset: number, endOffset: number): IStaticAnalysisSourceRange;
}

// normalized UTF-8 source result
export type IStaticAnalysisTextResult =
  | { readonly valid: false }
  | {
      readonly locator: IStaticAnalysisSourceLocator;
      readonly valid: true;
      readonly value: string;
    };

// supported package dependency sections in deterministic inspection order
export type IStaticAnalysisPackageDependencyKind =
  'dependencies' | 'optionalDependencies' | 'peerDependencies' | 'devDependencies';

// one package declaration with its manifest provenance
export interface IStaticAnalysisPackageDeclaration {
  readonly declaredRange: string;
  readonly dependencyKind: IStaticAnalysisPackageDependencyKind;
}

export type IStaticAnalysisPackageCompatibility = 'ambiguous' | 'supported' | 'unsupported';

// nearest owning manifest observation
export interface IStaticAnalysisPackageObservation {
  readonly compatibility: IStaticAnalysisPackageCompatibility;
  readonly declarations: readonly IStaticAnalysisPackageDeclaration[];
  readonly path: string;
}

export type IStaticAnalysisPackageDiscoveryResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid'; readonly path: string }
  | { readonly kind: 'observed'; readonly observation: IStaticAnalysisPackageObservation };

// minimal entry contract supplied by a provider adapter's repository session
export interface IStaticAnalysisEntry {
  readonly path?: string;
  readonly type: string;
}

// repository callbacks keep the shared package independent of Repository types
export interface IStaticAnalysisPackageReader {
  getEntry(path: string): Promise<IStaticAnalysisEntry | null>;
  readFile(path: string): Promise<Uint8Array>;
}

// configuration for nearest-manifest dependency discovery
export interface IStaticAnalysisPackageDiscoveryOptions {
  readonly packageName: string;
  readonly reader: IStaticAnalysisPackageReader;
  readonly signal?: AbortSignal;
  readonly sourcePath: string;
  readonly supportedRange: string;
}

// static ESM named import resolved within one source file
export interface IStaticAnalysisNamedImport {
  readonly importedName: string;
  readonly moduleSpecifier: string;
}

export type IStaticAnalysisExportState =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-supported' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' };

// immutable module-local array declaration
export interface IStaticAnalysisModuleArray {
  readonly declaration: ts.VariableDeclaration;
  readonly expression: ts.ArrayLiteralExpression;
}

// supported SDK constructor import forms
export interface IStaticAnalysisImportConfig {
  readonly namedConstructorImports: readonly string[];
  readonly packageName: string;
  readonly supportsDefaultConstructorImport: boolean;
}

// direct client call and request relationship configuration
export interface IStaticAnalysisRequestConfig {
  readonly acceptedArgumentCounts: readonly number[];
  readonly methodName: string;
  readonly relationshipNames: readonly string[];
  readonly resourceName: string;
  readonly toolRelationshipName: string;
}

// source parser configuration for one provider target
export interface IStaticAnalysisSourceConfig {
  readonly importConfig: IStaticAnalysisImportConfig;
  readonly requestConfig: IStaticAnalysisRequestConfig;
}

// parsed and indexed source for one adapter inspection
export interface IStaticAnalysisSource {
  readonly clientNames: ReadonlySet<string>;
  readonly constructorNames: ReadonlySet<string>;
  readonly exports: ReadonlyMap<
    string,
    IStaticAnalysisExportState & { readonly declaration: ts.Node }
  >;
  readonly localBindingNames: ReadonlyMap<ts.Node, ReadonlySet<string>>;
  readonly moduleArrays: ReadonlyMap<string, IStaticAnalysisModuleArray>;
  readonly moduleConstDeclarations: ReadonlyMap<string, ts.VariableDeclaration>;
  readonly namedImports: ReadonlyMap<string, IStaticAnalysisNamedImport>;
  readonly path: string;
  readonly safeModuleArrayNames: ReadonlySet<string>;
  readonly sourceFile: ts.SourceFile;
  readonly text: IStaticAnalysisTextResult & { readonly valid: true };
}

export type IStaticAnalysisSourceResult =
  | { readonly kind: 'invalid-syntax'; readonly range: IStaticAnalysisSourceRange | null }
  | { readonly kind: 'invalid-text' }
  | { readonly analysis: IStaticAnalysisSource; readonly kind: 'valid' };

export type IStaticAnalysisRequestRelationship =
  | { readonly kind: 'absent' }
  | { readonly expression: ts.Expression; readonly kind: 'present' }
  | { readonly kind: 'unresolved' };

// one recognized direct SDK request
export interface IStaticAnalysisRequest {
  readonly object: ts.ObjectLiteralExpression;
  readonly relationships: ReadonlyMap<string, IStaticAnalysisRequestRelationship>;
}

// direct requests and conservative ambiguity state for one runtime body
export interface IStaticAnalysisRequests {
  readonly hasAmbiguousCandidate: boolean;
  readonly requests: readonly IStaticAnalysisRequest[];
}

// explicit Repository Format-like reference used only for binding identity
export interface IStaticAnalysisReference {
  readonly path: string;
  readonly symbol?: string;
}

// operation-local analysis functions cached by a provider inspection
export interface IStaticAnalysisInspectionSession<
  TPath extends string,
  TSourceResult,
  TPackageResult,
  TEntry,
> {
  readonly signal?: AbortSignal;
  analyzeSource(path: TPath): Promise<TSourceResult>;
  discoverPackage(path: TPath): Promise<TPackageResult>;
  getEntry(path: TPath): Promise<TEntry>;
}

// provider callbacks used to construct an operation-local inspection session
export interface IStaticAnalysisInspectionSessionOptions<
  TPath extends string,
  TSourceResult,
  TPackageResult,
  TEntry,
> {
  readonly analyzeSource: (
    path: TPath,
    bytes: Uint8Array,
    signal?: AbortSignal,
  ) => TSourceResult | Promise<TSourceResult>;
  readonly discoverPackage: (path: TPath, signal?: AbortSignal) => Promise<TPackageResult>;
  readonly getEntry: (path: TPath, signal?: AbortSignal) => Promise<TEntry>;
  readonly readFile: (path: TPath, signal?: AbortSignal) => Promise<Uint8Array>;
  readonly signal?: AbortSignal;
}

// provider-neutral result for a statically inspected relationship
export type IStaticAnalysisRelationshipResult =
  | { readonly expression: ts.Expression | null; readonly kind: 'absent' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'present' };

// declared registration and provider-owned metadata used by relationship classification
export interface IStaticAnalysisToolRegistration<TRegistration> {
  readonly reference: IStaticAnalysisReference & { readonly symbol: string };
  readonly registration: TRegistration;
}

// one declared registration paired with its classified request relationship
export interface IStaticAnalysisToolRelationship<TRegistration> {
  readonly registration: TRegistration;
  readonly relationship: IStaticAnalysisRelationshipResult;
}

// provider callbacks and indexed source needed for tool relationship classification
export interface IStaticAnalysisToolRelationshipOptions<TRegistration> {
  readonly analysis: IStaticAnalysisSource;
  readonly analyzeSource: (path: string) => Promise<IStaticAnalysisSourceResult>;
  readonly getEntry: (path: string) => Promise<IStaticAnalysisEntry | null>;
  readonly hasAmbiguousCandidate: boolean;
  readonly isSupportedAdditionalRegistration: (
    analysis: IStaticAnalysisSource,
    symbol: string,
  ) => boolean;
  readonly registrations: readonly IStaticAnalysisToolRegistration<TRegistration>[];
  readonly relationships: readonly IStaticAnalysisRequestRelationship[];
  readonly signal?: AbortSignal;
}
