import { posix } from 'node:path';
import ts from 'typescript';

import { unwrapExpression } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryReference } from '@moldea.ai/core/format';
import { parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import type { IEveInspectionSession, IEveSourceAnalysis } from '../contracts/index.js';
import { isEveFunctionDeclaration } from '../source-analysis/index.js';

export type IEveBindingState = 'different' | 'missing' | 'unresolved' | 'wired';

const resolveRelativeImportPath = (
  containingPath: IRepositoryPath,
  moduleSpecifier: string,
): IRepositoryPath | null => {
  if (!moduleSpecifier.startsWith('.')) {
    return null;
  }

  const resolved = posix.resolve(posix.dirname(containingPath), moduleSpecifier);

  if (resolved.endsWith('.js')) {
    return parseRepositoryPath(`${resolved.slice(0, -3)}.ts`);
  }

  return resolved.endsWith('.ts') ? parseRepositoryPath(resolved) : null;
};

const isSupportedRuntimeSymbol = (
  analysis: IEveSourceAnalysis,
  symbol: string,
  requiresFunction: boolean,
): boolean => {
  const declaration = analysis.runtimeSymbols.get(symbol);

  if (declaration === undefined) {
    return false;
  }

  return !requiresFunction || isEveFunctionDeclaration(declaration);
};

/** Classifies whether one direct expression uses the exact manifest-bound runtime value. */
export const classifyEveBoundExpression = async (
  session: IEveInspectionSession,
  analysis: IEveSourceAnalysis,
  expression: ts.Expression | null,
  reference: IRepositoryReference,
  requiresFunction = false,
): Promise<IEveBindingState> => {
  if (reference.symbol === undefined || reference.symbol === 'default') {
    return 'unresolved';
  }

  const boundResult = await session.analyzeSource(reference.path);

  if (boundResult.kind !== 'valid') {
    return 'unresolved';
  }

  const isSameModule = analysis.path === reference.path;

  if (isSameModule) {
    if (!boundResult.analysis.runtimeSymbols.has(reference.symbol)) {
      return boundResult.analysis.exports.has(reference.symbol) ? 'unresolved' : 'missing';
    }

    if (!isSupportedRuntimeSymbol(boundResult.analysis, reference.symbol, requiresFunction)) {
      return 'unresolved';
    }
  } else {
    const exported = boundResult.analysis.exports.get(reference.symbol);

    if (exported === undefined) {
      return 'missing';
    }

    if (
      exported.kind !== 'present-supported' ||
      !isSupportedRuntimeSymbol(boundResult.analysis, reference.symbol, requiresFunction)
    ) {
      return 'unresolved';
    }
  }

  if (expression === null) {
    return 'different';
  }

  const candidate = unwrapExpression(expression);

  if (!ts.isIdentifier(candidate)) {
    return 'unresolved';
  }

  if (
    analysis.path === reference.path &&
    candidate.text === reference.symbol &&
    isSupportedRuntimeSymbol(analysis, candidate.text, requiresFunction)
  ) {
    return 'wired';
  }

  const imported = analysis.namedImports.get(candidate.text);

  if (imported === undefined) {
    return analysis.runtimeSymbols.has(candidate.text) ? 'different' : 'unresolved';
  }

  const importedPath = resolveRelativeImportPath(analysis.path, imported.moduleSpecifier);

  return importedPath === reference.path && imported.importedName === reference.symbol
    ? 'wired'
    : 'different';
};

/** Classifies one direct call to an exact manifest-bound function. */
export const classifyEveBoundCall = async (
  session: IEveInspectionSession,
  analysis: IEveSourceAnalysis,
  expression: ts.Expression | null,
  reference: IRepositoryReference,
): Promise<IEveBindingState> => {
  if (expression === null) {
    return classifyEveBoundExpression(session, analysis, null, reference, true);
  }

  const candidate = unwrapExpression(expression);

  return ts.isCallExpression(candidate)
    ? classifyEveBoundExpression(session, analysis, candidate.expression, reference, true)
    : 'unresolved';
};
