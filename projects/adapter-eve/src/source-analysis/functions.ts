import { posix } from 'node:path';
import ts from 'typescript';

import { unwrapExpression } from '@moldea.ai/adapter-static-analysis';
import { parseRepositoryPath } from '@moldea.ai/repository';

import type { IEveInspectionSession, IEveSourceAnalysis } from '../contracts/index.js';

/** Determines whether a declaration is one supported runtime function value. */
export const isEveFunctionDeclaration = (declaration: ts.Declaration | undefined): boolean => {
  if (declaration === undefined) {
    return false;
  }

  if (ts.isFunctionDeclaration(declaration)) {
    return declaration.body !== undefined;
  }

  if (!ts.isVariableDeclaration(declaration) || declaration.initializer === undefined) {
    return false;
  }

  const initializer = unwrapExpression(declaration.initializer);

  return ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer);
};

/** Classifies an inline or module-local direct runtime function expression. */
export const isEveFunctionValue = (
  analysis: IEveSourceAnalysis,
  expression: ts.Expression,
): boolean => {
  const candidate = unwrapExpression(expression);

  return (
    ts.isArrowFunction(candidate) ||
    ts.isFunctionExpression(candidate) ||
    (ts.isIdentifier(candidate) &&
      isEveFunctionDeclaration(analysis.runtimeSymbols.get(candidate.text)))
  );
};

/** Resolves an inline, module-local, or exact relative-imported runtime function. */
export const isEveResolvedFunctionValue = async (
  session: IEveInspectionSession,
  analysis: IEveSourceAnalysis,
  expression: ts.Expression,
): Promise<boolean> => {
  if (isEveFunctionValue(analysis, expression)) {
    return true;
  }

  const candidate = unwrapExpression(expression);

  if (!ts.isIdentifier(candidate)) {
    return false;
  }

  const imported = analysis.namedImports.get(candidate.text);

  if (imported === undefined || !imported.moduleSpecifier.startsWith('.')) {
    return false;
  }

  const resolved = posix.resolve(posix.dirname(analysis.path), imported.moduleSpecifier);
  const path = parseRepositoryPath(
    resolved.endsWith('.js') ? `${resolved.slice(0, -3)}.ts` : resolved,
  );
  const entry = await session.getEntry(path);

  if (entry?.type !== 'file' || !path.endsWith('.ts')) {
    return false;
  }

  const result = await session.analyzeSource(path);
  const exported =
    result.kind === 'valid' ? result.analysis.exports.get(imported.importedName) : undefined;

  return (
    result.kind === 'valid' &&
    exported?.kind === 'present-supported' &&
    isEveFunctionDeclaration(result.analysis.runtimeSymbols.get(imported.importedName))
  );
};
