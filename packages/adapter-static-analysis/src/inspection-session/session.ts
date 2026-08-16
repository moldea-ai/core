import type {
  IStaticAnalysisInspectionSession,
  IStaticAnalysisInspectionSessionOptions,
} from '../types.js';

/**
 * Creates an operation-local inspection session with deterministic promise caches.
 * @param options Provider callbacks and the optional operation signal.
 * @returns Cached source, package, and entry inspection functions.
 * @throws If the inspection is aborted.
 */
export const createInspectionSession = <
  TPath extends string,
  TSourceResult,
  TPackageResult,
  TEntry,
>(
  options: IStaticAnalysisInspectionSessionOptions<TPath, TSourceResult, TPackageResult, TEntry>,
): IStaticAnalysisInspectionSession<TPath, TSourceResult, TPackageResult, TEntry> => {
  const sourceCache = new Map<TPath, Promise<TSourceResult>>();
  const packageCache = new Map<TPath, Promise<TPackageResult>>();
  const entryCache = new Map<TPath, Promise<TEntry>>();

  const analyzeSource = (path: TPath): Promise<TSourceResult> => {
    options.signal?.throwIfAborted();
    const existing = sourceCache.get(path);

    if (existing !== undefined) {
      return existing;
    }

    const analysis = (async (): Promise<TSourceResult> => {
      options.signal?.throwIfAborted();
      const bytes = await options.readFile(path, options.signal);
      options.signal?.throwIfAborted();
      const result = await options.analyzeSource(path, bytes, options.signal);
      options.signal?.throwIfAborted();
      return result;
    })();
    sourceCache.set(path, analysis);
    return analysis;
  };

  const discoverPackage = (path: TPath): Promise<TPackageResult> => {
    options.signal?.throwIfAborted();
    const existing = packageCache.get(path);

    if (existing !== undefined) {
      return existing;
    }

    const discovery = options.discoverPackage(path, options.signal);
    packageCache.set(path, discovery);
    return discovery;
  };

  const getEntry = (path: TPath): Promise<TEntry> => {
    options.signal?.throwIfAborted();
    const existing = entryCache.get(path);

    if (existing !== undefined) {
      return existing;
    }

    const entry = options.getEntry(path, options.signal);
    entryCache.set(path, entry);
    return entry;
  };

  return Object.freeze({
    analyzeSource,
    discoverPackage,
    getEntry,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
};
