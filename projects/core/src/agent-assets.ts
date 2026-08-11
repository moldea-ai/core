import {
  parseRepositoryPath,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import { validateAgentDescription, validateAgentInstruction } from './agent-asset-validation.js';
import type { ICanonicalDiscoveryResult } from './canonical-discovery.js';
import type { IIndexedDescriptionAsset, IIndexedTextAsset } from './contracts.js';
import {
  createCoreDiagnosticCollector,
  type ICoreDiagnosticCollector,
} from './diagnostic-utilities.js';
import type { ICoreDiagnostic } from './diagnostics.js';
import { compareExactStrings } from './format-validation.js';
import type { IAgentManifestEntry, IMoldeaManifestV1 } from './format.js';
import { freezeRecursively } from './immutable.js';
import type { ICoreOptionsSnapshot } from './options.js';
import { readRepositoryTextAsset } from './repository-text.js';

// internal agent assets retained even when later validation is still required
export interface IInspectedAgentAssets {
  readonly id: string;
  readonly declaration: IAgentManifestEntry;
  readonly description: IIndexedDescriptionAsset | null;
  readonly instruction: IIndexedTextAsset | null;
  readonly handoffDescription: IIndexedDescriptionAsset | null;
}

// internal reconciliation result retained for final project indexing
export interface IAgentAssetInspectionResult {
  readonly valid: boolean;
  readonly agents: readonly IInspectedAgentAssets[];
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

/** Reads and validates a required or optional description asset. */
const readDescription = async (
  repository: IRepositoryReader,
  path: IRepositoryPath,
  agentId: string,
  kind: 'description' | 'handoff-description',
  options: ICoreOptionsSnapshot,
  collector: ICoreDiagnosticCollector,
  signal?: AbortSignal,
): Promise<IIndexedDescriptionAsset | null> => {
  const readResult = await readRepositoryTextAsset(repository, path, options.limits, signal);
  addDiagnostics(collector, readResult.diagnostics);

  if (readResult.asset === null) {
    return null;
  }

  const validation = validateAgentDescription(readResult.asset, agentId, kind, options.limits);
  addDiagnostics(collector, validation.diagnostics);

  return validation.description;
};

/** Reads and validates a mandatory instruction asset. */
const readInstruction = async (
  repository: IRepositoryReader,
  path: IRepositoryPath,
  agentId: string,
  options: ICoreOptionsSnapshot,
  collector: ICoreDiagnosticCollector,
  signal?: AbortSignal,
): Promise<IIndexedTextAsset | null> => {
  const readResult = await readRepositoryTextAsset(repository, path, options.limits, signal);
  addDiagnostics(collector, readResult.diagnostics);

  if (readResult.asset === null) {
    return null;
  }

  const validation = validateAgentInstruction(readResult.asset, agentId, options.limits);
  addDiagnostics(collector, validation.diagnostics);

  return validation.instruction;
};

/**
 * Reconciles registered agents with their convention-owned directories and Markdown assets.
 * @param repository The coherent source-neutral repository reader.
 * @param manifest The normalized manifest containing registered agents.
 * @param discovery The canonical inventory and path-owned structural diagnostics.
 * @param options The immutable Core configuration snapshot.
 * @param signal Optional cancellation forwarded to every repository read.
 * @returns Deeply immutable registered-agent assets and deterministic diagnostics.
 * @throws
 * - ENTRY_NOT_FOUND: A discovered agent asset disappeared from the reader snapshot.
 * - ENTRY_NOT_FILE: A discovered agent asset is no longer a regular file.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during agent reads.
 * - INVALID_SOURCE_DATA: The repository reader returned invalid contract data.
 * - RESOURCE_LIMIT_EXCEEDED: A Core or repository resource limit was exceeded.
 * - ABORTED: Agent inspection or a repository operation was aborted.
 */
export const inspectAgentAssets = async (
  repository: IRepositoryReader,
  manifest: IMoldeaManifestV1,
  discovery: ICanonicalDiscoveryResult,
  options: ICoreOptionsSnapshot,
  signal?: AbortSignal,
): Promise<IAgentAssetInspectionResult> => {
  const collector = createCoreDiagnosticCollector(options.limits, 'inspect-project');
  const agents: IInspectedAgentAssets[] = [];
  const registeredAgents = manifest.agents ?? {};
  const registeredIds = new Set(Object.keys(registeredAgents));
  const discoveredById = new Map(
    discovery.inventory.agents.map((agent) => [agent.id, agent] as const),
  );
  const blockedPaths = new Set(
    discovery.diagnostics.flatMap((diagnostic) =>
      diagnostic.path === null ? [] : [diagnostic.path],
    ),
  );

  for (const discovered of discovery.inventory.agents) {
    if (!registeredIds.has(discovered.id)) {
      collector.add({
        code: 'MOLDEA_AGENT_DIRECTORY_UNREGISTERED',
        entity: { agentId: discovered.id },
        path: discovered.path,
      });
    }
  }

  for (const agentId of [...registeredIds].sort(compareExactStrings)) {
    const declaration = registeredAgents[agentId];

    if (declaration === undefined) {
      continue;
    }

    const discovered = discoveredById.get(agentId);

    if (discovered === undefined) {
      const directoryPath = parseRepositoryPath(`/moldea/agents/${agentId}`);

      if (!isBlockedPath(directoryPath, blockedPaths)) {
        collector.add({
          code: 'MOLDEA_AGENT_DIRECTORY_MISSING',
          entity: { agentId },
          path: directoryPath,
        });
      }

      agents.push({
        declaration,
        description: null,
        handoffDescription: null,
        id: agentId,
        instruction: null,
      });
      continue;
    }

    let description: IIndexedDescriptionAsset | null = null;
    let instruction: IIndexedTextAsset | null = null;
    let handoffDescription: IIndexedDescriptionAsset | null = null;

    if (discovered.description === null) {
      const path = parseRepositoryPath(`${discovered.path}/description.md`);
      if (!isBlockedPath(path, blockedPaths)) {
        collector.add({
          code: 'MOLDEA_AGENT_DESCRIPTION_MISSING',
          entity: { agentId },
          path,
        });
      }
    } else {
      description = await readDescription(
        repository,
        discovered.description,
        agentId,
        'description',
        options,
        collector,
        signal,
      );
    }

    if (discovered.instruction === null) {
      const path = parseRepositoryPath(`${discovered.path}/instruction.md`);
      if (!isBlockedPath(path, blockedPaths)) {
        collector.add({
          code: 'MOLDEA_AGENT_INSTRUCTION_MISSING',
          entity: { agentId },
          path,
        });
      }
    } else {
      instruction = await readInstruction(
        repository,
        discovered.instruction,
        agentId,
        options,
        collector,
        signal,
      );
    }

    if (discovered.handoffDescription !== null) {
      handoffDescription = await readDescription(
        repository,
        discovered.handoffDescription,
        agentId,
        'handoff-description',
        options,
        collector,
        signal,
      );
    }

    agents.push({
      declaration,
      description,
      handoffDescription,
      id: agentId,
      instruction,
    });
  }

  const diagnostics = collector.finalize();

  return freezeRecursively({
    agents,
    diagnostics,
    valid: diagnostics.length === 0,
  });
};
