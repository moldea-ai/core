import type { IRepositoryPath } from '@moldea.ai/repository';

// one selected or synthesized non-root path required by exact-path inventory
export interface IFilesystemExactPathSelectionPlanEntry {
  readonly isExplicitlySelected: boolean;
  readonly parentPath: IRepositoryPath;
  readonly path: IRepositoryPath;
  readonly segment: string;
}

// deterministic immutable logical work required before exact filesystem lookup
export interface IFilesystemExactPathSelectionPlan {
  readonly entries: readonly IFilesystemExactPathSelectionPlanEntry[];
}
