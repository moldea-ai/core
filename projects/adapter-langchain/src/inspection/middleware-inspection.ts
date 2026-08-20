import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';

import type {
  ILangChainInspectionSession,
  ILangChainMiddlewareState,
  ILangChainRelationship,
  ILangChainSourceAnalysis,
} from '../contracts/index.js';
import { addLangChainSourceFailureDiagnostic } from './common.js';
import { isClosedLangChainArray, resolveLangChainArray } from './resolution.js';

/** Classifies middleware as inactive, active, or unresolved without interpreting it. */
export const classifyLangChainMiddleware = async (
  session: ILangChainInspectionSession,
  analysis: ILangChainSourceAnalysis,
  relationship: ILangChainRelationship,
  relatedRelationships: readonly ILangChainRelationship[],
  diagnostics: IAdapterDiagnostic[],
  agentId: string,
): Promise<ILangChainMiddlewareState> => {
  if (relationship.kind === 'absent') {
    return 'inactive';
  }

  if (relationship.kind === 'unresolved') {
    return 'unresolved';
  }

  const resolved = await resolveLangChainArray(
    session,
    analysis,
    relationship,
    relatedRelationships,
  );

  if (resolved.kind === 'source-failure') {
    addLangChainSourceFailureDiagnostic(diagnostics, resolved.failure, agentId);
    return 'unresolved';
  }

  if (resolved.kind === 'unresolved' || !isClosedLangChainArray(resolved.value.expression)) {
    return 'unresolved';
  }

  return resolved.value.expression.elements.length === 0 ? 'inactive' : 'active';
};
