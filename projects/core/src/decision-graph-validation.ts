import type { IRepositoryPath } from '@moldea.ai/repository';

import type { ICoreResourceLimits } from './contracts.js';
import { createCoreDiagnosticCollector } from './diagnostic-utilities.js';
import type { ICoreDiagnostic } from './diagnostics.js';
import { compareExactStrings } from './format-validation.js';
import type { IDecisionStatus } from './format.js';

// trustworthy document fields required by cross-file decision validation
export interface IDecisionGraphNode {
  readonly id: string;
  readonly path: IRepositoryPath;
  readonly status: IDecisionStatus;
  readonly supersedes: readonly string[];
}

// one discovered decision candidate, including invalid document placeholders
export interface IDecisionGraphCandidate {
  readonly id: string | null;
  readonly path: IRepositoryPath;
  readonly decision: IDecisionGraphNode | null;
}

interface IDecisionGraphIndex {
  readonly candidateGroups: ReadonlyMap<string, readonly IDecisionGraphCandidate[]>;
  readonly edges: ReadonlyMap<string, readonly string[]>;
  readonly nodes: ReadonlyMap<string, IDecisionGraphNode>;
}

const sortCandidates = (
  candidates: readonly IDecisionGraphCandidate[],
): IDecisionGraphCandidate[] => {
  return [...candidates].sort((left, right) => compareExactStrings(left.path, right.path));
};

const buildGraphIndex = (candidates: readonly IDecisionGraphCandidate[]): IDecisionGraphIndex => {
  const mutableGroups = new Map<string, IDecisionGraphCandidate[]>();

  for (const candidate of sortCandidates(candidates)) {
    if (candidate.id === null) {
      continue;
    }

    const group = mutableGroups.get(candidate.id) ?? [];
    group.push(candidate);
    mutableGroups.set(candidate.id, group);
  }

  const candidateGroups = new Map<string, readonly IDecisionGraphCandidate[]>();
  const nodes = new Map<string, IDecisionGraphNode>();

  for (const id of [...mutableGroups.keys()].sort(compareExactStrings)) {
    const group = mutableGroups.get(id) ?? [];
    candidateGroups.set(id, group);

    if (group.length === 1 && group[0]?.decision !== null) {
      const decision = group[0]?.decision;

      if (decision !== undefined) {
        nodes.set(id, decision);
      }
    }
  }

  const edges = new Map<string, readonly string[]>();

  for (const [id, decision] of nodes) {
    const resolvedTargets = decision.supersedes.filter((targetId) => {
      const group = candidateGroups.get(targetId);
      return group?.length === 1 && group[0]?.decision !== null;
    });
    edges.set(id, resolvedTargets);
  }

  return { candidateGroups, edges, nodes };
};

const collectDuplicateDiagnostics = (
  index: IDecisionGraphIndex,
  diagnostics: ReturnType<typeof createCoreDiagnosticCollector>,
): void => {
  for (const [id, candidates] of index.candidateGroups) {
    if (candidates.length < 2) {
      continue;
    }

    for (const candidate of candidates) {
      diagnostics.add({
        code: 'MOLDEA_DECISION_ID_DUPLICATE',
        details: { occurrences: candidates.length },
        entity: { decisionId: id },
        path: candidate.path,
      });
    }
  }
};

const collectReferenceDiagnostics = (
  index: IDecisionGraphIndex,
  diagnostics: ReturnType<typeof createCoreDiagnosticCollector>,
): void => {
  for (const decision of index.nodes.values()) {
    for (const targetId of decision.supersedes) {
      if (index.candidateGroups.has(targetId)) {
        continue;
      }

      diagnostics.add({
        code: 'MOLDEA_DECISION_REFERENCE_MISSING',
        details: { referencedDecisionId: targetId },
        entity: { decisionId: decision.id },
        path: decision.path,
        pointer: '/supersedes',
      });
    }
  }
};

const collectStatusDiagnostics = (
  index: IDecisionGraphIndex,
  diagnostics: ReturnType<typeof createCoreDiagnosticCollector>,
): Set<string> => {
  const activelySupersededIds = new Set<string>();

  for (const decision of index.nodes.values()) {
    if (decision.status !== 'accepted' && decision.status !== 'superseded') {
      continue;
    }

    for (const targetId of index.edges.get(decision.id) ?? []) {
      const target = index.nodes.get(targetId);

      if (target === undefined) {
        continue;
      }

      if (target.status === 'superseded') {
        activelySupersededIds.add(targetId);
        continue;
      }

      diagnostics.add({
        code: 'MOLDEA_DECISION_SUPERSESSION_STATUS_INVALID',
        details: {
          referencedDecisionId: targetId,
          sourceStatus: decision.status,
          targetStatus: target.status,
        },
        entity: { decisionId: decision.id },
        path: decision.path,
        pointer: '/supersedes',
      });
    }
  }

  return activelySupersededIds;
};

