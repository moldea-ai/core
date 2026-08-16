import type { IRuntimeAdapterEvidence, ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference } from '@moldea.ai/core/format';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { ANTHROPIC_ADAPTER_ID } from '../constants/index.js';
import type {
  IAnthropicAdapterDiagnosticCode,
  IAnthropicInspectionSession,
  IAnthropicSourceAnalysis,
} from '../contracts/index.js';
import { createAnthropicDiagnostic } from '../diagnostics/index.js';
import { isSupportedAnthropicSourcePath } from '../source-analysis/index.js';

/** Compares exact strings without locale-dependent behavior. */
export const compareAnthropicStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const freezeReference = (reference: IRepositoryReference): IRepositoryReference =>
  Object.freeze({
    path: reference.path,
    ...(reference.symbol === undefined ? {} : { symbol: reference.symbol }),
  });

/**
 * Creates one deeply immutable Anthropic evidence record.
 * @param evidence The complete evidence value.
 * @returns The frozen evidence record.
 */
export const createAnthropicEvidence = (
  evidence: IRuntimeAdapterEvidence,
): IRuntimeAdapterEvidence =>
  Object.freeze({
    ...evidence,
    details: Object.freeze({ ...evidence.details }),
    references: Object.freeze(evidence.references.map(freezeReference)),
  });

const createEntity = (agentId: string, capabilityId?: string) =>
  Object.freeze({
    adapterId: ANTHROPIC_ADAPTER_ID,
    agentId,
    ...(capabilityId === undefined ? {} : { capabilityId, capabilityKind: 'tool' as const }),
  });

/**
 * Appends one stable package-owned diagnostic.
 * @param diagnostics The operation result collection.
 * @param code The stable diagnostic code.
 * @param path The exact affected path.
 * @param agentId The owning agent identifier.
 * @param range The optional scalar source range.
 * @param capabilityId The optional owning tool capability.
 */
export const addAnthropicDiagnostic = (
  diagnostics: IAdapterDiagnostic[],
  code: IAnthropicAdapterDiagnosticCode,
  path: IRepositoryPath | null,
  agentId: string,
  range: ISourceRange | null = null,
  capabilityId?: string,
): void => {
  diagnostics.push(
    createAnthropicDiagnostic({
      code,
      details: {},
      entity: createEntity(agentId, capabilityId),
      path,
      pointer: null,
      range,
    }),
  );
};

/**
 * Loads and validates one supported bound TypeScript source.
 * @param session The operation-local inspection session.
 * @param reference The exact manifest reference.
 * @param diagnostics The operation result collection.
 * @param agentId The owning agent identifier.
 * @param capabilityId The optional owning tool capability.
 * @returns The indexed source or `null` after unsupported or invalid input.
 */
export const analyzeAnthropicBoundReference = async (
  session: IAnthropicInspectionSession,
  reference: IRepositoryReference,
  diagnostics: IAdapterDiagnostic[],
  agentId: string,
  capabilityId?: string,
): Promise<IAnthropicSourceAnalysis | null> => {
  if (!isSupportedAnthropicSourcePath(reference.path)) {
    return null;
  }

  const result = await session.analyzeSource(reference.path);

  if (result.kind === 'invalid-text') {
    addAnthropicDiagnostic(
      diagnostics,
      'ANTHROPIC_SOURCE_TEXT_INVALID',
      reference.path,
      agentId,
      null,
      capabilityId,
    );
    return null;
  }

  if (result.kind === 'invalid-syntax') {
    addAnthropicDiagnostic(
      diagnostics,
      'ANTHROPIC_SOURCE_SYNTAX_INVALID',
      reference.path,
      agentId,
      result.range,
      capabilityId,
    );
    return null;
  }

  return result.analysis;
};
