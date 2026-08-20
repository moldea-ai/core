import type ts from 'typescript';

import { isSupportedTypeScriptSourcePath } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterEvidence, ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference } from '@moldea.ai/core/format';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { CLOUDFLARE_AGENTS_ADAPTER_ID } from '../constants/index.js';
import type {
  ICloudflareAgentsAdapterDiagnosticCode,
  ICloudflareAgentsInspectionSession,
  ICloudflareAgentsSourceAnalysis,
} from '../contracts/index.js';
import { createCloudflareAgentsDiagnostic } from '../diagnostics/index.js';

/** Compares exact strings without locale-dependent behavior. */
export const compareCloudflareAgentsStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const freezeReference = (reference: IRepositoryReference): IRepositoryReference =>
  Object.freeze({
    path: reference.path,
    ...(reference.symbol === undefined ? {} : { symbol: reference.symbol }),
  });

/** Creates one deeply immutable Cloudflare Agents evidence record. */
export const createCloudflareAgentsEvidence = (
  evidence: IRuntimeAdapterEvidence,
): IRuntimeAdapterEvidence =>
  Object.freeze({
    ...evidence,
    details: Object.freeze({ ...evidence.details }),
    references: Object.freeze(evidence.references.map(freezeReference)),
  });

const createEntity = (agentId: string, capabilityId?: string) =>
  Object.freeze({
    adapterId: CLOUDFLARE_AGENTS_ADAPTER_ID,
    agentId,
    ...(capabilityId === undefined ? {} : { capabilityId, capabilityKind: 'tool' as const }),
  });

/** Appends one stable package-owned diagnostic. */
export const addCloudflareAgentsDiagnostic = (
  diagnostics: IAdapterDiagnostic[],
  code: ICloudflareAgentsAdapterDiagnosticCode,
  path: IRepositoryPath | null,
  agentId: string,
  range: ISourceRange | null = null,
  capabilityId?: string,
  details: IAdapterDiagnostic['details'] = {},
): void => {
  diagnostics.push(
    createCloudflareAgentsDiagnostic({
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
export const locateCloudflareAgentsNode = (
  analysis: ICloudflareAgentsSourceAnalysis,
  node: ts.Node,
): ISourceRange =>
  analysis.text.locator.locateRange(node.getStart(analysis.sourceFile), node.getEnd());

/** Loads and validates one supported bound TypeScript source. */
export const analyzeCloudflareAgentsBoundReference = async (
  session: ICloudflareAgentsInspectionSession,
  reference: IRepositoryReference,
  diagnostics: IAdapterDiagnostic[],
  agentId: string,
  capabilityId?: string,
): Promise<ICloudflareAgentsSourceAnalysis | null> => {
  if (!isSupportedTypeScriptSourcePath(reference.path)) {
    return null;
  }

  const result = await session.analyzeSource(reference.path);

  if (result.kind === 'invalid-text') {
    addCloudflareAgentsDiagnostic(
      diagnostics,
      'CLOUDFLARE_AGENTS_SOURCE_TEXT_INVALID',
      reference.path,
      agentId,
      null,
      capabilityId,
    );
    return null;
  }

  if (result.kind === 'invalid-syntax') {
    addCloudflareAgentsDiagnostic(
      diagnostics,
      'CLOUDFLARE_AGENTS_SOURCE_SYNTAX_INVALID',
      reference.path,
      agentId,
      result.range,
      capabilityId,
    );
    return null;
  }

  return result.analysis;
};

/** Determines whether a declared symbol exists in its exact analyzed module. */
export const hasCloudflareAgentsSymbol = async (
  session: ICloudflareAgentsInspectionSession,
  reference: IRepositoryReference,
  diagnostics: IAdapterDiagnostic[],
  agentId: string,
  missingCode: ICloudflareAgentsAdapterDiagnosticCode,
  capabilityId?: string,
): Promise<ICloudflareAgentsSourceAnalysis | null> => {
  const analysis = await analyzeCloudflareAgentsBoundReference(
    session,
    reference,
    diagnostics,
    agentId,
    capabilityId,
  );

  if (analysis === null || reference.symbol === undefined) {
    return null;
  }

  if (!analysis.exports.has(reference.symbol)) {
    addCloudflareAgentsDiagnostic(
      diagnostics,
      missingCode,
      reference.path,
      agentId,
      null,
      capabilityId,
    );
    return null;
  }

  return analysis;
};
