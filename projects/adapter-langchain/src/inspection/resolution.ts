import ts from 'typescript';

import {
  getConstExport,
  isModuleBindingVisible,
  isModuleConstValueSafe,
  resolveBindingReferences,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import { parseRepositoryPath } from '@moldea.ai/repository';

import type {
  ILangChainInspectionSession,
  ILangChainRelationship,
  ILangChainResolvedArrayResult,
  ILangChainSourceAnalysis,
} from '../contracts/index.js';

const collectRelationshipReferences = (
  relationships: readonly ILangChainRelationship[],
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

/** Resolves one closed inline, module-local, or relative-imported array literal. */
export const resolveLangChainArray = async (
  session: ILangChainInspectionSession,
  analysis: ILangChainSourceAnalysis,
  relationship: ILangChainRelationship,
  relatedRelationships: readonly ILangChainRelationship[] = [relationship],
): Promise<ILangChainResolvedArrayResult> => {
  if (relationship.kind !== 'present') {
    return Object.freeze({ kind: 'unresolved' });
  }

  const candidate = unwrapExpression(relationship.expression);

  if (ts.isArrayLiteralExpression(candidate)) {
    return Object.freeze({
      kind: 'resolved',
      value: Object.freeze({ analysis, expression: candidate, reference: null }),
    });
  }

  if (!ts.isIdentifier(candidate) || !isModuleBindingVisible(candidate, analysis)) {
    return Object.freeze({ kind: 'unresolved' });
  }

  const localDeclaration = analysis.moduleConstDeclarations.get(candidate.text);
  const localInitializer =
    localDeclaration?.initializer === undefined
      ? null
      : unwrapExpression(localDeclaration.initializer);

  if (
    localDeclaration !== undefined &&
    localInitializer !== null &&
    ts.isArrayLiteralExpression(localInitializer) &&
    isModuleConstValueSafe(
      analysis,
      localDeclaration,
      collectRelationshipReferences(relatedRelationships),
      'array',
    )
  ) {
    return Object.freeze({
      kind: 'resolved',
      value: Object.freeze({
        analysis,
        expression: localInitializer,
        reference: Object.freeze({ path: analysis.path, symbol: candidate.text }),
      }),
    });
  }

  const importedCandidates = [];

  for (const reference of resolveBindingReferences(candidate, analysis).filter(
    ({ path }) => path !== analysis.path,
  )) {
    session.signal?.throwIfAborted();
    const path = parseRepositoryPath(reference.path);
    const entry = await session.getEntry(path);

    if (entry?.type === 'file') {
      importedCandidates.push({ path, symbol: reference.symbol });
    }
  }

  if (importedCandidates.length !== 1) {
    return Object.freeze({ kind: 'unresolved' });
  }

  const importedReference = importedCandidates[0] as {
    readonly path: ReturnType<typeof parseRepositoryPath>;
    readonly symbol: string;
  };
  const source = await session.analyzeSource(importedReference.path);

  if (source.kind !== 'valid') {
    return Object.freeze({
      failure: Object.freeze({ ...source, path: importedReference.path }),
      kind: 'source-failure',
    });
  }

  const exported = getConstExport(source.analysis, importedReference.symbol);
  const declaration = source.analysis.moduleConstDeclarations.get(importedReference.symbol);

  if (
    exported.kind !== 'present-supported' ||
    exported.expression === undefined ||
    !ts.isArrayLiteralExpression(exported.expression) ||
    declaration === undefined ||
    !isModuleConstValueSafe(source.analysis, declaration, new Set(), 'array')
  ) {
    return Object.freeze({ kind: 'unresolved' });
  }

  return Object.freeze({
    kind: 'resolved',
    value: Object.freeze({
      analysis: source.analysis,
      expression: exported.expression,
      reference: Object.freeze(importedReference),
    }),
  });
};

/** Determines whether an array has no holes or spread elements. */
export const isClosedLangChainArray = (array: ts.ArrayLiteralExpression): boolean =>
  array.elements.every(
    (element) => !ts.isOmittedExpression(element) && !ts.isSpreadElement(element),
  );
