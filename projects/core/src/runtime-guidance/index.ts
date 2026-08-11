import type { IRepositoryPath, IRepositoryReader } from '@moldea.ai/repository';

import type { ICanonicalDiscoveryResult } from '../canonical-discovery/index.js';
import type { IIndexedRuntimeGuidance } from '../contracts/index.js';
import {
  createCoreDiagnosticCollector,
  escapeJsonPointerSegment,
  type ICoreDiagnosticCollector,
} from '../diagnostic-utilities/index.js';
import type { ICoreDiagnostic } from '../diagnostics/index.js';
import { compareExactStrings, hasNonWhitespace } from '../format-validation/index.js';
import type { IMoldeaManifestV1 } from '../format/index.js';
import { freezeRecursively } from '../immutable/index.js';
import type { ICoreOptionsSnapshot } from '../options/index.js';
import { readRepositoryTextAsset } from '../repository-text/index.js';

// internal runtime-guidance result retained for final project indexing
export interface IRuntimeGuidanceResult {
  readonly valid: boolean;
  readonly runtimes: readonly IIndexedRuntimeGuidance[];
  readonly diagnostics: readonly ICoreDiagnostic[];
}

const addDiagnostics = (
  collector: ICoreDiagnosticCollector,
  diagnostics: readonly ICoreDiagnostic[],
): void => {
  for (const diagnostic of diagnostics) {
    collector.add(diagnostic);
  }
};

const isBlockedPath = (path: IRepositoryPath, blockedPaths: ReadonlySet<string>): boolean => {
  let candidate: string = path;

  while (candidate.length > 0) {
    if (blockedPaths.has(candidate)) {
      return true;
    }

    const separatorIndex = candidate.lastIndexOf('/');
    if (separatorIndex <= 0) {
      return false;
    }

    candidate = candidate.slice(0, separatorIndex);
  }

  return false;
};

/**
 * Reads all discovered runtime guidance and validates every manifest guidance relationship.
 * @param repository The coherent source-neutral repository reader.
 * @param manifestPath The canonical manifest path used for relationship diagnostics.
 * @param manifest The normalized manifest declaring optional agent guidance paths, when valid.
 * @param discovery The canonical inventory and path-owned structural diagnostics.
 * @param options The immutable Core configuration snapshot.
 * @param signal Optional cancellation forwarded to every repository read.
 * @returns Deeply immutable valid guidance assets and deterministic diagnostics.
 * @throws
 * - ENTRY_NOT_FOUND: A discovered guidance file disappeared from the reader snapshot.
 * - ENTRY_NOT_FILE: A discovered guidance entry is no longer a regular file.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during guidance reads.
 * - INVALID_SOURCE_DATA: The repository reader returned invalid contract data.
 * - RESOURCE_LIMIT_EXCEEDED: A Core or repository resource limit was exceeded.
 * - ABORTED: Guidance inspection or a repository operation was aborted.
 */
export const readRuntimeGuidance = async (
  repository: IRepositoryReader,
  manifestPath: IRepositoryPath,
  manifest: IMoldeaManifestV1 | null,
  discovery: ICanonicalDiscoveryResult,
  options: ICoreOptionsSnapshot,
  signal?: AbortSignal,
): Promise<IRuntimeGuidanceResult> => {
  const collector = createCoreDiagnosticCollector(options.limits, 'inspect-project');
  const runtimes: IIndexedRuntimeGuidance[] = [];
  const discoveredPaths = new Set(discovery.inventory.runtimeGuidance);
  const blockedPaths = new Set(
    discovery.diagnostics.flatMap((diagnostic) =>
      diagnostic.path === null ? [] : [diagnostic.path],
    ),
  );

  for (const path of [...discoveredPaths].sort(compareExactStrings)) {
    const result = await readRepositoryTextAsset(repository, path, options.limits, signal);
    addDiagnostics(collector, result.diagnostics);

    if (result.asset === null) {
      continue;
    }

    if (!hasNonWhitespace(result.asset.content)) {
      collector.add({ code: 'MOLDEA_RUNTIME_GUIDANCE_EMPTY', path });
      continue;
    }

    runtimes.push({ asset: result.asset });
  }

  for (const agentId of Object.keys(manifest?.agents ?? {}).sort(compareExactStrings)) {
    const guidance = manifest?.agents?.[agentId]?.framework.guidance;

    if (
      guidance === undefined ||
      discoveredPaths.has(guidance) ||
      isBlockedPath(guidance, blockedPaths)
    ) {
      continue;
    }

    collector.add({
      code: 'MOLDEA_RUNTIME_GUIDANCE_MISSING',
      details: { referencedPath: guidance },
      entity: { agentId },
      path: manifestPath,
      pointer: `/agents/${escapeJsonPointerSegment(agentId)}/framework/guidance`,
    });
  }

  const diagnostics = collector.finalize();

  return freezeRecursively({
    diagnostics,
    runtimes,
    valid: diagnostics.length === 0,
  });
};
