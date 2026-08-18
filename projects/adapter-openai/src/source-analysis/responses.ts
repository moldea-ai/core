import type ts from 'typescript';

import { analyzeClientRequests } from '@moldea.ai/adapter-static-analysis';

import type {
  IOpenAiResponsesAnalysis,
  IOpenAiResponsesRequest,
  IOpenAiSourceAnalysis,
} from '../contracts/index.js';
import { OPENAI_SOURCE_CONFIG } from './source-analysis.js';

/**
 * Finds every direct Responses request owned by one runtime-agent body.
 * @param analysis The indexed runtime source.
 * @param body The supported runtime-agent lexical body.
 * @param signal The active inspection signal.
 * @returns Recognized requests and conservative ambiguity state.
 * @throws If response analysis is aborted.
 */
export const analyzeOpenAiResponses = (
  analysis: IOpenAiSourceAnalysis,
  body: ts.ConciseBody,
  signal?: AbortSignal,
): IOpenAiResponsesAnalysis => {
  const result = analyzeClientRequests(analysis, body, OPENAI_SOURCE_CONFIG.requestConfig, signal);
  const requests: IOpenAiResponsesRequest[] = result.requests.map(({ object, relationships }) =>
    Object.freeze({
      instructions: relationships.get('instructions') ?? Object.freeze({ kind: 'absent' }),
      object,
      tools: relationships.get('tools') ?? Object.freeze({ kind: 'absent' }),
    }),
  );

  return Object.freeze({
    hasAmbiguousCandidate: result.hasAmbiguousCandidate,
    requests: Object.freeze(requests),
  });
};
