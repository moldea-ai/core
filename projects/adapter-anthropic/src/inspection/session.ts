import type { IRuntimeAdapterContext } from '@moldea.ai/core/adapter';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

import type {
  IAnthropicInspectionSession,
  IAnthropicSourceAnalysisResult,
} from '../contracts/index.js';
import { discoverAnthropicPackage } from '../package-discovery/index.js';
import { analyzeAnthropicSource } from '../source-analysis/index.js';

/**
 * Creates one operation-local Anthropic inspection session and its deterministic caches.
 * @param context The Core-owned adapter context.
 * @returns The source and package analysis session.
 */
export const createAnthropicInspectionSession = (
  context: IRuntimeAdapterContext,
): IAnthropicInspectionSession => {
  const sourceCache = new Map<IRepositoryPath, Promise<IAnthropicSourceAnalysisResult>>();
  const packageCache = new Map<IRepositoryPath, ReturnType<typeof discoverAnthropicPackage>>();
  const entryCache = new Map<IRepositoryPath, Promise<IRepositoryEntry | null>>();

  const analyzeSource = (path: IRepositoryPath): Promise<IAnthropicSourceAnalysisResult> => {
    context.signal?.throwIfAborted();
    const existing = sourceCache.get(path);

    if (existing !== undefined) {
      return existing;
    }

    const analysis = (async (): Promise<IAnthropicSourceAnalysisResult> => {
      context.signal?.throwIfAborted();
      const bytes = await context.repository.readFile(
        path,
        context.signal === undefined ? undefined : { signal: context.signal },
      );
      context.signal?.throwIfAborted();
      return analyzeAnthropicSource(path, bytes, context.signal);
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

    const discovery = discoverAnthropicPackage(context.repository, path, context.signal);
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
