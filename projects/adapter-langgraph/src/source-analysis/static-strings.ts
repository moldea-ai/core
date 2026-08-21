import type ts from 'typescript';

import { resolveStaticString } from '@moldea.ai/adapter-static-analysis';
import { parseRepositoryPath } from '@moldea.ai/repository';

import type {
  ILangGraphInspectionSession,
  ILangGraphSourceAnalysis,
  ILangGraphSourceFailure,
  ILangGraphStaticStringResult,
} from '../contracts/index.js';

/** Resolves one supported static string across local and relative immutable bindings. */
export const resolveLangGraphStaticString = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphStaticStringResult> => {
  const result = await resolveStaticString({
    analysis,
    analyzeSource: (path) => session.analyzeSource(parseRepositoryPath(path)),
    expression,
    getEntry: (path) => session.getEntry(parseRepositoryPath(path)),
    parsePath: parseRepositoryPath,
    ...(onSourceFailure === undefined
      ? {}
      : {
          onSourceFailure: (path, failure) =>
            onSourceFailure(Object.freeze({ ...failure, path: parseRepositoryPath(path) })),
        }),
    ...(session.signal === undefined ? {} : { signal: session.signal }),
  });

  return result.kind === 'supported'
    ? Object.freeze({
        kind: 'supported',
        value: Object.freeze({ analysis, expression: result.expression, value: result.value }),
      })
    : Object.freeze({ kind: 'unsupported' });
};
