// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import type { IGitInventoryCandidate } from '../types.js';

import { createGitInventoryOwnershipFilter } from './ownership-filter.js';
import type { IGitInventoryBoundaryInspector } from './types.js';

describe('createGitInventoryOwnershipFilter', () => {
  test('excludes submodules, Git control data, and nested-owned untracked paths', async () => {
    const candidates: readonly IGitInventoryCandidate[] = Object.freeze([
      Object.freeze({ kind: 'tracked', mode: '160000', path: 'module', stage: 0 }),
      Object.freeze({ kind: 'untracked', path: 'module/content.txt' }),
      Object.freeze({ kind: 'tracked', mode: '100644', path: 'nested/tracked.txt', stage: 0 }),
      Object.freeze({ kind: 'untracked', path: 'nested/untracked.txt' }),
      Object.freeze({ kind: 'tracked', mode: '100644', path: '.gitignore', stage: 0 }),
      Object.freeze({ kind: 'untracked', path: '.github/workflow.yml' }),
      Object.freeze({ kind: 'untracked', path: 'private/.git/config' }),
    ]);
    const boundaryInspector = vi.fn<IGitInventoryBoundaryInspector>().mockResolvedValue(
      Object.freeze({
        gitMetadataBytes: 24,
        kind: 'inspected',
        ownership: Object.freeze(['nested-repository', 'selected-repository'] as const),
      }),
    );
    const filterOwnership = createGitInventoryOwnershipFilter(boundaryInspector);
    const result = await filterOwnership({
      candidates,
      maxMetadataBytes: 128,
      repositoryRoot: '/repository',
    });

    expect(result).toStrictEqual({
      candidates: [
        { kind: 'tracked', mode: '100644', path: 'nested/tracked.txt', stage: 0 },
        { kind: 'tracked', mode: '100644', path: '.gitignore', stage: 0 },
        { kind: 'untracked', path: '.github/workflow.yml' },
      ],
      gitMetadataBytes: 24,
      kind: 'filtered',
    });
    expect(Object.isFrozen(result)).toBe(true);

    if (result.kind === 'filtered') {
      expect(Object.isFrozen(result.candidates)).toBe(true);
    }

    expect(boundaryInspector).toHaveBeenCalledOnce();
    expect(boundaryInspector).toHaveBeenCalledWith({
      maxMetadataBytes: 128,
      plans: [
        expect.objectContaining({ candidate: { kind: 'untracked', path: 'nested/untracked.txt' } }),
        expect.objectContaining({ candidate: { kind: 'untracked', path: '.github/workflow.yml' } }),
      ],
      repositoryRoot: '/repository',
    });
  });

  test('treats every gitlink stage as one segment-aware submodule root', async () => {
    const boundaryInspector = vi
      .fn<IGitInventoryBoundaryInspector>()
      .mockResolvedValue(
        Object.freeze({ gitMetadataBytes: 0, kind: 'inspected', ownership: Object.freeze([]) }),
      );
    const filterOwnership = createGitInventoryOwnershipFilter(boundaryInspector);

    await expect(
      filterOwnership({
        candidates: [
          { kind: 'tracked', mode: '160000', path: 'module', stage: 2 },
          { kind: 'tracked', mode: '100644', path: 'module/file.txt', stage: 3 },
          { kind: 'tracked', mode: '100644', path: 'module-two/file.txt', stage: 0 },
        ],
        maxMetadataBytes: 0,
        repositoryRoot: '/repository',
      }),
    ).resolves.toStrictEqual({
      candidates: [{ kind: 'tracked', mode: '100644', path: 'module-two/file.txt', stage: 0 }],
      gitMetadataBytes: 0,
      kind: 'filtered',
    });
  });

  test('rejects an unsafe raw candidate before ownership inspection', async () => {
    const boundaryInspector = vi.fn<IGitInventoryBoundaryInspector>();
    const filterOwnership = createGitInventoryOwnershipFilter(boundaryInspector);

    await expect(
      filterOwnership({
        candidates: [{ kind: 'untracked', path: '../outside' }],
        maxMetadataBytes: 128,
        repositoryRoot: '/repository',
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
    expect(boundaryInspector).not.toHaveBeenCalled();
  });

  test('propagates atomic boundary failures without candidates', async () => {
    const boundaryInspector = vi
      .fn<IGitInventoryBoundaryInspector>()
      .mockResolvedValue(Object.freeze({ errorCode: 'GIT_ACCESS_DENIED', kind: 'failed' }));
    const filterOwnership = createGitInventoryOwnershipFilter(boundaryInspector);

    await expect(
      filterOwnership({
        candidates: [{ kind: 'untracked', path: 'nested/file.txt' }],
        maxMetadataBytes: 128,
        repositoryRoot: '/repository',
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_ACCESS_DENIED', kind: 'failed' });
  });

  test('rejects a boundary result that is not aligned with its candidate plans', async () => {
    const boundaryInspector = vi
      .fn<IGitInventoryBoundaryInspector>()
      .mockResolvedValue(
        Object.freeze({ gitMetadataBytes: 0, kind: 'inspected', ownership: Object.freeze([]) }),
      );
    const filterOwnership = createGitInventoryOwnershipFilter(boundaryInspector);

    await expect(
      filterOwnership({
        candidates: [{ kind: 'untracked', path: 'ordinary.txt' }],
        maxMetadataBytes: 128,
        repositoryRoot: '/repository',
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
  });
});
