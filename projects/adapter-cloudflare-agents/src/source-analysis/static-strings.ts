import type ts from 'typescript';

import { resolveStaticString } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';
import { parseRepositoryPath } from '@moldea.ai/repository';

import type {
  ICloudflareAgentsInspectionSession,
  ICloudflareAgentsSourceAnalysis,
  ICloudflareAgentsStaticStringResult,
} from './types.js';

/** Resolves one supported immutable source string across one relative import edge. */
export const resolveCloudflareAgentsStaticString = async (
  session: ICloudflareAgentsInspectionSession,
  analysis: ICloudflareAgentsSourceAnalysis,
  expression: ts.Expression,
): Promise<ICloudflareAgentsStaticStringResult> =>
  resolveStaticString<IRepositoryPath, ICloudflareAgentsSourceAnalysis, IRepositoryEntry>({
    analysis,
    analyzeSource: (path) => session.analyzeSource(path),
    expression,
    getEntry: (path) => session.getEntry(path),
    parsePath: (path) => parseRepositoryPath(path),
    ...(session.signal === undefined ? {} : { signal: session.signal }),
  });
