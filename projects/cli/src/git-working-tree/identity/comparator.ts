import {
  areHostPathsEquivalent,
  haveSameHostPathIdentity,
} from '../../host-path-identity/index.js';

import type { IGitWorkingTreeIdentity, IGitWorkingTreeIdentityLocation } from './types.js';

/** Determines whether two identity-bearing locations still denote the same directory. */
const areLocationsEqual = (
  left: IGitWorkingTreeIdentityLocation,
  right: IGitWorkingTreeIdentityLocation,
): boolean =>
  areHostPathsEquivalent(left.path, right.path) && haveSameHostPathIdentity(left, right);

/**
 * Determines whether two observations identify the same working tree and Git repository.
 * @param left The pinned working-tree identity.
 * @param right The identity observed before a snapshot attempt.
 * @returns Whether the root, worktree Git directory, and common directory all match.
 */
export const areGitWorkingTreeIdentitiesEqual = (
  left: IGitWorkingTreeIdentity,
  right: IGitWorkingTreeIdentity,
): boolean =>
  areLocationsEqual(left.repositoryRoot, right.repositoryRoot) &&
  areLocationsEqual(left.gitDirectory, right.gitDirectory) &&
  areLocationsEqual(left.commonDirectory, right.commonDirectory);
