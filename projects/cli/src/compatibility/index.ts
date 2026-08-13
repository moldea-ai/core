// types
export type {
  IMoldeaCliAdapterCompatibility,
  IMoldeaCliCompatibilityResolution,
  IMoldeaCliCompatibilityResolver,
  IMoldeaCliCompatibilityResult,
  IMoldeaCliCompatibilityStateInput,
  IMoldeaCliInstalledCompatibilityInput,
  IMoldeaCliPackageCompatibility,
} from './types.js';

// validation
export { isMoldeaCliCompatibilityStateValid } from './validations.js';

// transformation
export { createMoldeaCliCompatibilityResult } from './transformers.js';

// resolution
export {
  resolveInstalledMoldeaCliCompatibility,
  resolveMoldeaCliCompatibility,
} from './compatibility.js';