const collectOrphanDiagnostics = (
  index: IDecisionGraphIndex,
  activelySupersededIds: ReadonlySet<string>,
  diagnostics: ReturnType<typeof createCoreDiagnosticCollector>,
): void => {
  for (const decision of index.nodes.values()) {
    if (decision.status === 'superseded' && !activelySupersededIds.has(decision.id)) {
      diagnostics.add({
        code: 'MOLDEA_DECISION_SUPERSEDED_ORPHAN',
        entity: { decisionId: decision.id },
        path: decision.path,
      });
    }
  }
};

const calculateFinishOrder = (index: IDecisionGraphIndex): readonly string[] => {
  const visited = new Set<string>();
  const finished: string[] = [];

  for (const startId of index.nodes.keys()) {
    if (visited.has(startId)) {
      continue;
    }

    const stack: { id: string; nextNeighbor: number }[] = [{ id: startId, nextNeighbor: 0 }];
    visited.add(startId);

    while (stack.length > 0) {
      const current = stack.at(-1);

      if (current === undefined) {
        break;
      }

      const neighbors = index.edges.get(current.id) ?? [];
      const neighbor = neighbors[current.nextNeighbor];

      if (neighbor === undefined) {
        finished.push(current.id);
        stack.pop();
        continue;
      }

      current.nextNeighbor += 1;

      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        stack.push({ id: neighbor, nextNeighbor: 0 });
      }
    }
  }

  return finished;
};

const buildReverseEdges = (index: IDecisionGraphIndex): ReadonlyMap<string, readonly string[]> => {
  const reverseEdges = new Map<string, string[]>();

  for (const id of index.nodes.keys()) {
    reverseEdges.set(id, []);
  }

  for (const [sourceId, targets] of index.edges) {
    for (const targetId of targets) {
      reverseEdges.get(targetId)?.push(sourceId);
    }
  }

  for (const sources of reverseEdges.values()) {
    sources.sort(compareExactStrings);
  }

  return reverseEdges;
};

const findStronglyConnectedComponents = (
  index: IDecisionGraphIndex,
): readonly (readonly string[])[] => {
  const reverseEdges = buildReverseEdges(index);
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const startId of [...calculateFinishOrder(index)].reverse()) {
    if (visited.has(startId)) {
      continue;
    }

    const component: string[] = [];
    const stack = [startId];
    visited.add(startId);

    while (stack.length > 0) {
      const currentId = stack.pop();

      if (currentId === undefined) {
        break;
      }

      component.push(currentId);

      for (const sourceId of [...(reverseEdges.get(currentId) ?? [])].reverse()) {
        if (!visited.has(sourceId)) {
          visited.add(sourceId);
          stack.push(sourceId);
        }
      }
    }

    components.push(component.sort(compareExactStrings));
  }

  return components.sort((left, right) => compareExactStrings(left[0] ?? '', right[0] ?? ''));
};

const collectCycleDiagnostics = (
  index: IDecisionGraphIndex,
  diagnostics: ReturnType<typeof createCoreDiagnosticCollector>,
): void => {
  for (const component of findStronglyConnectedComponents(index)) {
    if (component.length < 2) {
      continue;
    }

    const cycleRepresentativeDecisionId = component[0];

    if (cycleRepresentativeDecisionId === undefined) {
      continue;
    }

    for (const decisionId of component) {
      const decision = index.nodes.get(decisionId);

      if (decision !== undefined) {
        diagnostics.add({
          code: 'MOLDEA_DECISION_SUPERSESSION_CYCLE',
          details: {
            cycleRepresentativeDecisionId,
            cycleSize: component.length,
          },
          entity: { decisionId },
          path: decision.path,
          pointer: '/supersedes',
        });
      }
    }
  }
};

/**
 * Validates every trustworthy cross-file relationship in one decision candidate set.
 * @param candidates Discovered candidates with valid parsed decisions where available.
 * @param limits The immutable Core limits governing repository-level diagnostics.
 * @returns Deterministically sorted, deeply immutable graph diagnostics.
 * @throws
 * - RESOURCE_LIMIT_EXCEEDED: The repository-level diagnostic budget was exceeded.
 */
export const validateDecisionGraph = (
  candidates: readonly IDecisionGraphCandidate[],
  limits: ICoreResourceLimits,
): readonly ICoreDiagnostic[] => {
  const diagnostics = createCoreDiagnosticCollector(limits, 'inspect-project');
  const index = buildGraphIndex(candidates);

  collectDuplicateDiagnostics(index, diagnostics);
  collectReferenceDiagnostics(index, diagnostics);
  collectCycleDiagnostics(index, diagnostics);
  const activelySupersededIds = collectStatusDiagnostics(index, diagnostics);
  collectOrphanDiagnostics(index, activelySupersededIds, diagnostics);

  return diagnostics.finalize();
};
