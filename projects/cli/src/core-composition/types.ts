import type { ICore, ICoreOptions, IProjectInspectionResult } from '@moldea.ai/core';
import type { IRepositoryReader } from '@moldea.ai/repository';

import type { IMoldeaCliResourceLimits } from '../command-line/index.js';

// immutable inputs for one cancellable attempt-local Core inspection
export interface IMoldeaCliCoreInspectionInput {
  readonly repository: IRepositoryReader;
  readonly resourceLimits: IMoldeaCliResourceLimits;
  readonly signal?: AbortSignal;
}

// injectable Core construction boundary
export type IMoldeaCliCoreFactory = (options?: ICoreOptions) => ICore;

// attempt-local Core inspection boundary
export type IMoldeaCliCoreInspectionExecutor = (
  input: IMoldeaCliCoreInspectionInput,
) => Promise<IProjectInspectionResult>;
