// bindings
export {
  isAnthropicBoundIdentifier,
  isAnthropicModuleBindingVisible,
  resolveAnthropicImportCandidatePaths,
} from './bindings.js';

// expressions
export {
  getAnthropicClosedObjectProperties,
  getAnthropicDirectCall,
  getAnthropicStaticString,
  isAnthropicNullLiteral,
  isAnthropicStaticLiteralValue,
  isAnthropicStrictLiteral,
  unwrapAnthropicExpression,
} from './expressions.js';

// messages
export {
  analyzeAnthropicMessages,
  getAnthropicClosedArrayIdentifiers,
  indexSafeAnthropicModuleArrayNames,
  isSafeAnthropicModuleArray,
} from './messages.js';

// source analysis
export {
  analyzeAnthropicSource,
  getAnthropicCallableExportState,
  getAnthropicConstExport,
  getAnthropicRuntimeExport,
  isSupportedAnthropicSourcePath,
} from './source-analysis.js';
