// bindings
export {
  isOpenAiBoundIdentifier,
  isOpenAiModuleBindingVisible,
  resolveOpenAiImportCandidatePaths,
} from './bindings.js';

// expressions
export {
  getOpenAiClosedObjectProperties,
  getOpenAiDirectCall,
  getOpenAiStaticString,
  isOpenAiNullLiteral,
  isOpenAiStaticLiteralValue,
  isOpenAiStrictLiteral,
  unwrapOpenAiExpression,
} from './expressions.js';

// responses
export {
  analyzeOpenAiResponses,
  getOpenAiClosedArrayIdentifiers,
  indexSafeOpenAiModuleArrayNames,
  isSafeOpenAiModuleArray,
} from './responses.js';

// source analysis
export {
  analyzeOpenAiSource,
  getOpenAiCallableExportState,
  getOpenAiConstExport,
  getOpenAiRuntimeExport,
  isSupportedOpenAiSourcePath,
} from './source-analysis.js';
