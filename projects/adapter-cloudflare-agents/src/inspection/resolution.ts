import ts from 'typescript';

import { resolveBindingReferences, unwrapExpression } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryReference } from '@moldea.ai/core/format';
import { parseRepositoryPath } from '@moldea.ai/repository';

import type {
  ICloudflareAgentsInspectionSession,
  ICloudflareAgentsRelationship,
  ICloudflareAgentsSourceAnalysis,
  ICloudflareAgentsToolDefinition,
  ICloudflareAgentsToolMapResult,
} from '../contracts/index.js';
import {
  getCloudflareAgentsAgentTool,
  getCloudflareAgentsFunctionTool,
  getCloudflareAgentsToolMap,
} from '../source-analysis/index.js';

export interface ICloudflareAgentsResolvedToolMap {
  readonly analysis: ICloudflareAgentsSourceAnalysis;
  readonly map: ICloudflareAgentsToolMapResult;
  readonly reference: IRepositoryReference | null;
}

export interface ICloudflareAgentsResolvedToolDefinition {
  readonly analysis: ICloudflareAgentsSourceAnalysis;
  readonly definition: ICloudflareAgentsToolDefinition;
  readonly reference: IRepositoryReference & { readonly symbol: string };
}

const resolveVariableReference = async (
  session: ICloudflareAgentsInspectionSession,
  analysis: ICloudflareAgentsSourceAnalysis,
  expression: ts.Expression,
): Promise<{
  readonly analysis: ICloudflareAgentsSourceAnalysis;
  readonly declaration: ts.VariableDeclaration;
  readonly reference: IRepositoryReference & { readonly symbol: string };
} | null> => {
  const candidate = unwrapExpression(expression);

  if (!ts.isIdentifier(candidate)) {
    return null;
  }

  const references = resolveBindingReferences(candidate, analysis);

  for (const reference of references) {
    const path = parseRepositoryPath(reference.path);
    const targetAnalysis =
      path === analysis.path
        ? analysis
        : await session
            .analyzeSource(path)
            .then((result) => (result.kind === 'valid' ? result.analysis : null));

    if (targetAnalysis === null) {
      continue;
    }

    const declaration = targetAnalysis.moduleConstDeclarations.get(reference.symbol);

    if (declaration !== undefined) {
      return Object.freeze({
        analysis: targetAnalysis,
        declaration,
        reference: Object.freeze({ path, symbol: reference.symbol }),
      });
    }
  }

  return null;
};

/** Resolves one supported inline, local, or relative-imported tools map. */
export const resolveCloudflareAgentsToolMap = async (
  session: ICloudflareAgentsInspectionSession,
  analysis: ICloudflareAgentsSourceAnalysis,
  relationship: ICloudflareAgentsRelationship,
): Promise<ICloudflareAgentsResolvedToolMap | null> => {
  if (relationship.kind !== 'present') {
    return null;
  }

  const candidate = unwrapExpression(relationship.expression);

  if (ts.isObjectLiteralExpression(candidate)) {
    return Object.freeze({ analysis, map: getCloudflareAgentsToolMap(candidate), reference: null });
  }

  const resolved = await resolveVariableReference(session, analysis, candidate);

  if (resolved?.declaration.initializer === undefined) {
    return null;
  }

  const initializer = unwrapExpression(resolved.declaration.initializer);

  return ts.isObjectLiteralExpression(initializer)
    ? Object.freeze({
        analysis: resolved.analysis,
        map: getCloudflareAgentsToolMap(initializer),
        reference: resolved.reference,
      })
    : null;
};

/** Resolves one supported ordinary tool or `agentTool` declaration from a map entry. */
export const resolveCloudflareAgentsToolDefinition = async (
  session: ICloudflareAgentsInspectionSession,
  analysis: ICloudflareAgentsSourceAnalysis,
  expression: ts.Expression,
): Promise<ICloudflareAgentsResolvedToolDefinition | null> => {
  const resolved = await resolveVariableReference(session, analysis, expression);

  if (resolved === null) {
    return null;
  }

  const functionTool = getCloudflareAgentsFunctionTool(resolved.analysis, resolved.declaration);

  if (functionTool !== null) {
    return Object.freeze({
      analysis: resolved.analysis,
      definition: Object.freeze({ kind: 'function-tool', tool: functionTool }),
      reference: resolved.reference,
    });
  }

  const agentTool = getCloudflareAgentsAgentTool(resolved.analysis, resolved.declaration);

  return agentTool === null
    ? null
    : Object.freeze({
        analysis: resolved.analysis,
        definition: Object.freeze({ kind: 'agent-tool', tool: agentTool }),
        reference: resolved.reference,
      });
};
