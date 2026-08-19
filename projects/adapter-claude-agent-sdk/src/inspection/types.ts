import type { IIndexedAgent } from '@moldea.ai/core';

import type {
  IClaudeAgentSdkAgentDefinition,
  IClaudeAgentSdkQueryWrapper,
  IClaudeAgentSdkSourceAnalysis,
} from '../contracts/index.js';

// scoped query-wrapper agent selected during the first inspection pass
export interface IClaudeAgentSdkInspectedQueryAgent {
  readonly agent: IIndexedAgent;
  readonly analysis: IClaudeAgentSdkSourceAnalysis;
  readonly kind: 'query-wrapper';
  readonly wrapper: IClaudeAgentSdkQueryWrapper;
}

// scoped programmatic subagent selected during the first inspection pass
export interface IClaudeAgentSdkInspectedDefinitionAgent {
  readonly agent: IIndexedAgent;
  readonly analysis: IClaudeAgentSdkSourceAnalysis;
  readonly definition: IClaudeAgentSdkAgentDefinition;
  readonly kind: 'programmatic-agent-definition';
}

export type IClaudeAgentSdkInspectedAgent =
  IClaudeAgentSdkInspectedDefinitionAgent | IClaudeAgentSdkInspectedQueryAgent;
