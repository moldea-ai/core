// types
export type {
  IStaticAnalysisEntry,
  IStaticAnalysisExportState,
  IStaticAnalysisInspectionSession,
  IStaticAnalysisInspectionSessionOptions,
  IStaticAnalysisImportConfig,
  IStaticAnalysisModuleArray,
  IStaticAnalysisModuleValueSource,
  IStaticAnalysisModuleValueSourceResult,
  IStaticAnalysisMutationAnalysis,
  IStaticAnalysisNamedImport,
  IStaticAnalysisPackageCompatibility,
  IStaticAnalysisPackageDeclaration,
  IStaticAnalysisPackageDependencyKind,
  IStaticAnalysisPackageDiscoveryOptions,
  IStaticAnalysisPackageDiscoveryResult,
  IStaticAnalysisPackageObservation,
  IStaticAnalysisPackageReader,
  IStaticAnalysisPackagesDiscoveryOptions,
  IStaticAnalysisPackagesDiscoveryResult,
  IStaticAnalysisPackagesObservation,
  IStaticAnalysisPackageTarget,
  IStaticAnalysisDiscoveredPackage,
  IStaticAnalysisReference,
  IStaticAnalysisRelationshipResult,
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
  IStaticAnalysisStaticStringOptions,
  IStaticAnalysisStaticStringResult,
  IStaticAnalysisTextResult,
  IStaticAnalysisToolRegistration,
  IStaticAnalysisToolRelationship,
  IStaticAnalysisToolRelationshipOptions,
} from './types.js';

// inspection session
export { createInspectionSession } from './inspection-session/index.js';

// package discovery
export {
  createPackageManifestCandidatePaths,
  discoverPackage,
  discoverPackages,
} from './package-discovery/index.js';

// text
export { createSourceLocator, getUnicodeScalarLength, normalizeText } from './text/index.js';

// relationship analysis
export {
  classifyDirectCallRelationship,
  classifySchemaRelationship,
  classifyToolRelationships,
} from './relationship-analysis/index.js';

// TypeScript analysis
export {
  analyzeClientRequests,
  analyzeModuleValueMutations,
  analyzeObjectRelationships,
  analyzeSource,
  analyzeTypeScriptModule,
  getCallableExportState,
  getClosedArrayIdentifiers,
  getClosedObjectProperties,
  getConstExport,
  getDirectCall,
  getRuntimeExport,
  getSafeModuleConstLiteral,
  getStaticString,
  indexImports,
  indexLocalBindingNames,
  indexModuleDeclarations,
  indexSafeModuleArrayNames,
  isBoundIdentifier,
  isModuleBindingVisible,
  isModuleConstValueSafe,
  isModuleValueBindingSafe,
  isNullLiteral,
  isStaticLiteralValue,
  isStrictLiteral,
  isSupportedTypeScriptSourcePath,
  resolveBindingReferences,
  resolveImportCandidatePaths,
  resolveStaticString,
  unwrapExpression,
} from './typescript-analysis/index.js';
