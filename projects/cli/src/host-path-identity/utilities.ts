import path from 'node:path';

import type { IHostPathIdentity, IHostPathOperations } from './types.js';

/**
 * Determines whether two absolute path spellings identify the same host path.
 * @param left The first host path.
 * @param right The second host path.
 * @param hostPathOperations The platform path operations used for comparison.
 * @returns Whether the paths are equivalent under the selected host semantics.
 */
export const areHostPathsEquivalent = (
  left: string,
  right: string,
  hostPathOperations: IHostPathOperations = path,
): boolean =>
  hostPathOperations.relative(
    hostPathOperations.resolve(left),
    hostPathOperations.resolve(right),
  ) === '';

/**
 * Determines whether two observations identify the same filesystem entry.
 * @param left The first filesystem observation.
 * @param right The second filesystem observation.
 * @returns Whether both observations have the same nonzero device and inode identity.
 */
export const haveSameHostPathIdentity = (
  left: IHostPathIdentity,
  right: IHostPathIdentity,
): boolean => left.ino !== 0n && left.dev === right.dev && left.ino === right.ino;
