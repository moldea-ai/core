import type ts from 'typescript';

import { analyzeClientRequests } from '@moldea.ai/adapter-static-analysis';

import type {
  IAnthropicMessagesAnalysis,
  IAnthropicMessagesRequest,
  IAnthropicSourceAnalysis,
} from '../contracts/index.js';
import { ANTHROPIC_SOURCE_CONFIG } from './source-analysis.js';

/**
 * Finds every direct Messages request owned by one runtime-agent body.
 * @param analysis The indexed runtime source.
 * @param body The supported runtime-agent lexical body.
 * @param signal The active inspection signal.
 * @returns Recognized requests and conservative ambiguity state.
 * @throws If response analysis is aborted.
 */
export const analyzeAnthropicMessages = (
  analysis: IAnthropicSourceAnalysis,
  body: ts.ConciseBody,
  signal?: AbortSignal,
): IAnthropicMessagesAnalysis => {
  const result = analyzeClientRequests(
    analysis,
    body,
    ANTHROPIC_SOURCE_CONFIG.requestConfig,
    signal,
  );
  const requests: IAnthropicMessagesRequest[] = result.requests.map(({ object, relationships }) =>
    Object.freeze({
      object,
      system: relationships.get('system') ?? Object.freeze({ kind: 'absent' }),
      tools: relationships.get('tools') ?? Object.freeze({ kind: 'absent' }),
    }),
  );

  return Object.freeze({
    hasAmbiguousCandidate: result.hasAmbiguousCandidate,
    requests: Object.freeze(requests),
  });
};
