import type path from 'node:path';

// host-path operations accepted by private path-equivalence checks
export type IHostPathOperations = Pick<typeof path, 'relative' | 'resolve'>;

// stable filesystem identity fields used for host-entry comparison
export interface IHostPathIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}
