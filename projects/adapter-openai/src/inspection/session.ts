import type { IRuntimeAdapterContext } from '@moldea.ai/core/adapter';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

import type { IOpenAiInspectionSession, IOpenAiSourceAnalysisResult } from '../contracts/index.js';
import { discoverOpenAiPackage } from '../package-discovery/index.js';
import { analyzeOpenAiSource } from '../source-analysis/index.js';

/**
 * Creates one operation-local OpenAI inspection session and its deterministic caches.
 * @param context The Core-owned adapter context.
 * @returns The source and package analysis session.
 */
export const createOpenAiInspectionSession = (
  context: IRuntimeAdapterContext,
): IOpenAiInspectionSession => {
  const sourceCache = new Map<IRepositoryPath, Promise<IOpenAiSourceAnalysisResult>>();
  const packageCache = new Map<IRepositoryPath, ReturnType<typeof discoverOpenAiPackage>>();
  const entryCache = new Map<IRepositoryPath, Promise<IRepositoryEntry | null>>();

  const analyzeSource = (path: IRepositoryPath): Promise<IOpenAiSourceAnalysisResult> => {
    context.signal?.throwIfAborted();
    const existing = sourceCache.get(path);

    if (existing !== undefined) {
      return existing;
    }

    const analysis = (async (): Promise<IOpenAiSourceAnalysisResult> => {
      context.signal?.throwIfAborted();
      const bytes = await context.repository.readFile(
        path,
        context.signal === undefined ? undefined : { signal: context.signal },
      );
      context.signal?.throwIfAborted();
      return analyzeOpenAiSource(path, bytes, context.signal);
    })();
    sourceCache.set(path, analysis);
    return analysis;
  };

  const discoverPackage = (path: IRepositoryPath) => {
    context.signal?.throwIfAborted();
    const existing = packageCache.get(path);

    if (existing !== undefined) {
      return existing;
    }

    const discovery = discoverOpenAiPackage(context.repository, path, context.signal);
    packageCache.set(path, discovery);
    return discovery;
  };

  const getEntry = (path: IRepositoryPath): Promise<IRepositoryEntry | null> => {
    context.signal?.throwIfAborted();
    const existing = entryCache.get(path);

    if (existing !== undefined) {
      return existing;
    }

    const entry = context.repository.getEntry(
      path,
      context.signal === undefined ? undefined : { signal: context.signal },
    );
    entryCache.set(path, entry);
    return entry;
  };

  return Object.freeze({
    analyzeSource,
    discoverPackage,
    getEntry,
    repository: context.repository,
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
};
