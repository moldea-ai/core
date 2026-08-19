import type { IIndexedAgent } from '@moldea.ai/core';

import type {
  IVercelAiSdkGenerationWrapper,
  IVercelAiSdkSourceAnalysis,
  IVercelAiSdkToolLoopAgentDefinition,
} from '../contracts/index.js';

// scoped ToolLoopAgent selected during the first inspection pass
export interface IVercelAiSdkInspectedToolLoopAgent {
  readonly agent: IIndexedAgent;
  readonly analysis: IVercelAiSdkSourceAnalysis;
  readonly definition: IVercelAiSdkToolLoopAgentDefinition;
  readonly kind: 'tool-loop-agent';
}

// scoped direct-generation wrapper selected during the first inspection pass
export interface IVercelAiSdkInspectedGenerationAgent {
  readonly agent: IIndexedAgent;
  readonly analysis: IVercelAiSdkSourceAnalysis;
  readonly kind: 'generation-wrapper';
  readonly wrapper: IVercelAiSdkGenerationWrapper;
}

export type IVercelAiSdkInspectedAgent =
  IVercelAiSdkInspectedGenerationAgent | IVercelAiSdkInspectedToolLoopAgent;
