import type ts from 'typescript';

import { isSupportedTypeScriptSourcePath } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterEvidence, ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference } from '@moldea.ai/core/format';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { OPENAI_AGENTS_SDK_ADAPTER_ID } from '../constants/index.js';
import type {
  IOpenAiAgentsSdkAdapterDiagnosticCode,
  IOpenAiAgentsSdkInspectionSession,
  IOpenAiAgentsSdkSourceAnalysis,
} from '../contracts/index.js';
import { createOpenAiAgentsSdkDiagnostic } from '../diagnostics/index.js';

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
export const compareOpenAiAgentsSdkStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/** Determines whether a runtime-visible value satisfies Core's machine-string contract. */
export const isOpenAiAgentsSdkMachineString = (value: string): boolean => {
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

/** Creates one deeply immutable OpenAI Agents SDK evidence record. */
export const createOpenAiAgentsSdkEvidence = (
  evidence: IRuntimeAdapterEvidence,
): IRuntimeAdapterEvidence =>
  Object.freeze({
    ...evidence,
    details: Object.freeze({ ...evidence.details }),
    references: Object.freeze(evidence.references.map(freezeReference)),
  });

const createEntity = (agentId: string, capabilityId?: string) =>
  Object.freeze({
    adapterId: OPENAI_AGENTS_SDK_ADAPTER_ID,
    agentId,
    ...(capabilityId === undefined ? {} : { capabilityId, capabilityKind: 'tool' as const }),
  });

/**
 * Appends one stable package-owned diagnostic.
 * @param diagnostics The operation result collection.
 * @param code The stable diagnostic code.
 * @param path The exact affected path.
 * @param agentId The owning source-agent identifier.
 * @param range The optional scalar source range.
 * @param capabilityId The optional owning tool capability.
 * @param details Safe scalar diagnostic details.
 */
export const addOpenAiAgentsSdkDiagnostic = (
  diagnostics: IAdapterDiagnostic[],
  code: IOpenAiAgentsSdkAdapterDiagnosticCode,
  path: IRepositoryPath | null,
  agentId: string,
  range: ISourceRange | null = null,
  capabilityId?: string,
  details: IAdapterDiagnostic['details'] = {},
): void => {
  diagnostics.push(
    createOpenAiAgentsSdkDiagnostic({
      code,
      details,
      entity: createEntity(agentId, capabilityId),
      path,
      pointer: null,
      range,
    }),
  );
};

/** Returns the Core scalar range for one node in its analyzed source. */
export const locateOpenAiAgentsSdkNode = (
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  node: ts.Node,
): ISourceRange =>
  analysis.text.locator.locateRange(node.getStart(analysis.sourceFile), node.getEnd());

/**
 * Loads and validates one supported bound TypeScript source.
 * @param session The operation-local inspection session.
 * @param reference The exact manifest reference.
 * @param diagnostics The operation result collection.
 * @param agentId The owning agent identifier.
 * @param capabilityId The optional owning tool capability.
 * @returns The indexed source or `null` after unsupported or invalid input.
 */
export const analyzeOpenAiAgentsSdkBoundReference = async (
  session: IOpenAiAgentsSdkInspectionSession,
  reference: IRepositoryReference,
  diagnostics: IAdapterDiagnostic[],
  agentId: string,
  capabilityId?: string,
): Promise<IOpenAiAgentsSdkSourceAnalysis | null> => {
  if (!isSupportedTypeScriptSourcePath(reference.path)) {
    return null;
  }

  const result = await session.analyzeSource(reference.path);

  if (result.kind === 'invalid-text') {
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      'OPENAI_AGENTS_SDK_SOURCE_TEXT_INVALID',
      reference.path,
      agentId,
      null,
      capabilityId,
    );
    return null;
  }

  if (result.kind === 'invalid-syntax') {
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      'OPENAI_AGENTS_SDK_SOURCE_SYNTAX_INVALID',
      reference.path,
      agentId,
      result.range,
      capabilityId,
    );
    return null;
  }

  return result.analysis;
};
