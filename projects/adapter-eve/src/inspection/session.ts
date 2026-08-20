import { createInspectionSession } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterContext } from '@moldea.ai/core/adapter';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

import type { IEveAgentRootIndex, IEveInspectionSession } from '../contracts/index.js';
import { discoverEvePackage } from '../package-discovery/index.js';
import { createEveAgentRootIndex } from '../repository-discovery/index.js';
import { analyzeEveSource } from '../source-analysis/index.js';

/** Creates one operation-local Eve inspection session with source and listing caches. */
export const createEveInspectionSession = (
  context: IRuntimeAdapterContext,
): IEveInspectionSession => {
  const base = createInspectionSession({
    analyzeSource: analyzeEveSource,
    discoverPackage: (path, signal) => discoverEvePackage(context.repository, path, signal),
    getEntry: (path, signal) =>
      context.repository.getEntry(path, signal === undefined ? undefined : { signal }),
    readFile: (path, signal) =>
      context.repository.readFile(path, signal === undefined ? undefined : { signal }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
  const rootCache = new Map<IRepositoryPath, Promise<IEveAgentRootIndex>>();

  const indexAgentRoot = (path: IRepositoryPath): Promise<IEveAgentRootIndex> => {
    context.signal?.throwIfAborted();
    const existing = rootCache.get(path);

    if (existing !== undefined) {
      return existing;
    }

    const indexed = (async (): Promise<IEveAgentRootIndex> => {
      const entries: IRepositoryEntry[] = [];

      for await (const entry of context.repository.listEntries({
        prefix: path,
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      })) {
        context.signal?.throwIfAborted();
        entries.push(entry);
      }

      return createEveAgentRootIndex(path, entries);
    })();

    rootCache.set(path, indexed);
    return indexed;
  };

  return Object.freeze({
    ...base,
    indexAgentRoot,
    reader: context.repository,
  });
};
