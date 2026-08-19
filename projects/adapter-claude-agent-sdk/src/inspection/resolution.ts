import ts from 'typescript';

import {
  isModuleBindingVisible,
  resolveBindingReferences,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import { parseRepositoryPath } from '@moldea.ai/repository';

import type {
  IClaudeAgentSdkInspectionSession,
  IClaudeAgentSdkMcpServerDefinition,
  IClaudeAgentSdkResolvedAgentDefinition,
  IClaudeAgentSdkSourceAnalysis,
  IClaudeAgentSdkToolDefinition,
} from '../contracts/index.js';
import {
  getClaudeAgentSdkAgentDefinition,
  getClaudeAgentSdkMcpServerDefinition,
  getClaudeAgentSdkToolDefinition,
} from '../source-analysis/index.js';

interface IResolvedMcpServer {
  readonly analysis: IClaudeAgentSdkSourceAnalysis;
  readonly definition: IClaudeAgentSdkMcpServerDefinition;
  readonly path: ReturnType<typeof parseRepositoryPath>;
  readonly symbol: string;
}

export interface IResolvedToolDefinition {
  readonly analysis: IClaudeAgentSdkSourceAnalysis;
  readonly definition: IClaudeAgentSdkToolDefinition;
  readonly path: ReturnType<typeof parseRepositoryPath>;
  readonly symbol: string;
}

const getReferenceCandidates = (
  analysis: IClaudeAgentSdkSourceAnalysis,
  expression: ts.Expression,
  includeLocalConst: boolean,
): readonly { readonly path: string; readonly symbol: string }[] => {
  const candidate = unwrapExpression(expression);

  if (!ts.isIdentifier(candidate) || !isModuleBindingVisible(candidate, analysis)) {
    return [];
  }

  const references = [...resolveBindingReferences(candidate, analysis)];

  if (
    includeLocalConst &&
    analysis.moduleConstDeclarations.has(candidate.text) &&
    !references.some(
      (reference) => reference.path === analysis.path && reference.symbol === candidate.text,
    )
  ) {
    references.unshift(Object.freeze({ path: analysis.path, symbol: candidate.text }));
  }

  return references;
};

const loadCandidateSource = async (
  session: IClaudeAgentSdkInspectionSession,
  path: string,
): Promise<{
  readonly analysis: IClaudeAgentSdkSourceAnalysis;
  readonly path: ReturnType<typeof parseRepositoryPath>;
} | null> => {
  const parsedPath = parseRepositoryPath(path);
  const entry = await session.getEntry(parsedPath);

  if (entry?.type !== 'file') {
    return null;
  }

  const source = await session.analyzeSource(parsedPath);
  return source.kind === 'valid'
    ? Object.freeze({ analysis: source.analysis, path: parsedPath })
    : null;
};

/** Resolves one exact supported programmatic definition through local or relative binding identity. */
export const resolveClaudeAgentSdkAgentDefinition = async (
  session: IClaudeAgentSdkInspectionSession,
  analysis: IClaudeAgentSdkSourceAnalysis,
  expression: ts.Expression,
): Promise<IClaudeAgentSdkResolvedAgentDefinition | null> => {
  const resolved: IClaudeAgentSdkResolvedAgentDefinition[] = [];

  for (const reference of getReferenceCandidates(analysis, expression, false)) {
    const source = await loadCandidateSource(session, reference.path);

    if (source === null) {
      continue;
    }

    const result = getClaudeAgentSdkAgentDefinition(source.analysis, reference.symbol);

    if (result.kind === 'present-supported') {
      resolved.push(
        Object.freeze({
          analysis: source.analysis,
          definition: result.definition,
          path: source.path,
          symbol: reference.symbol,
        }),
      );
    }
  }

  return resolved.length === 1 ? (resolved[0] as IClaudeAgentSdkResolvedAgentDefinition) : null;
};

/** Resolves one exact supported SDK MCP server through local or relative binding identity. */
export const resolveClaudeAgentSdkMcpServer = async (
  session: IClaudeAgentSdkInspectionSession,
  analysis: IClaudeAgentSdkSourceAnalysis,
  expression: ts.Expression,
): Promise<IResolvedMcpServer | null> => {
  const resolved: IResolvedMcpServer[] = [];

  for (const reference of getReferenceCandidates(analysis, expression, true)) {
    const source = await loadCandidateSource(session, reference.path);

    if (source === null) {
      continue;
    }

    const definition = getClaudeAgentSdkMcpServerDefinition(source.analysis, reference.symbol);

    if (definition !== null) {
      resolved.push(
        Object.freeze({
          analysis: source.analysis,
          definition,
          path: source.path,
          symbol: reference.symbol,
        }),
      );
    }
  }

  return resolved.length === 1 ? (resolved[0] as IResolvedMcpServer) : null;
};

/** Resolves one exact supported exported SDK tool through local or relative binding identity. */
export const resolveClaudeAgentSdkTool = async (
  session: IClaudeAgentSdkInspectionSession,
  analysis: IClaudeAgentSdkSourceAnalysis,
  expression: ts.Expression,
): Promise<IResolvedToolDefinition | null> => {
  const resolved: IResolvedToolDefinition[] = [];

  for (const reference of getReferenceCandidates(analysis, expression, false)) {
    const source = await loadCandidateSource(session, reference.path);

    if (source === null) {
      continue;
    }

    const result = getClaudeAgentSdkToolDefinition(source.analysis, reference.symbol);

    if (result.kind === 'present-supported') {
      resolved.push(
        Object.freeze({
          analysis: source.analysis,
          definition: result.tool,
          path: source.path,
          symbol: reference.symbol,
        }),
      );
    }
  }

  return resolved.length === 1 ? (resolved[0] as IResolvedToolDefinition) : null;
};
