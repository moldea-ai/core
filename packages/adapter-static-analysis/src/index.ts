// types
export type {
  IStaticAnalysisEntry,
  IStaticAnalysisExportState,
  IStaticAnalysisImportConfig,
  IStaticAnalysisModuleArray,
  IStaticAnalysisNamedImport,
  IStaticAnalysisPackageCompatibility,
  IStaticAnalysisPackageDeclaration,
  IStaticAnalysisPackageDependencyKind,
  IStaticAnalysisPackageDiscoveryOptions,
  IStaticAnalysisPackageDiscoveryResult,
  IStaticAnalysisPackageObservation,
  IStaticAnalysisPackageReader,
  IStaticAnalysisReference,
  IStaticAnalysisRequest,
  IStaticAnalysisRequestConfig,
  IStaticAnalysisRequestRelationship,
  IStaticAnalysisRequests,
  IStaticAnalysisSource,
  IStaticAnalysisSourceConfig,
  IStaticAnalysisSourceLocator,
  IStaticAnalysisSourcePosition,
  IStaticAnalysisSourceRange,
  IStaticAnalysisSourceResult,
  IStaticAnalysisTextResult,
} from './types.js';

// package discovery
export { createPackageManifestCandidatePaths, discoverPackage } from './package-discovery/index.js';

// text
export { createSourceLocator, normalizeText } from './text/index.js';

// TypeScript analysis
export {
  analyzeClientRequests,
  analyzeSource,
  getCallableExportState,
  getClosedArrayIdentifiers,
  getClosedObjectProperties,
  getConstExport,
  getDirectCall,
  getRuntimeExport,
  getStaticString,
  indexImports,
  indexLocalBindingNames,
  indexModuleDeclarations,
  indexSafeModuleArrayNames,
  isBoundIdentifier,
  isModuleBindingVisible,
  isNullLiteral,
  isStaticLiteralValue,
  isStrictLiteral,
  isSupportedTypeScriptSourcePath,
  resolveImportCandidatePaths,
  unwrapExpression,
} from './typescript-analysis/index.js';
