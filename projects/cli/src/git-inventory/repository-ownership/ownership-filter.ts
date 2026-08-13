import type { IGitInventoryCandidate, IGitInventoryProbeErrorCode } from '../types.js';

import { inspectGitInventoryBoundaries } from './boundary-inspector.js';
import { planGitInventoryOwnershipPath } from './path-planner.js';
import type {
  IGitInventoryBoundaryInspector,
  IGitInventoryOwnershipFilter,
  IGitInventoryOwnershipFilterFailedResult,
  IGitInventoryOwnershipFilterResult,
  IGitInventoryOwnershipPathPlan,
  IGitInventoryUntrackedOwnershipPlan,
} from './types.js';

interface IGitInventoryIndexedOwnershipPlan {
  readonly candidateIndex: number;
  readonly plan: IGitInventoryOwnershipPathPlan;
}

interface IGitInventoryGitlinkTrieNode {
  readonly children: Map<string, IGitInventoryGitlinkTrieNode>;
  isRoot: boolean;
}

/** Creates one immutable ownership-filtering failure. */
const createOwnershipFailure = (
  errorCode: IGitInventoryProbeErrorCode = 'GIT_OUTPUT_INVALID',
): IGitInventoryOwnershipFilterFailedResult => Object.freeze({ errorCode, kind: 'failed' });

/** Builds one segment trie for deterministic submodule-root lookup. */
const createGitlinkTrie = (
  rootSegments: readonly (readonly string[])[],
): IGitInventoryGitlinkTrieNode => {
  const trie: IGitInventoryGitlinkTrieNode = { children: new Map(), isRoot: false };

  for (const segments of rootSegments) {
    let node = trie;

    for (const segment of segments) {
      let childNode = node.children.get(segment);

      if (childNode === undefined) {
        childNode = { children: new Map(), isRoot: false };
        node.children.set(segment, childNode);
      }

      node = childNode;
    }

    node.isRoot = true;
  }

  return trie;
};

/** Determines whether one candidate is a submodule root or segment descendant. */
const isAtOrBelowGitlink = (
  candidateSegments: readonly string[],
  gitlinkTrie: IGitInventoryGitlinkTrieNode,
): boolean => {
  let node = gitlinkTrie;

  for (const segment of candidateSegments) {
    const childNode = node.children.get(segment);

    if (childNode === undefined) {
      return false;
    }

    if (childNode.isRoot) {
      return true;
    }

    node = childNode;
  }

  return false;
};

/**
 * Creates selected-repository ownership filtering around an injectable boundary inspector.
 * @param boundaryInspector The no-follow nested-repository ownership operation.
 * @returns An all-or-nothing raw candidate ownership filter.
 */
export const createGitInventoryOwnershipFilter = (
  boundaryInspector: IGitInventoryBoundaryInspector = inspectGitInventoryBoundaries,
): IGitInventoryOwnershipFilter => {
  return async (input): Promise<IGitInventoryOwnershipFilterResult> => {
    const plannedCandidates: IGitInventoryIndexedOwnershipPlan[] = [];

    for (const [candidateIndex, candidate] of input.candidates.entries()) {
      if (input.signal?.aborted) {
        return createOwnershipFailure('GIT_OPERATION_ABORTED');
      }

      const planResult = planGitInventoryOwnershipPath(candidate);

      if (planResult.kind === 'failed') {
        return createOwnershipFailure();
      }

      plannedCandidates.push({ candidateIndex, plan: planResult.plan });
    }

    const gitlinkTrie = createGitlinkTrie(
      plannedCandidates
        .filter(
          ({ plan }) =>
            !plan.hasGitControlSegment &&
            plan.candidate.kind === 'tracked' &&
            plan.candidate.mode === '160000',
        )
        .map(({ plan }) => plan.segments),
    );
    const includedCandidates = Array.from({ length: input.candidates.length }, () => false);
    const untrackedPlans: IGitInventoryUntrackedOwnershipPlan[] = [];

    for (const { candidateIndex, plan } of plannedCandidates) {
      const isExcludedByGitPolicy =
        plan.hasGitControlSegment || isAtOrBelowGitlink(plan.segments, gitlinkTrie);

      if (isExcludedByGitPolicy) {
        continue;
      }

      if (plan.candidate.kind === 'tracked') {
        includedCandidates[candidateIndex] = true;
        continue;
      }

      untrackedPlans.push({ candidate: plan.candidate, candidateIndex, plan });
    }

    const boundaryResult = await boundaryInspector({
      maxMetadataBytes: input.maxMetadataBytes,
      plans: untrackedPlans.map(({ plan }) => plan),
      repositoryRoot: input.repositoryRoot,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    if (boundaryResult.kind === 'failed') {
      return boundaryResult;
    }

    if (boundaryResult.ownership.length !== untrackedPlans.length) {
      return createOwnershipFailure();
    }

    for (const [ownershipIndex, ownership] of boundaryResult.ownership.entries()) {
      if (input.signal?.aborted) {
        return createOwnershipFailure('GIT_OPERATION_ABORTED');
      }

      const untrackedPlan = untrackedPlans[ownershipIndex];

      if (untrackedPlan === undefined) {
        return createOwnershipFailure();
      }

      if (ownership === 'selected-repository') {
        includedCandidates[untrackedPlan.candidateIndex] = true;
      }
    }

    const candidates = input.candidates.filter(
      (_candidate: IGitInventoryCandidate, candidateIndex) =>
        includedCandidates[candidateIndex] === true,
    );

    return Object.freeze({
      candidates: Object.freeze(candidates),
      gitMetadataBytes: boundaryResult.gitMetadataBytes,
      kind: 'filtered',
    });
  };
};
