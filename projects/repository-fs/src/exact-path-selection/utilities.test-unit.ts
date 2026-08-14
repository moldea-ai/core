// @vitest-environment node
import { expectToThrowCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import type { IFilesystemRepositoryPathSelection } from '../contracts/index.js';
import { createFilesystemExactPathSelectionPlan } from './index.js';

const createSelection = (paths: readonly string[]): IFilesystemRepositoryPathSelection => ({
  kind: 'paths',
  paths: paths.map(parseRepositoryPath),
});

describe('filesystem exact-path selection planning', () => {
  test('creates an empty frozen plan for a root-only inventory', () => {
    const plan = createFilesystemExactPathSelectionPlan(createSelection([]), 1);

    expect(plan).toStrictEqual({ entries: [] });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.entries)).toBe(true);
  });

  test('synthesizes unique parents and preserves explicit selections', () => {
    const plan = createFilesystemExactPathSelectionPlan(
      createSelection(['/src', '/src/module/file.ts', '/src/other.ts']),
      4,
    );

    expect(plan.entries).toStrictEqual([
      {
        isExplicitlySelected: true,
        parentPath: parseRepositoryPath('/'),
        path: parseRepositoryPath('/src'),
        segment: 'src',
      },
      {
        isExplicitlySelected: false,
        parentPath: parseRepositoryPath('/src'),
        path: parseRepositoryPath('/src/module'),
        segment: 'module',
      },
      {
        isExplicitlySelected: true,
        parentPath: parseRepositoryPath('/src/module'),
        path: parseRepositoryPath('/src/module/file.ts'),
        segment: 'file.ts',
      },
      {
        isExplicitlySelected: true,
        parentPath: parseRepositoryPath('/src'),
        path: parseRepositoryPath('/src/other.ts'),
        segment: 'other.ts',
      },
    ]);
    expect(plan.entries.every(Object.isFrozen)).toBe(true);
  });

  test('is deterministic without mutating the caller path array', () => {
    const paths = [parseRepositoryPath('/zeta/file.ts'), parseRepositoryPath('/alpha/file.ts')];
    const selection: IFilesystemRepositoryPathSelection = { kind: 'paths', paths };
    const firstPlan = createFilesystemExactPathSelectionPlan(selection, 4);

    paths.reverse();

    const secondPlan = createFilesystemExactPathSelectionPlan(selection, 4);

    expect(firstPlan).toStrictEqual(secondPlan);
    expect(paths).toStrictEqual([
      parseRepositoryPath('/alpha/file.ts'),
      parseRepositoryPath('/zeta/file.ts'),
    ]);
  });

  test('counts each unique non-root selected or synthesized entry exactly once', () => {
    const selection = createSelection(['/shared/first.ts', '/shared/second.ts']);

    expect(createFilesystemExactPathSelectionPlan(selection, 3).entries).toHaveLength(3);
    expectToThrowCode(
      () => createFilesystemExactPathSelectionPlan(selection, 2),
      'RESOURCE_LIMIT_EXCEEDED',
      'A repository reading resource limit was exceeded.',
    );
  });

  test('reports the deterministic path that crosses the entry limit', () => {
    let rejection: unknown;

    try {
      createFilesystemExactPathSelectionPlan(createSelection(['/parent/file.ts']), 1);
    } catch (cause) {
      rejection = cause;
    }

    expect(rejection).toMatchObject({
      operation: 'create-reader',
      path: parseRepositoryPath('/parent/file.ts'),
      retryable: false,
    });
  });
});
