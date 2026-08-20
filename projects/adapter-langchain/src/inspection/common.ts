import type ts from 'typescript';

import { isSupportedTypeScriptSourcePath } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterEvidence, ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference } from '@moldea.ai/core/format';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { LANGCHAIN_ADAPTER_ID } from '../constants/index.js';
import type {
  ILangChainAdapterDiagnosticCode,
  ILangChainInspectionSession,
  ILangChainSourceFailure,
  ILangChainSourceAnalysis,
} from '../contracts/index.js';
import { createLangChainDiagnostic } from '../diagnostics/index.js';

const LINE_BREAK_CODE_POINTS = new Set([0x000a, 0x000d, 0x0085, 0x2028, 0x2029]);

const isUnicodeWhiteSpace = (codePoint: number): boolean =>
  (codePoint >= 0x0009 && codePoint <= 0x000d) ||
  codePoint === 0x0020 ||
  codePoint === 0x0085 ||
  codePoint === 0x00a0 ||
  codePoint === 0x1680 ||
  (codePoint >= 0x2000 && codePoint <= 0x200a) ||
  (codePoint >= 0x2028 && codePoint <= 0x2029) ||
  codePoint === 0x202f ||
  codePoint === 0x205f ||
  codePoint === 0x3000;

/** Compares exact strings without locale-dependent behavior. */
export const compareLangChainStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/** Determines whether a runtime-visible value satisfies Core's machine-string contract. */
export const isLangChainMachineString = (value: string): boolean => {
  const codePoints = [...value].map((character) => character.codePointAt(0) as number);

  return (
    codePoints.length > 0 &&
    codePoints.every((codePoint) => codePoint < 0xd800 || codePoint > 0xdfff) &&
    !codePoints.includes(0) &&
    !codePoints.some((codePoint) => LINE_BREAK_CODE_POINTS.has(codePoint)) &&
    !isUnicodeWhiteSpace(codePoints[0] as number) &&
    !isUnicodeWhiteSpace(codePoints.at(-1) as number)
  );
};

const freezeReference = (reference: IRepositoryReference): IRepositoryReference =>
  Object.freeze({
    path: reference.path,
    ...(reference.symbol === undefined ? {} : { symbol: reference.symbol }),
  });

/** Creates one deeply immutable LangChain evidence record. */
export const createLangChainEvidence = (
  evidence: IRuntimeAdapterEvidence,
): IRuntimeAdapterEvidence =>
  Object.freeze({
    ...evidence,
    details: Object.freeze({ ...evidence.details }),
    references: Object.freeze(evidence.references.map(freezeReference)),
  });

const createEntity = (agentId: string, capabilityId?: string) =>
  Object.freeze({
    adapterId: LANGCHAIN_ADAPTER_ID,
    agentId,
    ...(capabilityId === undefined ? {} : { capabilityId, capabilityKind: 'tool' as const }),
  });

/** Appends one stable package-owned diagnostic. */
export const addLangChainDiagnostic = (
  diagnostics: IAdapterDiagnostic[],
  code: ILangChainAdapterDiagnosticCode,
  path: IRepositoryPath | null,
  agentId: string,
  range: ISourceRange | null = null,
  capabilityId?: string,
  details: IAdapterDiagnostic['details'] = {},
): void => {
  diagnostics.push(
    createLangChainDiagnostic({
      code,
      details,
      entity: createEntity(agentId, capabilityId),
      path,
      pointer: null,
      range,
    }),
  );
};

/** Appends the stable diagnostic for one invalid imported relationship source. */
export const addLangChainSourceFailureDiagnostic = (
  diagnostics: IAdapterDiagnostic[],
  failure: ILangChainSourceFailure,
  agentId: string,
  capabilityId?: string,
): void => {
  if (failure.kind === 'invalid-text') {
    addLangChainDiagnostic(
      diagnostics,
      'LANGCHAIN_SOURCE_TEXT_INVALID',
      failure.path,
      agentId,
      null,
      capabilityId,
    );
    return;
  }

  addLangChainDiagnostic(
    diagnostics,
    'LANGCHAIN_SOURCE_SYNTAX_INVALID',
    failure.path,
    agentId,
    failure.range,
    capabilityId,
  );
};

/** Returns the Core scalar range for one node in its analyzed source. */
export const locateLangChainNode = (
  analysis: ILangChainSourceAnalysis,
  node: ts.Node,
): ISourceRange =>
  analysis.text.locator.locateRange(node.getStart(analysis.sourceFile), node.getEnd());

/** Loads and validates one supported manifest-bound TypeScript source. */
export const analyzeLangChainBoundReference = async (
  session: ILangChainInspectionSession,
  reference: IRepositoryReference,
  diagnostics: IAdapterDiagnostic[],
  agentId: string,
  capabilityId?: string,
): Promise<ILangChainSourceAnalysis | null> => {
  if (!isSupportedTypeScriptSourcePath(reference.path)) {
    return null;
  }

  const result = await session.analyzeSource(reference.path);

  if (result.kind === 'invalid-text') {
    addLangChainDiagnostic(
      diagnostics,
      'LANGCHAIN_SOURCE_TEXT_INVALID',
      reference.path,
      agentId,
      null,
      capabilityId,
    );
    return null;
  }

  if (result.kind === 'invalid-syntax') {
    addLangChainDiagnostic(
      diagnostics,
      'LANGCHAIN_SOURCE_SYNTAX_INVALID',
      reference.path,
      agentId,
      result.range,
      capabilityId,
    );
    return null;
  }

  return result.analysis;
};
