import type { IGitInventoryCandidate } from '../types.js';

import type {
  ICollapsedGitInventoryCandidate,
  IGitInventoryCandidateCollapseResult,
  IGitInventoryIndexEntry,
} from './types.js';

interface IMutableTrackedCandidate {
  readonly indexEntriesByStage: Map<number, IGitInventoryIndexEntry>;
  readonly kind: 'tracked';
  readonly path: string;
}

interface IMutableUntrackedCandidate {
  readonly kind: 'untracked';
  readonly path: string;
}

type IMutableCollapsedCandidate = IMutableTrackedCandidate | IMutableUntrackedCandidate;

/** Creates one immutable invalid candidate-collapse result. */
const createCollapseFailure = (): IGitInventoryCandidateCollapseResult =>
  Object.freeze({ kind: 'failed' });

/**
 * Collapses raw stage records into one deterministic candidate per exact Git path.
 * @param candidates The ownership-filtered raw candidates to collapse.
 * @returns An immutable candidate set, or failure for duplicate or contradictory state.
 */
export const collapseGitInventoryCandidates = (
  candidates: readonly IGitInventoryCandidate[],
): IGitInventoryCandidateCollapseResult => {
  const candidatesByPath = new Map<string, IMutableCollapsedCandidate>();

  for (const candidate of candidates) {
    const existingCandidate = candidatesByPath.get(candidate.path);

    if (candidate.kind === 'untracked') {
      if (existingCandidate !== undefined) {
        return createCollapseFailure();
      }

      candidatesByPath.set(candidate.path, { kind: 'untracked', path: candidate.path });
      continue;
    }

    if (candidate.mode === '160000' || existingCandidate?.kind === 'untracked') {
      return createCollapseFailure();
    }

    const trackedCandidate = existingCandidate ?? {
      indexEntriesByStage: new Map<number, IGitInventoryIndexEntry>(),
      kind: 'tracked' as const,
      path: candidate.path,
    };

    if (trackedCandidate.indexEntriesByStage.has(candidate.stage)) {
      return createCollapseFailure();
    }

    trackedCandidate.indexEntriesByStage.set(
      candidate.stage,
      Object.freeze({ mode: candidate.mode, stage: candidate.stage }),
    );
    candidatesByPath.set(candidate.path, trackedCandidate);
  }

  const collapsedCandidates: ICollapsedGitInventoryCandidate[] = [];

  for (const candidate of candidatesByPath.values()) {
    if (candidate.kind === 'untracked') {
      collapsedCandidates.push(Object.freeze(candidate));
      continue;
    }

    const hasStageZero = candidate.indexEntriesByStage.has(0);

    if (hasStageZero && candidate.indexEntriesByStage.size !== 1) {
      return createCollapseFailure();
    }

    const indexEntries = [...candidate.indexEntriesByStage.values()].sort(
      (left, right) => left.stage - right.stage,
    );

    if (indexEntries.length === 0) {
      return createCollapseFailure();
    }

    collapsedCandidates.push(
      Object.freeze({
        indexEntries: Object.freeze(indexEntries),
        kind: 'tracked',
        path: candidate.path,
      }),
    );
  }

  return Object.freeze({ candidates: Object.freeze(collapsedCandidates), kind: 'collapsed' });
};
