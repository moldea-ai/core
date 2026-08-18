import { createInspectionSession } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterContext } from '@moldea.ai/core/adapter';

import type { IOpenAiInspectionSession } from '../contracts/index.js';
import { discoverOpenAiPackage } from '../package-discovery/index.js';
import { analyzeOpenAiSource } from '../source-analysis/index.js';

/**
 * Creates one operation-local OpenAI inspection session and its deterministic caches.
 * @param context The Core-owned adapter context.
 * @returns The source and package analysis session.
 */
export const createOpenAiInspectionSession = (
  context: IRuntimeAdapterContext,
): IOpenAiInspectionSession =>
  createInspectionSession({
    analyzeSource: analyzeOpenAiSource,
    discoverPackage: (path, signal) => discoverOpenAiPackage(context.repository, path, signal),
    getEntry: (path, signal) =>
      context.repository.getEntry(path, signal === undefined ? undefined : { signal }),
    readFile: (path, signal) =>
      context.repository.readFile(path, signal === undefined ? undefined : { signal }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
