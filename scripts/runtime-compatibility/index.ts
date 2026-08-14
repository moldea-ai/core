// types
export type {
  IRuntimeCompatibilityMatrix,
  IRuntimeCompatibilityValidationIssue,
  IRuntimeCompatibilityValidationResult,
} from './types.ts';

// constants
export {
  OFFICIAL_RUNTIME_ADAPTER_PACKAGES,
  MOLDEA_CLI_RELEASE_METADATA_PATH,
  RUNTIME_COMPATIBILITY_DOCUMENT_PATH,
  RUNTIME_COMPATIBILITY_SOURCE_PATH,
} from './constants.ts';

// validation
export { parseRuntimeCompatibilityMatrix } from './validations.ts';

// generation
export { generateRuntimeCompatibilityMarkdown } from './generator.ts';
