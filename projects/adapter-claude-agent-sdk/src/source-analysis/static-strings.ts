import type ts from 'typescript';

import { resolveStaticString } from '@moldea.ai/adapter-static-analysis';
import { parseRepositoryPath } from '@moldea.ai/repository';

import type {
  IClaudeAgentSdkInspectionSession,
  IClaudeAgentSdkSourceAnalysis,
  IClaudeAgentSdkStaticStringResult,
} from '../contracts/index.js';

/**
 * Resolves one exact supported static string without normalization or execution.
 * @param session The operation-local source session.
 * @param analysis The source containing the expression.
 * @param expression The candidate static string expression.
 * @returns The exact compiler-parsed string or an unsupported state.
 */
export const resolveClaudeAgentSdkStaticString = (
  session: IClaudeAgentSdkInspectionSession,
  analysis: IClaudeAgentSdkSourceAnalysis,
  expression: ts.Expression,
): Promise<IClaudeAgentSdkStaticStringResult> =>
  resolveStaticString({
    analysis,
    analyzeSource: (path) => session.analyzeSource(path),
    expression,
    getEntry: (path) => session.getEntry(path),
    parsePath: parseRepositoryPath,
    ...(session.signal === undefined ? {} : { signal: session.signal }),
  });
