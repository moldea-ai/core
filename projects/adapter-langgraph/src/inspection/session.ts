import { createInspectionSession } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterContext } from '@moldea.ai/core/adapter';

import type { ILangGraphInspectionSession } from '../contracts/index.js';
import { discoverLangGraphPackages } from '../package-discovery/index.js';
import { analyzeLangGraphSource } from '../source-analysis/index.js';

/** Creates one operation-local LangGraph inspection session. */
export const createLangGraphInspectionSession = (
  context: IRuntimeAdapterContext,
): ILangGraphInspectionSession =>
  createInspectionSession({
    analyzeSource: analyzeLangGraphSource,
    discoverPackage: (path, signal) => discoverLangGraphPackages(context.repository, path, signal),
    getEntry: (path, signal) =>
      context.repository.getEntry(path, signal === undefined ? undefined : { signal }),
    readFile: (path, signal) =>
      context.repository.readFile(path, signal === undefined ? undefined : { signal }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
