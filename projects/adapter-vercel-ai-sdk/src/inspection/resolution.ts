import ts from 'typescript';

import {
  analyzeModuleValueMutations,
  getConstExport,
  isModuleBindingVisible,
  resolveBindingReferences,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryReference } from '@moldea.ai/core/format';
import { parseRepositoryPath } from '@moldea.ai/repository';

import type {
  IVercelAiSdkInspectionSession,
  IVercelAiSdkOutputSchemaRelationship,
  IVercelAiSdkRelationship,
  IVercelAiSdkSourceAnalysis,
  IVercelAiSdkToolMapResult,
} from '../contracts/index.js';
import { getVercelAiSdkOutputSchema, getVercelAiSdkToolMap } from '../source-analysis/index.js';

export interface IVercelAiSdkResolvedOutputSchema {
  readonly analysis: IVercelAiSdkSourceAnalysis;
  readonly reference: IRepositoryReference | null;
  readonly relationship: IVercelAiSdkOutputSchemaRelationship;
}

export interface IVercelAiSdkResolvedToolMap {
  readonly analysis: IVercelAiSdkSourceAnalysis;
  readonly map: IVercelAiSdkToolMapResult;
  readonly reference: IRepositoryReference | null;
}

const collectRelationshipReferences = (
  relationships: readonly IVercelAiSdkRelationship[],
): ReadonlySet<ts.Identifier> => {
  const references = new Set<ts.Identifier>();

  for (const relationship of relationships) {
    if (relationship.kind !== 'present') {
      continue;
    }

    const expression = unwrapExpression(relationship.expression);

    if (ts.isIdentifier(expression)) {
      references.add(expression);
    }
  }

  return references;
};

const getSafeLocalConstInitializer = (
  analysis: IVercelAiSdkSourceAnalysis,
  identifier: ts.Identifier,
  allowedReferences: ReadonlySet<ts.Identifier>,
): { readonly declaration: ts.VariableDeclaration; readonly initializer: ts.Expression } | null => {
  if (!isModuleBindingVisible(identifier, analysis)) {
    return null;
  }

  const declaration = analysis.moduleConstDeclarations.get(identifier.text);

  if (declaration?.initializer === undefined) {
    return null;
  }

  const mutations = analyzeModuleValueMutations(analysis, declaration, allowedReferences);

  return mutations.hasUnknownMutation || mutations.mutatedMembers.size > 0
    ? null
    : Object.freeze({ declaration, initializer: unwrapExpression(declaration.initializer) });
};

const resolveImportedConst = async (
  session: IVercelAiSdkInspectionSession,
  analysis: IVercelAiSdkSourceAnalysis,
  identifier: ts.Identifier,
): Promise<{
  readonly analysis: IVercelAiSdkSourceAnalysis;
  readonly initializer: ts.Expression;
  readonly reference: IRepositoryReference & { readonly symbol: string };
} | null> => {
  const references = resolveBindingReferences(identifier, analysis).filter(
    (reference) => reference.path !== analysis.path,
  );

  for (const reference of references) {
    session.signal?.throwIfAborted();
    const path = parseRepositoryPath(reference.path);
    const entry = await session.getEntry(path);

    if (entry?.type !== 'file') {
      continue;
    }

    const source = await session.analyzeSource(path);

    if (source.kind !== 'valid') {
      return null;
    }

    const exported = getConstExport(source.analysis, reference.symbol);

    if (exported.kind !== 'present-supported' || exported.expression === undefined) {
      return null;
    }

    const declaration = source.analysis.moduleConstDeclarations.get(reference.symbol);

    if (declaration === undefined) {
      return null;
    }

    const mutations = analyzeModuleValueMutations(source.analysis, declaration, new Set());

    if (mutations.hasUnknownMutation || mutations.mutatedMembers.size > 0) {
      return null;
    }

    return Object.freeze({
      analysis: source.analysis,
      initializer: exported.expression,
      reference: Object.freeze({ path, symbol: reference.symbol }),
    });
  }

  return null;
};

/** Resolves one supported inline, local, or relative-imported output specification. */
export const resolveVercelAiSdkOutputSchema = async (
  session: IVercelAiSdkInspectionSession,
  analysis: IVercelAiSdkSourceAnalysis,
  relationship: IVercelAiSdkRelationship,
  relatedRelationships: readonly IVercelAiSdkRelationship[] = [relationship],
): Promise<IVercelAiSdkResolvedOutputSchema | null> => {
  if (relationship.kind !== 'present') {
    return null;
  }

  const direct = getVercelAiSdkOutputSchema(relationship.expression, analysis);

  if (direct.kind !== 'unresolved') {
    return Object.freeze({ analysis, reference: null, relationship: direct });
  }

  const candidate = unwrapExpression(relationship.expression);

  if (!ts.isIdentifier(candidate)) {
    return null;
  }

  const local = getSafeLocalConstInitializer(
    analysis,
    candidate,
    collectRelationshipReferences(relatedRelationships),
  );

  if (local !== null) {
    const resolved = getVercelAiSdkOutputSchema(local.initializer, analysis);
    return resolved.kind === 'unresolved'
      ? null
      : Object.freeze({
          analysis,
          reference: Object.freeze({ path: analysis.path, symbol: candidate.text }),
          relationship: resolved,
        });
  }

  const imported = await resolveImportedConst(session, analysis, candidate);

  if (imported === null) {
    return null;
  }

  const resolved = getVercelAiSdkOutputSchema(imported.initializer, imported.analysis);
  return resolved.kind === 'unresolved'
    ? null
    : Object.freeze({
        analysis: imported.analysis,
        reference: imported.reference,
        relationship: resolved,
      });
};

/** Resolves one supported inline, local, or relative-imported tools map. */
export const resolveVercelAiSdkToolMap = async (
  session: IVercelAiSdkInspectionSession,
  analysis: IVercelAiSdkSourceAnalysis,
  relationship: IVercelAiSdkRelationship,
  relatedRelationships: readonly IVercelAiSdkRelationship[] = [relationship],
): Promise<IVercelAiSdkResolvedToolMap | null> => {
  if (relationship.kind !== 'present') {
    return null;
  }

  const candidate = unwrapExpression(relationship.expression);

  if (ts.isObjectLiteralExpression(candidate)) {
    return Object.freeze({ analysis, map: getVercelAiSdkToolMap(candidate), reference: null });
  }

  if (!ts.isIdentifier(candidate)) {
    return null;
  }

  const local = getSafeLocalConstInitializer(
    analysis,
    candidate,
    collectRelationshipReferences(relatedRelationships),
  );

  if (local !== null && ts.isObjectLiteralExpression(local.initializer)) {
    return Object.freeze({
      analysis,
      map: getVercelAiSdkToolMap(local.initializer),
      reference: Object.freeze({ path: analysis.path, symbol: candidate.text }),
    });
  }

  const imported = await resolveImportedConst(session, analysis, candidate);

  if (imported === null || !ts.isObjectLiteralExpression(imported.initializer)) {
    return null;
  }

  return Object.freeze({
    analysis: imported.analysis,
    map: getVercelAiSdkToolMap(imported.initializer),
    reference: imported.reference,
  });
};
