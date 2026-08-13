import type { IGitContentTransformationClassification } from '../content-transformation/index.js';
import type { IGitInventoryIndexEntry } from '../entry-type/index.js';
import type { IGitInventoryEntry } from '../logical-path/index.js';

/** Determines whether two exact transform classifications are equal. */
const areContentTransformationsEqual = (
  left: IGitContentTransformationClassification,
  right: IGitContentTransformationClassification,
): boolean =>
  left.filter === right.filter &&
  left.ident === right.ident &&
  left.isGuarded === right.isGuarded &&
  left.workingTreeEncoding === right.workingTreeEncoding;

/** Determines whether two retained Git mode-and-stage sequences are equal. */
const areIndexEntriesEqual = (
  left: readonly IGitInventoryIndexEntry[],
  right: readonly IGitInventoryIndexEntry[],
): boolean =>
  left.length === right.length &&
  left.every(
    (leftEntry, index) =>
      leftEntry.mode === right[index]?.mode && leftEntry.stage === right[index]?.stage,
  );

/** Determines whether two normalized inventory entries are exactly equal. */
const areInventoryEntriesEqual = (left: IGitInventoryEntry, right: IGitInventoryEntry): boolean => {
  if (
    left.kind !== right.kind ||
    left.path !== right.path ||
    left.entryType !== right.entryType ||
    left.requiresSymlinkOverlay !== right.requiresSymlinkOverlay ||
    !areContentTransformationsEqual(left.contentTransformation, right.contentTransformation)
  ) {
    return false;
  }

  if (left.kind === 'untracked' || right.kind === 'untracked') {
    return left.kind === right.kind;
  }

  return areIndexEntriesEqual(left.indexEntries, right.indexEntries);
};

/**
 * Determines whether two complete normalized Git inventories describe the same snapshot inputs.
 * @param left The first deterministic inventory.
 * @param right The second deterministic inventory.
 * @returns Whether ordering and every retained record field are equal.
 */
export const areGitInventoriesEqual = (
  left: readonly IGitInventoryEntry[],
  right: readonly IGitInventoryEntry[],
): boolean =>
  left.length === right.length &&
  left.every((leftEntry, index) => {
    const rightEntry = right[index];

    return rightEntry !== undefined && areInventoryEntriesEqual(leftEntry, rightEntry);
  });
