import { createInspectionSession } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterContext } from '@moldea.ai/core/adapter';

import type { IVercelAiSdkInspectionSession } from '../contracts/index.js';
import { discoverVercelAiSdkPackage } from '../package-discovery/index.js';
import { analyzeVercelAiSdkSource } from '../source-analysis/index.js';

/** Creates one operation-local Vercel AI SDK inspection session. */
export const createVercelAiSdkInspectionSession = (
  context: IRuntimeAdapterContext,
): IVercelAiSdkInspectionSession =>
  createInspectionSession({
    analyzeSource: analyzeVercelAiSdkSource,
    discoverPackage: (path, signal) => discoverVercelAiSdkPackage(context.repository, path, signal),
    getEntry: (path, signal) =>
      context.repository.getEntry(path, signal === undefined ? undefined : { signal }),
    readFile: (path, signal) =>
      context.repository.readFile(path, signal === undefined ? undefined : { signal }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
