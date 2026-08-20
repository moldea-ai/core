import ts from 'typescript';

import { resolveStaticString, unwrapExpression } from '@moldea.ai/adapter-static-analysis';
import { parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import type { IEveInspectionSession, IEveSourceAnalysis } from '../contracts/index.js';

/** Resolves one exact Eve static string through supported local and relative bindings. */
export const resolveEveStaticString = (
  session: IEveInspectionSession,
  analysis: IEveSourceAnalysis,
  expression: ts.Expression,
) =>
  resolveStaticString({
    analysis,
    analyzeSource: (path) => session.analyzeSource(parseRepositoryPath(path)),
    expression: unwrapExpression(expression),
    getEntry: (path) => session.getEntry(parseRepositoryPath(path)),
    parsePath: (path): IRepositoryPath => parseRepositoryPath(path),
    ...(session.signal === undefined ? {} : { signal: session.signal }),
  });

/** Resolves a closed object whose keys and values are exact static strings. */
export const isEveStaticStringRecord = async (
  session: IEveInspectionSession,
  analysis: IEveSourceAnalysis,
  expression: ts.Expression,
): Promise<boolean> => {
  const candidate = unwrapExpression(expression);

  if (!ts.isObjectLiteralExpression(candidate)) {
    return false;
  }

  const names = new Set<string>();

  for (const property of candidate.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) ||
      property.name.text === '__proto__' ||
      names.has(property.name.text)
    ) {
      return false;
    }

    names.add(property.name.text);

    if (
      (await resolveEveStaticString(session, analysis, property.initializer)).kind !== 'supported'
    ) {
      return false;
    }
  }

  return true;
};
