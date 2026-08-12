import type { IRepositoryPath, IRepositoryReader } from '@moldea.ai/repository';

import type { ICanonicalDiscoveryResult } from '../canonical-discovery/index.js';
import type { IIndexedContextAsset, IIndexedTextAsset } from '../contracts/index.js';
import {
  createCoreDiagnosticCollector,
  type ICoreDiagnosticCollector,
} from '../diagnostic-utilities/index.js';
import type { ICoreDiagnostic } from '../diagnostics/index.js';
import { compareExactStrings, hasNonWhitespace } from '../format-validation/index.js';
import type { IMoldeaManifestV1 } from '../format/index.js';
import { freezeRecursively } from '../immutable/index.js';
import { createCoreOperationOptionsSnapshot, type ICoreOptionsSnapshot } from '../options/index.js';
import { readRepositoryTextAsset } from '../repository-text/index.js';

// internal project and focused-context assets retained for provisional indexing
export interface IProjectAssetInspectionResult {
  readonly valid: boolean;
  readonly project: IIndexedTextAsset | null;
  readonly context: readonly IIndexedContextAsset[];
  readonly diagnostics: readonly ICoreDiagnostic[];
}

// project foundation retained across discovery without repeating normalization or hashing
export interface IProjectFileInspectionResult {
  readonly valid: boolean;
  readonly project: IIndexedTextAsset | null;
  readonly diagnostics: readonly ICoreDiagnostic[];
}

const addDiagnostics = (
  collector: ICoreDiagnosticCollector,
  diagnostics: readonly ICoreDiagnostic[],
): void => {
  for (const diagnostic of diagnostics) {
    collector.merge(diagnostic);
  }
};

/**
 * Reads and validates the project foundation before canonical enumeration.
 * @param repository The coherent source-neutral reader for the active inspection session.
 * @param path The canonical project path when its exact entry is a regular file.
 * @param options The immutable Core configuration snapshot.
 * @param signal Optional cancellation forwarded to the repository read.
 * @returns The deeply immutable project asset or deterministic content diagnostics.
 * @throws
 * - ENTRY_NOT_FOUND: The located project file disappeared from the snapshot.
 * - ENTRY_NOT_FILE: The located project entry changed type during inspection.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the project read.
 * - INVALID_SOURCE_DATA: The repository reader returned invalid contract data.
 * - RESOURCE_LIMIT_EXCEEDED: A Core or repository resource limit was exceeded.
 * - ABORTED: Project inspection or the repository read was aborted.
 */
export const readProjectFile = async (
  repository: IRepositoryReader,
  path: IRepositoryPath | null,
  options: ICoreOptionsSnapshot,
  signal?: AbortSignal,
): Promise<IProjectFileInspectionResult> => {
  options = createCoreOperationOptionsSnapshot(options);
  const collector = createCoreDiagnosticCollector(options.limits, 'inspect-project');
  let project: IIndexedTextAsset | null = null;

  if (path !== null) {
    const result = await readRepositoryTextAsset(repository, path, options.limits, signal);
    addDiagnostics(collector, result.diagnostics);

    if (result.asset !== null) {
      if (hasNonWhitespace(result.asset.content)) {
        project = result.asset;
      } else {
        collector.add({ code: 'MOLDEA_PROJECT_FILE_EMPTY', path: result.asset.path });
      }
    }
  }

  const diagnostics = collector.finalize();

  return freezeRecursively({
    diagnostics,
    project,
    valid: diagnostics.length === 0,
  });
};

/**
 * Reads the project foundation and every discovered focused-context asset.
 * @param repository The coherent source-neutral reader for the active inspection session.
 * @param manifest The normalized manifest used to attach context relationships, when valid.
 * @param discovery The canonical inventory and path-owned structural diagnostics.
 * @param options The immutable Core configuration snapshot.
 * @param signal Optional cancellation forwarded to every repository read.
 * @param projectFile Optional project foundation already read before canonical enumeration.
 * @returns Deeply immutable valid assets and deterministic content diagnostics.
 * @throws
 * - ENTRY_NOT_FOUND: A discovered project or context file disappeared from the snapshot.
 * - ENTRY_NOT_FILE: A discovered project or context entry changed type during inspection.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during asset reads.
 * - INVALID_SOURCE_DATA: The repository reader returned invalid contract data.
 * - RESOURCE_LIMIT_EXCEEDED: A Core or repository resource limit was exceeded.
 * - ABORTED: Project asset inspection or a repository operation was aborted.
 */
export const readProjectAssets = async (
  repository: IRepositoryReader,
  manifest: IMoldeaManifestV1 | null,
  discovery: ICanonicalDiscoveryResult,
  options: ICoreOptionsSnapshot,
  signal?: AbortSignal,
  projectFile?: IProjectFileInspectionResult,
): Promise<IProjectAssetInspectionResult> => {
  options = createCoreOperationOptionsSnapshot(options);
  const collector = createCoreDiagnosticCollector(options.limits, 'inspect-project');
  const context: IIndexedContextAsset[] = [];
  const inspectedProject =
    projectFile ??
    (await readProjectFile(repository, discovery.inventory.project, options, signal));
  addDiagnostics(collector, inspectedProject.diagnostics);

  for (const path of [...discovery.inventory.context].sort(compareExactStrings)) {
    const result = await readRepositoryTextAsset(repository, path, options.limits, signal);
    addDiagnostics(collector, result.diagnostics);

    if (result.asset === null) {
      continue;
    }

    if (!hasNonWhitespace(result.asset.content)) {
      collector.add({ code: 'MOLDEA_CONTEXT_FILE_EMPTY', path });
      continue;
    }

    context.push({
      asset: result.asset,
      relationships: manifest?.context?.[path] ?? null,
    });
  }

  const diagnostics = collector.finalize();

  return freezeRecursively({
    context,
    diagnostics,
    project: inspectedProject.project,
    valid: diagnostics.length === 0,
  });
};
