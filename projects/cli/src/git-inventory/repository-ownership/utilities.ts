import path from 'node:path';

// host-path operations accepted by the equivalence check
type IHostPathOperations = Pick<typeof path, 'relative' | 'resolve'>;

// stable filesystem identity fields used to compare host path aliases
interface IHostPathIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

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
 * Determines whether two no-follow observations identify the same filesystem entry.
 * @param left The first filesystem observation.
 * @param right The second filesystem observation.
 * @returns Whether both observations have the same device and inode identity.
 */
export const haveSameHostPathIdentity = (
  left: IHostPathIdentity,
  right: IHostPathIdentity,
): boolean => left.ino !== 0n && left.dev === right.dev && left.ino === right.ino;
