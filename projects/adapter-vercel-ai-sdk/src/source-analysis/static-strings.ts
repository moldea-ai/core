import type ts from 'typescript';

import { resolveStaticString } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';
import { parseRepositoryPath } from '@moldea.ai/repository';

import type {
  IVercelAiSdkInspectionSession,
  IVercelAiSdkSourceAnalysis,
  IVercelAiSdkStaticStringResult,
} from './types.js';

/** Resolves one supported immutable source string across one relative import edge. */
export const resolveVercelAiSdkStaticString = async (
  session: IVercelAiSdkInspectionSession,
  analysis: IVercelAiSdkSourceAnalysis,
  expression: ts.Expression,
): Promise<IVercelAiSdkStaticStringResult> =>
  resolveStaticString<IRepositoryPath, IVercelAiSdkSourceAnalysis, IRepositoryEntry>({
    analysis,
    analyzeSource: (path) => session.analyzeSource(path),
    expression,
    getEntry: (path) => session.getEntry(path),
    parsePath: (path) => parseRepositoryPath(path),
    ...(session.signal === undefined ? {} : { signal: session.signal }),
  });
