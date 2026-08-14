import type { IRepositoryReader } from '@moldea.ai/repository';

import type { IMoldeaCliResourceLimits } from '../command-line/index.js';
import type { IGitInventoryEntry } from '../git-inventory/index.js';

// normalized working-tree inputs required to create one cancellable filesystem snapshot
export interface IWorkingTreeRepositoryReaderInput {
  readonly entries: readonly IGitInventoryEntry[];
  readonly repositoryRoot: string;
  readonly resourceLimits: IMoldeaCliResourceLimits;
  readonly signal?: AbortSignal;
}

// injectable exact-path repository-reader composition boundary
export type IWorkingTreeRepositoryReaderFactory = (
  input: IWorkingTreeRepositoryReaderInput,
) => Promise<IRepositoryReader>;
