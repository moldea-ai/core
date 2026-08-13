import path from 'node:path';

// host-path operations accepted by the equivalence check
export type IHostPathOperations = Pick<typeof path, 'relative' | 'resolve'>;

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
