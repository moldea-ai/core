import type {
  ICloudflareAgentsClassDefinition,
  ICloudflareAgentsGenerationRequest,
  ICloudflareAgentsSourceAnalysis,
} from '../contracts/index.js';
import { getCloudflareAgentsGenerationRequests } from './generation-requests.js';
import { getCloudflareAgentsMethod } from './methods.js';

/** Extracts direct AI SDK requests from the supported AIChatAgent handler. */
export const getCloudflareAgentsAiChatRequests = (
  definition: ICloudflareAgentsClassDefinition,
  analysis: ICloudflareAgentsSourceAnalysis,
): readonly ICloudflareAgentsGenerationRequest[] => {
  const method = getCloudflareAgentsMethod(definition.methods, 'onChatMessage', 2);
  return method === null
    ? Object.freeze([])
    : getCloudflareAgentsGenerationRequests(method, analysis);
};
