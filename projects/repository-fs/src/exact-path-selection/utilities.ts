import { REPOSITORY_ROOT, parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import type { IFilesystemRepositoryPathSelection } from '../contracts/index.js';
import { throwFilesystemRepositoryCreationException } from '../source-exception/index.js';
import type {
  IFilesystemExactPathSelectionPlan,
  IFilesystemExactPathSelectionPlanEntry,
} from './types.js';

interface IMutableFilesystemExactPathSelectionPlanEntry {
  isExplicitlySelected: boolean;
  readonly parentPath: IRepositoryPath;
  readonly path: IRepositoryPath;
  readonly segment: string;
}

/**
 * Expands exact selected paths into their unique selected and synthesized logical entries.
 * @param selection The normalized exact-path selection.
 * @param maxEntries The maximum allowed non-root inventory size.
 * @returns A frozen deterministic plan ordered by logical path.
 * @throws
 * - RESOURCE_LIMIT_EXCEEDED: The selected and synthesized entry count exceeds maxEntries.
 */
export const createFilesystemExactPathSelectionPlan = (
  selection: IFilesystemRepositoryPathSelection,
  maxEntries: number,
): IFilesystemExactPathSelectionPlan => {
  const entriesByPath = new Map<IRepositoryPath, IMutableFilesystemExactPathSelectionPlanEntry>();
  const selectedPaths = [...selection.paths].sort();

  for (const selectedPath of selectedPaths) {
    const segments = selectedPath.slice(1).split('/');
    let parentPath = REPOSITORY_ROOT;

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];

      if (segment === undefined) {
        continue;
      }

      const logicalPath = parseRepositoryPath(
        parentPath === REPOSITORY_ROOT ? `/${segment}` : `${parentPath}/${segment}`,
      );
      const isExplicitlySelected = index === segments.length - 1;
      const existingEntry = entriesByPath.get(logicalPath);

      if (existingEntry === undefined) {
        entriesByPath.set(logicalPath, {
          isExplicitlySelected,
          parentPath,
          path: logicalPath,
          segment,
        });

        if (entriesByPath.size > maxEntries) {
          return throwFilesystemRepositoryCreationException(
            'RESOURCE_LIMIT_EXCEEDED',
            false,
            logicalPath,
          );
        }
      } else if (isExplicitlySelected) {
        existingEntry.isExplicitlySelected = true;
      }

      parentPath = logicalPath;
    }
  }

  const entries: IFilesystemExactPathSelectionPlanEntry[] = [...entriesByPath.values()]
    .sort((firstEntry, secondEntry) => {
      if (firstEntry.path < secondEntry.path) {
        return -1;
      }

      return firstEntry.path > secondEntry.path ? 1 : 0;
    })
    .map((entry) => Object.freeze({ ...entry }));

  return Object.freeze({ entries: Object.freeze(entries) });
};
