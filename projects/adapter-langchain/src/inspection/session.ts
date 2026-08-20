import { createInspectionSession } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterContext } from '@moldea.ai/core/adapter';

import type { ILangChainInspectionSession } from '../contracts/index.js';
import { discoverLangChainPackages } from '../package-discovery/index.js';
import { analyzeLangChainSource } from '../source-analysis/index.js';

/** Creates one operation-local LangChain inspection session. */
export const createLangChainInspectionSession = (
  context: IRuntimeAdapterContext,
): ILangChainInspectionSession =>
  createInspectionSession({
    analyzeSource: analyzeLangChainSource,
    discoverPackage: (path, signal) => discoverLangChainPackages(context.repository, path, signal),
    getEntry: (path, signal) =>
      context.repository.getEntry(path, signal === undefined ? undefined : { signal }),
    readFile: (path, signal) =>
      context.repository.readFile(path, signal === undefined ? undefined : { signal }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
