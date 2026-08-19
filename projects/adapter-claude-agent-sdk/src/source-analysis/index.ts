// agent definitions
export {
  applyClaudeAgentSdkAgentMutations,
  collectClaudeAgentSdkAgentDefinitionReferences,
  getClaudeAgentSdkAgentDefinition,
} from './agent-definitions.js';

// bindings
export { classifyClaudeAgentSdkDirectBinding } from './bindings.js';

// collections
export {
  getClaudeAgentSdkClosedArray,
  getClaudeAgentSdkClosedMapEntries,
  isClaudeAgentSdkBoundReference,
} from './collections.js';

// instruction loaders
export { classifyClaudeAgentSdkInstructionLoader } from './instruction-loaders.js';

// MCP servers
export {
  collectClaudeAgentSdkMcpToolReferences,
  getClaudeAgentSdkMcpServerDefinition,
} from './mcp-servers.js';

// mutations
export { analyzeClaudeAgentSdkMutations } from './mutations.js';
export type { IClaudeAgentSdkMutationAnalysis } from './mutations.js';

// query wrappers
export { getClaudeAgentSdkQueryWrapper } from './query-wrappers.js';
export type { IClaudeAgentSdkQueryWrapperResult } from './query-wrappers.js';

// SDK tools
export { getClaudeAgentSdkToolDefinition } from './sdk-tools.js';

// source analysis
export { analyzeClaudeAgentSdkSource } from './source-analysis.js';

// static strings
export { resolveClaudeAgentSdkStaticString } from './static-strings.js';

// tool availability
export {
  classifyClaudeAgentSdkAgentAvailability,
  classifyClaudeAgentSdkMcpToolAvailability,
  collectClaudeAgentSdkRelationshipIdentifiers,
  matchesClaudeAgentSdkBarePattern,
} from './tool-availability.js';
