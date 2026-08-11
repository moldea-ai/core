import type { IInspectedAgentAssets } from '../agent-assets/index.js';
import type {
  IIndexedAgent,
  IIndexedContextAsset,
  IIndexedDecision,
  IIndexedManifest,
  IIndexedRuntimeGuidance,
  IIndexedTextAsset,
  IMoldeaProjectIndex,
} from '../contracts/index.js';
import { compareExactStrings } from '../format-validation/index.js';
import type { IParsedDecision } from '../format/index.js';
import { createNullPrototypeRecord, freezeRecursively } from '../immutable/index.js';
import type { IAgentMirrorInspection } from '../mirrors/index.js';

// complete universal inputs required to construct one provisional project index
export interface IProjectIndexInput {
  readonly manifest: IIndexedManifest;
  readonly project: IIndexedTextAsset;
  readonly context: readonly IIndexedContextAsset[];
  readonly decisions: readonly IParsedDecision[];
  readonly runtimes: readonly IIndexedRuntimeGuidance[];
  readonly agents: readonly IInspectedAgentAssets[];
  readonly agentMirrors: readonly IAgentMirrorInspection[];
}

const createIndexedDecisions = (
  decisions: readonly IParsedDecision[],
  manifest: IIndexedManifest,
): readonly IIndexedDecision[] => {
  return [...decisions]
    .sort(
      (left, right) =>
        compareExactStrings(left.id, right.id) || compareExactStrings(left.path, right.path),
    )
    .map((decision) => ({
      decision,
      relationships: manifest.value.decisions?.[decision.path] ?? null,
    }));
};

const createIndexedAgents = (
  agents: readonly IInspectedAgentAssets[],
  agentMirrors: readonly IAgentMirrorInspection[],
): readonly IIndexedAgent[] | null => {
  const mirrorsByAgent = new Map(agentMirrors.map((entry) => [entry.id, entry.mirrors] as const));
  const indexedAgents: IIndexedAgent[] = [];

  if (mirrorsByAgent.size !== agents.length) {
    return null;
  }

  for (const agent of [...agents].sort((left, right) => compareExactStrings(left.id, right.id))) {
    const mirrors = mirrorsByAgent.get(agent.id);

    if (agent.description === null || agent.instruction === null || mirrors === undefined) {
      return null;
    }

    indexedAgents.push({
      context: [...(agent.declaration.context ?? [])].sort(compareExactStrings),
      decisions: [...(agent.declaration.decisions ?? [])].sort(compareExactStrings),
      declaration: agent.declaration,
      description: agent.description,
      handoffDescription: agent.handoffDescription,
      id: agent.id,
      instruction: agent.instruction,
      mirrors: [...mirrors].sort((left, right) => compareExactStrings(left.path, right.path)),
    });
  }

  return indexedAgents;
};

/**
 * Constructs one deterministic provisional index from complete universal validation outputs.
 * @param input The normalized assets and relationships retained by universal inspection.
 * @returns The deeply immutable project index, or null when a required asset is unavailable.
 */
export const createProjectIndex = (input: IProjectIndexInput): IMoldeaProjectIndex | null => {
  const agents = createIndexedAgents(input.agents, input.agentMirrors);

  if (agents === null) {
    return null;
  }

  const unresolved = input.manifest.value.unresolved ?? createNullPrototypeRecord([]);

  return freezeRecursively({
    agents,
    context: [...input.context].sort((left, right) =>
      compareExactStrings(left.asset.path, right.asset.path),
    ),
    decisions: createIndexedDecisions(input.decisions, input.manifest),
    formatVersion: 1 as const,
    manifest: input.manifest,
    project: input.project,
    runtimes: [...input.runtimes].sort((left, right) =>
      compareExactStrings(left.asset.path, right.asset.path),
    ),
    unresolved,
  });
};
