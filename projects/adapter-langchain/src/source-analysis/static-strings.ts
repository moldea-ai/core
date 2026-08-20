import type ts from 'typescript';

import { resolveStaticString } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';
import { parseRepositoryPath } from '@moldea.ai/repository';

import type {
  ILangChainInspectionSession,
  ILangChainSourceAnalysisResult,
  ILangChainSourceFailure,
  ILangChainSourceAnalysis,
  ILangChainStaticStringResult,
} from '../contracts/index.js';

/** Resolves one supported immutable source string across relative import edges. */
export const resolveLangChainStaticString = (
  session: ILangChainInspectionSession,
  analysis: ILangChainSourceAnalysis,
  expression: ts.Expression,
  onSourceFailure?: (failure: ILangChainSourceFailure) => void,
): Promise<ILangChainStaticStringResult> =>
  resolveStaticString<IRepositoryPath, ILangChainSourceAnalysis, IRepositoryEntry>({
    analysis,
    analyzeSource: (path) => session.analyzeSource(path),
    expression,
    getEntry: (path) => session.getEntry(path),
    ...(onSourceFailure === undefined
      ? {}
      : {
          onSourceFailure: (
            path: IRepositoryPath,
            result: Exclude<ILangChainSourceAnalysisResult, { readonly kind: 'valid' }>,
          ) => onSourceFailure(Object.freeze({ ...result, path })),
        }),
    parsePath: (path) => parseRepositoryPath(path),
    ...(session.signal === undefined ? {} : { signal: session.signal }),
  });
