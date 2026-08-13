import type { IGitInventoryCandidate } from '../types.js';

import type { IGitInventoryOwnershipPathPlanResult } from './types.js';

/**
 * Prepares one raw Git path for ownership inspection without logical-path normalization.
 * @param candidate The strictly decoded tracked or untracked candidate.
 * @returns An immutable segment plan, or a failure for an unsafe raw path shape.
 */
export const planGitInventoryOwnershipPath = (
  candidate: IGitInventoryCandidate,
): IGitInventoryOwnershipPathPlanResult => {
  const isDirectoryRecord = candidate.path.endsWith('/');

  if (
    candidate.path.length === 0 ||
    candidate.path.startsWith('/') ||
    candidate.path.includes('\\') ||
    (candidate.kind === 'tracked' && isDirectoryRecord)
  ) {
    return Object.freeze({ kind: 'failed' });
  }

  const pathWithoutDirectoryTerminator = isDirectoryRecord
    ? candidate.path.slice(0, -1)
    : candidate.path;
  const segments = pathWithoutDirectoryTerminator.split('/');

  if (
    segments.length === 0 ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    return Object.freeze({ kind: 'failed' });
  }

  const frozenSegments = Object.freeze([...segments]);
  const directorySegments = Object.freeze(
    isDirectoryRecord ? [...segments] : segments.slice(0, -1),
  );

  return Object.freeze({
    kind: 'planned',
    plan: Object.freeze({
      candidate,
      directorySegments,
      hasGitControlSegment: segments.includes('.git'),
      isDirectoryRecord,
      segments: frozenSegments,
    }),
  });
};
