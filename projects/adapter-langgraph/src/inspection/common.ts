import type ts from 'typescript';

import { isSupportedTypeScriptSourcePath } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterEvidence, ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference } from '@moldea.ai/core/format';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { LANGGRAPH_ADAPTER_ID } from '../constants/index.js';
import type {
  ILangGraphAdapterDiagnosticCode,
  ILangGraphInspectionSession,
  ILangGraphSourceAnalysis,
  ILangGraphSourceFailure,
} from '../contracts/index.js';
import { createLangGraphDiagnostic } from '../diagnostics/index.js';

const LINE_BREAK_CODE_POINTS = new Set([0x000a, 0x000d, 0x0085, 0x2028, 0x2029]);
const EVIDENCE_SAFE_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/u;

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
export const compareLangGraphStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/** Determines whether a runtime-visible value satisfies Core's machine-string contract. */
export const isLangGraphMachineString = (value: string): boolean => {
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

/** Determines whether a source-derived identity is safe to expose as evidence metadata. */
export const isLangGraphEvidenceSafeName = (value: string): boolean =>
  EVIDENCE_SAFE_NAME_PATTERN.test(value);

const freezeReference = (reference: IRepositoryReference): IRepositoryReference =>
  Object.freeze({
    path: reference.path,
    ...(reference.symbol === undefined ? {} : { symbol: reference.symbol }),
  });

/** Creates one deeply immutable LangGraph evidence record. */
export const createLangGraphEvidence = (
  evidence: IRuntimeAdapterEvidence,
): IRuntimeAdapterEvidence =>
  Object.freeze({
    ...evidence,
    details: Object.freeze({ ...evidence.details }),
    references: Object.freeze(evidence.references.map(freezeReference)),
  });

const createEntity = (agentId: string) =>
  Object.freeze({
    adapterId: LANGGRAPH_ADAPTER_ID,
    agentId,
  });

/** Appends one stable package-owned diagnostic. */
export const addLangGraphDiagnostic = (
  diagnostics: IAdapterDiagnostic[],
  code: ILangGraphAdapterDiagnosticCode,
  path: IRepositoryPath | null,
  agentId: string,
  range: ISourceRange | null = null,
  details: IAdapterDiagnostic['details'] = {},
): void => {
  diagnostics.push(
    createLangGraphDiagnostic({
      code,
      details,
      entity: createEntity(agentId),
      path,
      pointer: null,
      range,
    }),
  );
};

/** Appends the stable diagnostic for one invalid imported relationship source. */
export const addLangGraphSourceFailureDiagnostic = (
  diagnostics: IAdapterDiagnostic[],
  failure: ILangGraphSourceFailure,
  agentId: string,
): void => {
  addLangGraphDiagnostic(
    diagnostics,
    failure.kind === 'invalid-text'
      ? 'LANGGRAPH_SOURCE_TEXT_INVALID'
      : 'LANGGRAPH_SOURCE_SYNTAX_INVALID',
    failure.path,
    agentId,
    failure.kind === 'invalid-syntax' ? failure.range : null,
  );
};

/** Returns the Core scalar range for one node in its analyzed source. */
export const locateLangGraphNode = (
  analysis: ILangGraphSourceAnalysis,
  node: ts.Node,
): ISourceRange =>
  analysis.text.locator.locateRange(node.getStart(analysis.sourceFile), node.getEnd());

/** Loads and validates one supported manifest-bound TypeScript source. */
export const analyzeLangGraphBoundReference = async (
  session: ILangGraphInspectionSession,
  reference: IRepositoryReference,
  diagnostics: IAdapterDiagnostic[],
  agentId: string,
): Promise<ILangGraphSourceAnalysis | null> => {
  if (!isSupportedTypeScriptSourcePath(reference.path)) {
    return null;
  }

  const result = await session.analyzeSource(reference.path);

  if (result.kind !== 'valid') {
    addLangGraphDiagnostic(
      diagnostics,
      result.kind === 'invalid-text'
        ? 'LANGGRAPH_SOURCE_TEXT_INVALID'
        : 'LANGGRAPH_SOURCE_SYNTAX_INVALID',
      reference.path,
      agentId,
      result.kind === 'invalid-syntax' ? result.range : null,
    );
    return null;
  }

  return result.analysis;
};
