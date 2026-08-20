import type { IIndexedAgent } from '@moldea.ai/core';

import type {
  ICloudflareAgentsClassDefinition,
  ICloudflareAgentsGenerationRequest,
  ICloudflareAgentsRelationship,
  ICloudflareAgentsSourceAnalysis,
} from '../contracts/index.js';

// supported runtime agent retained for relationship inspection
export interface ICloudflareAgentsInspectedAgent {
  readonly agent: IIndexedAgent;
  readonly analysis: ICloudflareAgentsSourceAnalysis;
  readonly definition: ICloudflareAgentsClassDefinition;
  readonly instructions: ICloudflareAgentsRelationship;
  readonly output: ICloudflareAgentsRelationship;
  readonly requests: readonly ICloudflareAgentsGenerationRequest[];
  readonly tools: readonly ICloudflareAgentsRelationship[];
}
