// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import type { IGitInventoryEntry, IGitTrackedInventoryEntry } from '../logical-path/index.js';

import { areGitInventoriesEqual } from './comparator.js';

/** Creates one ordinary tracked entry for exact comparison tests. */
const createTrackedEntry = (): IGitTrackedInventoryEntry => ({
  contentTransformation: {
    filter: 'unspecified',
    ident: 'unspecified',
    isGuarded: false,
    workingTreeEncoding: 'unspecified',
  },
  entryType: 'file',
  indexEntries: [{ mode: '100644', stage: 0 }],
  kind: 'tracked',
  path: parseRepositoryPath('/moldea/project.md'),
  requiresSymlinkOverlay: false,
});

describe('areGitInventoriesEqual', () => {
  test('accepts distinct records with the same complete inventory state', () => {
    expect(areGitInventoriesEqual([createTrackedEntry()], [createTrackedEntry()])).toBe(true);
  });

  test('requires the same deterministic entry ordering', () => {
    const first = createTrackedEntry();
    const second: IGitInventoryEntry = {
      ...createTrackedEntry(),
      path: parseRepositoryPath('/moldea/runtime.md'),
    };

    expect(areGitInventoriesEqual([first, second], [second, first])).toBe(false);
  });

  test.each([
    ['path', { ...createTrackedEntry(), path: parseRepositoryPath('/moldea/replacement.md') }],
    ['entry type', { ...createTrackedEntry(), entryType: 'symlink' as const }],
    ['symlink overlay', { ...createTrackedEntry(), requiresSymlinkOverlay: true }],
    [
      'filter',
      {
        ...createTrackedEntry(),
        contentTransformation: {
          ...createTrackedEntry().contentTransformation,
          filter: 'private',
          isGuarded: true,
        },
      },
    ],
    [
      'working-tree encoding',
      {
        ...createTrackedEntry(),
        contentTransformation: {
          ...createTrackedEntry().contentTransformation,
          isGuarded: true,
          workingTreeEncoding: 'UTF-16LE',
        },
      },
    ],
    [
      'ident',
      {
        ...createTrackedEntry(),
        contentTransformation: {
          ...createTrackedEntry().contentTransformation,
          ident: 'set',
          isGuarded: true,
        },
      },
    ],
    [
      'guard derivation',
      {
        ...createTrackedEntry(),
        contentTransformation: {
          ...createTrackedEntry().contentTransformation,
          isGuarded: true,
        },
      },
    ],
    [
      'index mode',
      { ...createTrackedEntry(), indexEntries: [{ mode: '100755' as const, stage: 0 as const }] },
    ],
    [
      'index stage',
      { ...createTrackedEntry(), indexEntries: [{ mode: '100644' as const, stage: 2 as const }] },
    ],
    [
      'index sequence length',
      {
        ...createTrackedEntry(),
        indexEntries: [
          { mode: '100644' as const, stage: 1 as const },
          { mode: '100644' as const, stage: 2 as const },
        ],
      },
    ],
  ] satisfies readonly (readonly [string, IGitInventoryEntry])[])(
    'rejects a changed %s',
    (_description, changedEntry) => {
      expect(areGitInventoriesEqual([createTrackedEntry()], [changedEntry])).toBe(false);
    },
  );

  test('rejects tracked/untracked changes and different inventory lengths', () => {
    const tracked = createTrackedEntry();
    const untracked: IGitInventoryEntry = {
      contentTransformation: tracked.contentTransformation,
      entryType: tracked.entryType,
      kind: 'untracked',
      path: tracked.path,
      requiresSymlinkOverlay: false,
    };

    expect(areGitInventoriesEqual([createTrackedEntry()], [untracked])).toBe(false);
    expect(areGitInventoriesEqual([createTrackedEntry()], [])).toBe(false);
  });
});
