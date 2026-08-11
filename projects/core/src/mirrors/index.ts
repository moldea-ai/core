import type {
  IRepositoryEntry,
  IRepositoryOperationOptions,
  IRepositoryPath,
  IRepositoryReader,
} from '@moldea.ai/repository';

import type { IInspectedAgentAssets } from '../agent-assets/index.js';
import type { IIndexedMirror, IIndexedTextAsset } from '../contracts/index.js';
import {
  createCoreDiagnosticCollector,
  escapeJsonPointerSegment,
  type ICoreDiagnosticCollector,
} from '../diagnostic-utilities/index.js';
import type { ICoreDiagnostic, ICoreDiagnosticCode } from '../diagnostics/index.js';
import { compareExactStrings } from '../format-validation/index.js';
import { freezeRecursively } from '../immutable/index.js';
import type { ICoreOptionsSnapshot } from '../options/index.js';
import { readRepositoryTextAsset } from '../repository-text/index.js';

// internal mirror records retained for final agent indexing
export interface IAgentMirrorInspection {
  readonly id: string;
  readonly mirrors: readonly IIndexedMirror[];
}

export interface IMirrorInspectionResult {
  readonly valid: boolean;
  readonly agentMirrors: readonly IAgentMirrorInspection[];
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

/** Adds one declaration-owned mirror diagnostic with safe target metadata. */
const addMirrorDiagnostic = (
  collector: ICoreDiagnosticCollector,
  code: ICoreDiagnosticCode,
  manifestPath: IRepositoryPath,
  mirrorPath: IRepositoryPath,
  pointer: string,
  agentId: string,
  entry?: IRepositoryEntry,
): void => {
  collector.add({
    code,
    details: {
      ...(entry === undefined ? {} : { actualType: entry.type }),
      mirrorPath,
    },
    entity: { agentId },
    path: manifestPath,
    pointer,
  });
};

/** Resolves, normalizes, and compares one declared mirror. */
const inspectMirror = async (
  repository: IRepositoryReader,
  manifestPath: IRepositoryPath,
  canonicalInstruction: IIndexedTextAsset,
  mirrorPath: IRepositoryPath,
  pointer: string,
  agentId: string,
  options: ICoreOptionsSnapshot,
  collector: ICoreDiagnosticCollector,
  operationOptions: IRepositoryOperationOptions | undefined,
  signal?: AbortSignal,
): Promise<IIndexedMirror | null> => {
  const entry = await repository.getEntry(mirrorPath, operationOptions);

  if (entry === null) {
    addMirrorDiagnostic(
      collector,
      'MOLDEA_MIRROR_MISSING',
      manifestPath,
      mirrorPath,
      pointer,
      agentId,
    );
    return null;
  }

  if (entry.type === 'symlink') {
    addMirrorDiagnostic(
      collector,
      'MOLDEA_MIRROR_SYMLINK',
      manifestPath,
      mirrorPath,
      pointer,
      agentId,
      entry,
    );
    return null;
  }

  if (entry.type !== 'file') {
    addMirrorDiagnostic(
      collector,
      'MOLDEA_MIRROR_NOT_FILE',
      manifestPath,
      mirrorPath,
      pointer,
      agentId,
      entry,
    );
    return null;
  }

  const mirrorResult = await readRepositoryTextAsset(
    repository,
    mirrorPath,
    options.limits,
    signal,
  );
  addDiagnostics(collector, mirrorResult.diagnostics);

  if (mirrorResult.asset === null) {
    return null;
  }

  if (mirrorResult.asset.content !== canonicalInstruction.content) {
    addMirrorDiagnostic(
      collector,
      'MOLDEA_MIRROR_STALE',
      manifestPath,
      mirrorPath,
      pointer,
      agentId,
    );
    return null;
  }

  return {
    canonicalDigest: canonicalInstruction.digest,
    digest: mirrorResult.asset.digest,
    path: mirrorPath,
  };
};

/**
 * Compares every declared mirror with its available normalized canonical instruction.
 * @param repository The budget-aware reader for the active inspection session.
 * @param manifestPath The canonical manifest path used for declaration diagnostics.
 * @param agents The registered agent assets and normalized instruction prerequisites.
 * @param options The immutable Core configuration snapshot.
 * @param signal Optional cancellation forwarded to every mirror lookup and read.
 * @returns Deeply immutable index-ready mirrors and deterministic diagnostics.
 * @throws
 * - INVALID_REPOSITORY_PATH: A repository path is invalid.
 * - ENTRY_NOT_FOUND: A confirmed mirror file disappeared from the reader snapshot.
 * - ENTRY_NOT_FILE: A confirmed mirror file changed type during inspection.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during mirror inspection.
 * - INVALID_SOURCE_DATA: The repository reader returned invalid contract data.
 * - RESOURCE_LIMIT_EXCEEDED: A Core or repository resource limit was exceeded.
 * - ABORTED: Mirror inspection or a repository operation was aborted.
 */
export const inspectMirrors = async (
  repository: IRepositoryReader,
  manifestPath: IRepositoryPath,
  agents: readonly IInspectedAgentAssets[],
  options: ICoreOptionsSnapshot,
  signal?: AbortSignal,
): Promise<IMirrorInspectionResult> => {
  const collector = createCoreDiagnosticCollector(options.limits, 'inspect-project');
  const agentMirrors: IAgentMirrorInspection[] = [];
  const operationOptions: IRepositoryOperationOptions | undefined =
    signal === undefined ? undefined : { signal };

  for (const agent of [...agents].sort((left, right) => compareExactStrings(left.id, right.id))) {
    const mirrors: IIndexedMirror[] = [];

    if (agent.instruction !== null) {
      const declaredMirrors = [...(agent.declaration.mirrors ?? [])].sort(compareExactStrings);

      for (const [index, mirrorPath] of declaredMirrors.entries()) {
        const mirror = await inspectMirror(
          repository,
          manifestPath,
          agent.instruction,
          mirrorPath,
          `/agents/${escapeJsonPointerSegment(agent.id)}/mirrors/${index}`,
          agent.id,
          options,
          collector,
          operationOptions,
          signal,
        );

        if (mirror !== null) {
          mirrors.push(mirror);
        }
      }
    }

    agentMirrors.push({ id: agent.id, mirrors });
  }

  const diagnostics = collector.finalize();

  return freezeRecursively({
    agentMirrors,
    diagnostics,
    valid: diagnostics.length === 0,
  });
};
