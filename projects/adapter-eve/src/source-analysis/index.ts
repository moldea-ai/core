// source analysis
export { analyzeEveSource } from './source-analysis.js';

// helper imports and definitions
export { indexEveHelperImports } from './helper-imports.js';
export {
  getEveDefinition,
  getEveObjectMemberName,
  getEveObjectMembers,
  getEvePropertyExpression,
} from './object-definitions.js';

// functions and static values
export {
  isEveFunctionDeclaration,
  isEveFunctionValue,
  isEveResolvedFunctionValue,
} from './functions.js';
export { isEveStaticStringRecord, resolveEveStaticString } from './static-values.js';
