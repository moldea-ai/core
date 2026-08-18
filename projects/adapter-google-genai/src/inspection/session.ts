import { createInspectionSession } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterContext } from '@moldea.ai/core/adapter';

import type { IGoogleGenAiInspectionSession } from '../contracts/index.js';
import { discoverGoogleGenAiPackage } from '../package-discovery/index.js';
import { analyzeGoogleGenAiSource } from '../source-analysis/index.js';

/**
 * Creates one operation-local Google Gen AI inspection session and its deterministic caches.
 * @param context The Core-owned adapter context.
 * @returns The source and package analysis session.
 */
export const createGoogleGenAiInspectionSession = (
  context: IRuntimeAdapterContext,
): IGoogleGenAiInspectionSession =>
  createInspectionSession({
    analyzeSource: analyzeGoogleGenAiSource,
    discoverPackage: (path, signal) => discoverGoogleGenAiPackage(context.repository, path, signal),
    getEntry: (path, signal) =>
      context.repository.getEntry(path, signal === undefined ? undefined : { signal }),
    readFile: (path, signal) =>
      context.repository.readFile(path, signal === undefined ? undefined : { signal }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
