// bindings
export {
  indexImports,
  indexLocalBindingNames,
  indexModuleDeclarations,
  isBoundIdentifier,
  isModuleBindingVisible,
  resolveBindingReferences,
  resolveImportCandidatePaths,
} from './bindings.js';

// expressions
export {
  getClosedObjectProperties,
  getDirectCall,
  getStaticString,
  isNullLiteral,
  isStaticLiteralValue,
  isStrictLiteral,
  unwrapExpression,
} from './expressions.js';

// requests
export {
  analyzeClientRequests,
  getClosedArrayIdentifiers,
  indexSafeModuleArrayNames,
} from './requests.js';

// source analysis
export {
  analyzeSource,
  getCallableExportState,
  getConstExport,
  getRuntimeExport,
  isSupportedTypeScriptSourcePath,
} from './source-analysis.js';
