import ts from 'typescript';

import {
  analyzeClientRequests,
  analyzeObjectRelationships,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';

import type {
  IGoogleGenAiGenerateContentAnalysis,
  IGoogleGenAiGenerateContentRequest,
  IGoogleGenAiRequestRelationship,
  IGoogleGenAiSourceAnalysis,
} from '../contracts/index.js';
import { GOOGLE_GENAI_SOURCE_CONFIG } from './source-analysis.js';

const ABSENT_RELATIONSHIP = Object.freeze({ kind: 'absent' as const });
const UNRESOLVED_RELATIONSHIP = Object.freeze({ kind: 'unresolved' as const });

const analyzeConfig = (
  config: IGoogleGenAiRequestRelationship,
): {
  readonly systemInstruction: IGoogleGenAiRequestRelationship;
  readonly tools: IGoogleGenAiRequestRelationship;
} => {
  if (config.kind === 'absent') {
    return Object.freeze({
      systemInstruction: ABSENT_RELATIONSHIP,
      tools: ABSENT_RELATIONSHIP,
    });
  }

  if (config.kind === 'unresolved') {
    return Object.freeze({
      systemInstruction: UNRESOLVED_RELATIONSHIP,
      tools: UNRESOLVED_RELATIONSHIP,
    });
  }

  const expression = unwrapExpression(config.expression);

  if (!ts.isObjectLiteralExpression(expression)) {
    return Object.freeze({
      systemInstruction: UNRESOLVED_RELATIONSHIP,
      tools: UNRESOLVED_RELATIONSHIP,
    });
  }

  const relationships = analyzeObjectRelationships(expression, ['systemInstruction', 'tools']);

  return Object.freeze({
    systemInstruction: relationships.relationships.get('systemInstruction') ?? ABSENT_RELATIONSHIP,
    tools: relationships.relationships.get('tools') ?? ABSENT_RELATIONSHIP,
  });
};

/**
 * Finds every direct generate-content request owned by one runtime-agent body.
 * @param analysis The indexed runtime source.
 * @param body The supported runtime-agent lexical body.
 * @param signal The active inspection signal.
 * @returns Recognized requests and conservative ambiguity state.
 * @throws If request analysis is aborted.
 */
export const analyzeGoogleGenAiGenerateContent = (
  analysis: IGoogleGenAiSourceAnalysis,
  body: ts.ConciseBody,
  signal?: AbortSignal,
): IGoogleGenAiGenerateContentAnalysis => {
  const result = analyzeClientRequests(
    analysis,
    body,
    GOOGLE_GENAI_SOURCE_CONFIG.requestConfig,
    signal,
  );
  const requests: IGoogleGenAiGenerateContentRequest[] = result.requests.map(
    ({ object, relationships }) => {
      const config = relationships.get('config') ?? ABSENT_RELATIONSHIP;
      const nested = analyzeConfig(config);

      return Object.freeze({
        config,
        object,
        systemInstruction: nested.systemInstruction,
        tools: nested.tools,
      });
    },
  );

  return Object.freeze({
    hasAmbiguousCandidate: result.hasAmbiguousCandidate,
    requests: Object.freeze(requests),
  });
};
