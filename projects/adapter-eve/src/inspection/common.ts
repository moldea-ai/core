import type ts from 'typescript';

import type { IRuntimeAdapterEvidence, ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference } from '@moldea.ai/core/format';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { EVE_ADAPTER_ID } from '../constants/index.js';
import type {
  IEveAdapterDiagnosticCode,
  IEveSourceAnalysis,
  IEveSourceAnalysisResult,
} from '../contracts/index.js';
import { createEveDiagnostic } from '../diagnostics/index.js';

/** Compares exact strings without locale-sensitive behavior. */
export const compareEveStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const freezeReference = (reference: IRepositoryReference): IRepositoryReference =>
  Object.freeze({
    path: reference.path,
    ...(reference.symbol === undefined ? {} : { symbol: reference.symbol }),
  });

/** Creates one deeply immutable Eve evidence record. */
export const createEveEvidence = (evidence: IRuntimeAdapterEvidence): IRuntimeAdapterEvidence =>
  Object.freeze({
    ...evidence,
    details: Object.freeze({ ...evidence.details }),
    references: Object.freeze(evidence.references.map(freezeReference)),
  });

const createEntity = (agentId: string, capabilityKind?: 'skill' | 'tool', capabilityId?: string) =>
  Object.freeze({
    adapterId: EVE_ADAPTER_ID,
    agentId,
    ...(capabilityKind === undefined || capabilityId === undefined
      ? {}
      : { capabilityId, capabilityKind }),
  });

/** Appends one stable package-owned Eve diagnostic. */
export const addEveDiagnostic = (
  diagnostics: IAdapterDiagnostic[],
  code: IEveAdapterDiagnosticCode,
  path: IRepositoryPath | null,
  agentId: string,
  range: ISourceRange | null = null,
  capabilityKind?: 'skill' | 'tool',
  capabilityId?: string,
  details: IAdapterDiagnostic['details'] = {},
): void => {
  diagnostics.push(
    createEveDiagnostic({
      code,
      details,
      entity: createEntity(agentId, capabilityKind, capabilityId),
      path,
      pointer: null,
      range,
    }),
  );
};

/** Adds the sole permitted diagnostic for invalid referenced TypeScript source. */
export const addEveSourceFailureDiagnostic = (
  diagnostics: IAdapterDiagnostic[],
  result: IEveSourceAnalysisResult,
  path: IRepositoryPath,
  agentId: string,
  capabilityKind?: 'skill' | 'tool',
  capabilityId?: string,
): boolean => {
  const hasMatchingDiagnostic = (code: IEveAdapterDiagnosticCode): boolean =>
    diagnostics.some(
      (diagnostic) =>
        diagnostic.code === code &&
        diagnostic.path === path &&
        diagnostic.entity?.agentId === agentId &&
        diagnostic.entity.capabilityKind === capabilityKind &&
        diagnostic.entity.capabilityId === capabilityId,
    );

  if (result.kind === 'invalid-text') {
    if (!hasMatchingDiagnostic('EVE_SOURCE_TEXT_INVALID')) {
      addEveDiagnostic(
        diagnostics,
        'EVE_SOURCE_TEXT_INVALID',
        path,
        agentId,
        null,
        capabilityKind,
        capabilityId,
      );
    }
    return true;
  }

  if (result.kind === 'invalid-syntax') {
    if (!hasMatchingDiagnostic('EVE_SOURCE_SYNTAX_INVALID')) {
      addEveDiagnostic(
        diagnostics,
        'EVE_SOURCE_SYNTAX_INVALID',
        path,
        agentId,
        result.range,
        capabilityKind,
        capabilityId,
      );
    }
    return true;
  }

  return false;
};

/** Returns the Core scalar range for one Eve source node. */
export const locateEveNode = (analysis: IEveSourceAnalysis, node: ts.Node): ISourceRange =>
  analysis.text.locator.locateRange(node.getStart(analysis.sourceFile), node.getEnd());
