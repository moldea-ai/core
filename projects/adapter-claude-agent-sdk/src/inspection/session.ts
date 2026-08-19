import { createInspectionSession } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterContext } from '@moldea.ai/core/adapter';

import type { IClaudeAgentSdkInspectionSession } from '../contracts/index.js';
import { discoverClaudeAgentSdkPackage } from '../package-discovery/index.js';
import { analyzeClaudeAgentSdkSource } from '../source-analysis/index.js';

/** Creates one operation-local Claude Agent SDK inspection session. */
export const createClaudeAgentSdkInspectionSession = (
  context: IRuntimeAdapterContext,
): IClaudeAgentSdkInspectionSession =>
  createInspectionSession({
    analyzeSource: analyzeClaudeAgentSdkSource,
    discoverPackage: (path, signal) =>
      discoverClaudeAgentSdkPackage(context.repository, path, signal),
    getEntry: (path, signal) =>
      context.repository.getEntry(path, signal === undefined ? undefined : { signal }),
    readFile: (path, signal) =>
      context.repository.readFile(path, signal === undefined ? undefined : { signal }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
