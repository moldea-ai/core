// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import { createGitInventoryEntryTypeNormalizer } from './normalizer.js';
import type {
  IGitInventoryEntryInspector,
  IGitInventoryHostEntryInspectionResult,
  IGitSymlinkConfigurationResolver,
} from './types.js';

/** Creates one path-keyed host entry inspector fixture. */
const createEntryInspector = (
  entries: Readonly<Record<string, IGitInventoryHostEntryInspectionResult>>,
): IGitInventoryEntryInspector =>
  vi.fn<IGitInventoryEntryInspector>((_repositoryRoot, candidatePath) => {
    const result = entries[candidatePath];

    if (result === undefined) {
      throw new Error('The entry inspection fixture is unavailable.');
    }

    return Promise.resolve(result);
  });

describe('createGitInventoryEntryTypeNormalizer', () => {
  test('normalizes current native types, omits missing paths, and avoids Git configuration', async () => {
    const entryInspector = createEntryInspector({
      'missing.txt': Object.freeze({ kind: 'missing' }),
      'native-link': Object.freeze({ entryType: 'symlink', kind: 'inspected' }),
      'tracked.txt': Object.freeze({ entryType: 'file', kind: 'inspected' }),
      'untracked.txt': Object.freeze({ entryType: 'file', kind: 'inspected' }),
    });
    const configurationResolver = vi.fn<IGitSymlinkConfigurationResolver>();
    const normalizeEntryTypes = createGitInventoryEntryTypeNormalizer(
      entryInspector,
      configurationResolver,
    );
    const result = await normalizeEntryTypes({
      candidates: [
        { kind: 'tracked', mode: '100644', path: 'tracked.txt', stage: 0 },
        { kind: 'tracked', mode: '100644', path: 'native-link', stage: 0 },
        { kind: 'tracked', mode: '100644', path: 'missing.txt', stage: 0 },
        { kind: 'untracked', path: 'untracked.txt' },
      ],
      maxMetadataBytes: 64,
      repositoryRoot: '/repository',
    });

    expect(result).toStrictEqual({
      entries: [
        {
          entryType: 'file',
          indexEntries: [{ mode: '100644', stage: 0 }],
          kind: 'tracked',
          path: 'tracked.txt',
          requiresSymlinkOverlay: false,
        },
        {
          entryType: 'symlink',
          indexEntries: [{ mode: '100644', stage: 0 }],
          kind: 'tracked',
          path: 'native-link',
          requiresSymlinkOverlay: false,
        },
        {
          entryType: 'file',
          kind: 'untracked',
          path: 'untracked.txt',
          requiresSymlinkOverlay: false,
        },
      ],
      gitMetadataBytes: 0,
      kind: 'normalized',
    });
    expect(configurationResolver).not.toHaveBeenCalled();
    expect(Object.isFrozen(result)).toBe(true);

    if (result.kind === 'normalized') {
      expect(Object.isFrozen(result.entries)).toBe(true);
      expect(result.entries.every(Object.isFrozen)).toBe(true);
    }
  });

  test('overlays materialized Git symlinks with one lazy disabled configuration query', async () => {
    const entryInspector = createEntryInspector({
      'first-link': Object.freeze({ entryType: 'file', kind: 'inspected' }),
      'second-link': Object.freeze({ entryType: 'file', kind: 'inspected' }),
    });
    const configurationResolver = vi
      .fn<IGitSymlinkConfigurationResolver>()
      .mockResolvedValue(
        Object.freeze({ gitMetadataBytes: 6, isEnabled: false, kind: 'resolved' }),
      );
    const normalizeEntryTypes = createGitInventoryEntryTypeNormalizer(
      entryInspector,
      configurationResolver,
    );

    await expect(
      normalizeEntryTypes({
        candidates: [
          { kind: 'tracked', mode: '120000', path: 'first-link', stage: 0 },
          { kind: 'tracked', mode: '120000', path: 'second-link', stage: 0 },
        ],
        maxMetadataBytes: 16,
        repositoryRoot: '/repository',
      }),
    ).resolves.toStrictEqual({
      entries: [
        {
          entryType: 'symlink',
          indexEntries: [{ mode: '120000', stage: 0 }],
          kind: 'tracked',
          path: 'first-link',
          requiresSymlinkOverlay: true,
        },
        {
          entryType: 'symlink',
          indexEntries: [{ mode: '120000', stage: 0 }],
          kind: 'tracked',
          path: 'second-link',
          requiresSymlinkOverlay: true,
        },
      ],
      gitMetadataBytes: 6,
      kind: 'normalized',
    });
    expect(configurationResolver).toHaveBeenCalledOnce();
    expect(configurationResolver).toHaveBeenCalledWith({
      maxMetadataBytes: 16,
      repositoryRoot: '/repository',
    });
  });

  test('uses the current regular-file type when effective symlinks are enabled', async () => {
    const normalizeEntryTypes = createGitInventoryEntryTypeNormalizer(
      createEntryInspector({ link: Object.freeze({ entryType: 'file', kind: 'inspected' }) }),
      vi
        .fn<IGitSymlinkConfigurationResolver>()
        .mockResolvedValue(
          Object.freeze({ gitMetadataBytes: 5, isEnabled: true, kind: 'resolved' }),
        ),
    );

    await expect(
      normalizeEntryTypes({
        candidates: [{ kind: 'tracked', mode: '120000', path: 'link', stage: 0 }],
        maxMetadataBytes: 8,
        repositoryRoot: '/repository',
      }),
    ).resolves.toStrictEqual({
      entries: [
        {
          entryType: 'file',
          indexEntries: [{ mode: '120000', stage: 0 }],
          kind: 'tracked',
          path: 'link',
          requiresSymlinkOverlay: false,
        },
      ],
      gitMetadataBytes: 5,
      kind: 'normalized',
    });
  });

  test.each([
    [false, { errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' }],
    [
      true,
      {
        entries: [
          {
            entryType: 'file',
            indexEntries: [
              { mode: '120000', stage: 1 },
              { mode: '100644', stage: 2 },
            ],
            kind: 'tracked',
            path: 'conflict',
            requiresSymlinkOverlay: false,
          },
        ],
        gitMetadataBytes: 5,
        kind: 'normalized',
      },
    ],
  ] as const)(
    'resolves mixed symlink and regular stages when core.symlinks is %s',
    async (isEnabled, expectedResult) => {
      const normalizeEntryTypes = createGitInventoryEntryTypeNormalizer(
        createEntryInspector({
          conflict: Object.freeze({ entryType: 'file', kind: 'inspected' }),
        }),
        vi
          .fn<IGitSymlinkConfigurationResolver>()
          .mockResolvedValue(Object.freeze({ gitMetadataBytes: 5, isEnabled, kind: 'resolved' })),
      );

      await expect(
        normalizeEntryTypes({
          candidates: [
            { kind: 'tracked', mode: '100644', path: 'conflict', stage: 2 },
            { kind: 'tracked', mode: '120000', path: 'conflict', stage: 1 },
          ],
          maxMetadataBytes: 8,
          repositoryRoot: '/repository',
        }),
      ).resolves.toStrictEqual(expectedResult);
    },
  );

  test('rejects unsupported host entries and candidate contradictions atomically', async () => {
    const entryInspector = createEntryInspector({
      directory: Object.freeze({ entryType: 'unsupported', kind: 'inspected' }),
    });
    const normalizeEntryTypes = createGitInventoryEntryTypeNormalizer(
      entryInspector,
      vi.fn<IGitSymlinkConfigurationResolver>(),
    );

    await expect(
      normalizeEntryTypes({
        candidates: [{ kind: 'untracked', path: 'directory' }],
        maxMetadataBytes: 8,
        repositoryRoot: '/repository',
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });

    await expect(
      normalizeEntryTypes({
        candidates: [
          { kind: 'untracked', path: 'same' },
          { kind: 'untracked', path: 'same' },
        ],
        maxMetadataBytes: 8,
        repositoryRoot: '/repository',
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
    expect(entryInspector).toHaveBeenCalledOnce();
  });

  test('propagates filesystem and Git configuration failures without partial entries', async () => {
    const filesystemNormalizer = createGitInventoryEntryTypeNormalizer(
      createEntryInspector({
        private: Object.freeze({ errorCode: 'GIT_ACCESS_DENIED', kind: 'failed' }),
      }),
      vi.fn<IGitSymlinkConfigurationResolver>(),
    );

    await expect(
      filesystemNormalizer({
        candidates: [{ kind: 'untracked', path: 'private' }],
        maxMetadataBytes: 8,
        repositoryRoot: '/repository',
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_ACCESS_DENIED', kind: 'failed' });

    const configurationNormalizer = createGitInventoryEntryTypeNormalizer(
      createEntryInspector({ link: Object.freeze({ entryType: 'file', kind: 'inspected' }) }),
      vi
        .fn<IGitSymlinkConfigurationResolver>()
        .mockResolvedValue(Object.freeze({ errorCode: 'GIT_COMMAND_FAILED', kind: 'failed' })),
    );

    await expect(
      configurationNormalizer({
        candidates: [{ kind: 'tracked', mode: '120000', path: 'link', stage: 0 }],
        maxMetadataBytes: 8,
        repositoryRoot: '/repository',
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_COMMAND_FAILED', kind: 'failed' });
  });
});
