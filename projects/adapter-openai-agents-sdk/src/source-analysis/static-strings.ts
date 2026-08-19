import ts from 'typescript';

import {
  getConstExport,
  getStaticString,
  isModuleBindingVisible,
  resolveImportCandidatePaths,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import { parseRepositoryPath } from '@moldea.ai/repository';

import type {
  IOpenAiAgentsSdkInspectionSession,
  IOpenAiAgentsSdkSourceAnalysis,
  IOpenAiAgentsSdkStaticStringResult,
} from '../contracts/index.js';

const resolveCandidatePath = async (
  session: IOpenAiAgentsSdkInspectionSession,
  containingPath: string,
  moduleSpecifier: string,
): Promise<ReturnType<typeof parseRepositoryPath> | null> => {
  const matchingPaths: ReturnType<typeof parseRepositoryPath>[] = [];

  for (const candidate of resolveImportCandidatePaths(containingPath, moduleSpecifier)) {
    const path = parseRepositoryPath(candidate);
    const entry = await session.getEntry(path);

    if (entry?.type === 'file') {
      matchingPaths.push(path);
    }
  }

  return matchingPaths.length === 1
    ? (matchingPaths[0] as ReturnType<typeof parseRepositoryPath>)
    : null;
};

const resolveStaticString = async (
  session: IOpenAiAgentsSdkInspectionSession,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  expression: ts.Expression,
  visited: Set<string>,
): Promise<IOpenAiAgentsSdkStaticStringResult> => {
  session.signal?.throwIfAborted();
  const candidate = unwrapExpression(expression);
  const literal = getStaticString(candidate);

  if (literal !== null) {
    return Object.freeze({ expression: candidate, kind: 'supported', value: literal });
  }

  if (!ts.isIdentifier(candidate) || !isModuleBindingVisible(candidate, analysis)) {
    return Object.freeze({ kind: 'unsupported' });
  }

  const localDeclaration = analysis.moduleConstDeclarations.get(candidate.text);

  if (localDeclaration?.initializer !== undefined) {
    const key = `${analysis.path}\0local\0${candidate.text}`;

    if (visited.has(key)) {
      return Object.freeze({ kind: 'unsupported' });
    }

    visited.add(key);
    const result = await resolveStaticString(
      session,
      analysis,
      localDeclaration.initializer,
      visited,
    );
    visited.delete(key);
    return result;
  }

  const namedImport = analysis.namedImports.get(candidate.text);

  if (namedImport === undefined) {
    return Object.freeze({ kind: 'unsupported' });
  }

  const importedPath = await resolveCandidatePath(
    session,
    analysis.path,
    namedImport.moduleSpecifier,
  );

  if (importedPath === null) {
    return Object.freeze({ kind: 'unsupported' });
  }

  const key = `${importedPath}\0export\0${namedImport.importedName}`;

  if (visited.has(key)) {
    return Object.freeze({ kind: 'unsupported' });
  }

  visited.add(key);
  const importedResult = await session.analyzeSource(importedPath);

  if (importedResult.kind !== 'valid') {
    visited.delete(key);
    return Object.freeze({ kind: 'unsupported' });
  }

  const exported = getConstExport(importedResult.analysis, namedImport.importedName);

  if (exported.kind !== 'present-supported' || exported.expression === undefined) {
    visited.delete(key);
    return Object.freeze({ kind: 'unsupported' });
  }

  const result = await resolveStaticString(
    session,
    importedResult.analysis,
    exported.expression,
    visited,
  );
  visited.delete(key);
  return result;
};

/**
 * Resolves one exact supported static string without normalization or execution.
 * @param session The operation-local source session.
 * @param analysis The source containing the expression.
 * @param expression The candidate static string expression.
 * @returns The exact compiler-parsed string or an unsupported state.
 */
export const resolveOpenAiAgentsSdkStaticString = (
  session: IOpenAiAgentsSdkInspectionSession,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  expression: ts.Expression,
): Promise<IOpenAiAgentsSdkStaticStringResult> =>
  resolveStaticString(session, analysis, expression, new Set<string>());
