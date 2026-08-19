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
  IStaticAnalysisNamedImport,
  IStaticAnalysisPackageCompatibility,
  IStaticAnalysisPackageDeclaration,
  IStaticAnalysisPackageDependencyKind,
  IStaticAnalysisPackageDiscoveryOptions,
  IStaticAnalysisPackageDiscoveryResult,
  IStaticAnalysisPackageObservation,
  IStaticAnalysisPackageReader,
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
  IStaticAnalysisTextResult,
  IStaticAnalysisToolRegistration,
  IStaticAnalysisToolRelationship,
  IStaticAnalysisToolRelationshipOptions,
} from './types.js';

// inspection session
export { createInspectionSession } from './inspection-session/index.js';

// package discovery
export { createPackageManifestCandidatePaths, discoverPackage } from './package-discovery/index.js';

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
  unwrapExpression,
} from './typescript-analysis/index.js';
