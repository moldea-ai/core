// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { probeGitInventory } from './probe.js';
import {
  commitFixtureGitIndex,
  createGitRepository,
  initializeGitRepository,
  runFixtureGit,
} from './probe.test-fixtures.js';

describe('real Git inventory probe', () => {
  test('enumerates tracked and non-ignored untracked paths in an unborn repository', async () => {
    const repository = createGitRepository();

    try {
      mkdirSync(path.join(repository.directory, 'nested'));
      writeFileSync(path.join(repository.directory, '.gitignore'), 'ignored.txt\n', 'utf8');
      writeFileSync(
        path.join(repository.directory, 'nested', 'tracked file.txt'),
        'tracked',
        'utf8',
      );
      writeFileSync(path.join(repository.directory, 'untracked-😀.txt'), 'untracked', 'utf8');
      writeFileSync(path.join(repository.directory, 'ignored.txt'), 'ignored', 'utf8');
      runFixtureGit(repository, ['add', '--', '.gitignore', 'nested/tracked file.txt']);

      const result = await probeGitInventory({
        maxEntries: 4,
        maxMetadataBytes: 4096,
        repositoryRoot: repository.directory,
      });

      expect(result).toStrictEqual({
        entries: [
          {
            entryType: 'file',
            indexEntries: [{ mode: '100644', stage: 0 }],
            kind: 'tracked',
            path: '/.gitignore',
            requiresSymlinkOverlay: false,
          },
          {
            entryType: 'file',
            indexEntries: [{ mode: '100644', stage: 0 }],
            kind: 'tracked',
            path: '/nested/tracked file.txt',
            requiresSymlinkOverlay: false,
          },
          {
            entryType: 'file',
            kind: 'untracked',
            path: '/untracked-😀.txt',
            requiresSymlinkOverlay: false,
          },
        ],
        kind: 'probed',
      });
    } finally {
      repository.remove();
    }
  });

  test('fails atomically when raw candidates exceed an inventory ceiling', async () => {
    const repository = createGitRepository();

    try {
      writeFileSync(path.join(repository.directory, 'tracked.txt'), 'tracked', 'utf8');
      writeFileSync(path.join(repository.directory, 'untracked.txt'), 'untracked', 'utf8');
      runFixtureGit(repository, ['add', '--', 'tracked.txt']);

      await expect(
        probeGitInventory({
          maxEntries: 1,
          maxMetadataBytes: 4096,
          repositoryRoot: repository.directory,
        }),
      ).resolves.toStrictEqual({ errorCode: 'RESOURCE_LIMIT_EXCEEDED', kind: 'failed' });

      await expect(
        probeGitInventory({
          maxEntries: 2,
          maxMetadataBytes: 1,
          repositoryRoot: repository.directory,
        }),
      ).resolves.toStrictEqual({ errorCode: 'RESOURCE_LIMIT_EXCEEDED', kind: 'failed' });
    } finally {
      repository.remove();
    }
  });

  test('omits tracked paths that are absent from the current working tree', async () => {
    const repository = createGitRepository();

    try {
      const deletedPath = path.join(repository.directory, 'deleted.txt');

      writeFileSync(deletedPath, 'tracked', 'utf8');
      runFixtureGit(repository, ['add', '--', 'deleted.txt']);
      unlinkSync(deletedPath);

      await expect(
        probeGitInventory({
          maxEntries: 1,
          maxMetadataBytes: 4096,
          repositoryRoot: repository.directory,
        }),
      ).resolves.toStrictEqual({ entries: [], kind: 'probed' });
    } finally {
      repository.remove();
    }
  });

  test('preserves an index symlink materialized as a host file when core.symlinks is false', async () => {
    const repository = createGitRepository();

    try {
      const linkPath = path.join(repository.directory, 'emulated-link');

      writeFileSync(linkPath, '../target', 'utf8');

      const objectId = execFileSync('git', ['hash-object', '-w', '--', 'emulated-link'], {
        cwd: repository.directory,
        encoding: 'utf8',
        env: repository.environment,
      }).trim();

      runFixtureGit(repository, [
        'update-index',
        '--add',
        '--cacheinfo',
        `120000,${objectId},emulated-link`,
      ]);
      runFixtureGit(repository, ['config', 'core.symlinks', 'false']);

      await expect(
        probeGitInventory({
          maxEntries: 1,
          maxMetadataBytes: 4096,
          repositoryRoot: repository.directory,
        }),
      ).resolves.toStrictEqual({
        entries: [
          {
            entryType: 'symlink',
            indexEntries: [{ mode: '120000', stage: 0 }],
            kind: 'tracked',
            path: '/emulated-link',
            requiresSymlinkOverlay: true,
          },
        ],
        kind: 'probed',
      });
    } finally {
      repository.remove();
    }
  });

  test('uses a current host file for a tracked symlink type change when core.symlinks is true', async () => {
    const repository = createGitRepository();

    try {
      const linkPath = path.join(repository.directory, 'changed-link');

      writeFileSync(linkPath, '../target', 'utf8');

      const objectId = execFileSync('git', ['hash-object', '-w', '--', 'changed-link'], {
        cwd: repository.directory,
        encoding: 'utf8',
        env: repository.environment,
      }).trim();

      runFixtureGit(repository, [
        'update-index',
        '--add',
        '--cacheinfo',
        `120000,${objectId},changed-link`,
      ]);
      runFixtureGit(repository, ['config', 'core.symlinks', 'true']);

      await expect(
        probeGitInventory({
          maxEntries: 1,
          maxMetadataBytes: 4096,
          repositoryRoot: repository.directory,
        }),
      ).resolves.toStrictEqual({
        entries: [
          {
            entryType: 'file',
            indexEntries: [{ mode: '120000', stage: 0 }],
            kind: 'tracked',
            path: '/changed-link',
            requiresSymlinkOverlay: false,
          },
        ],
        kind: 'probed',
      });
    } finally {
      repository.remove();
    }
  });

  test.skipIf(process.platform === 'win32')(
    'uses native no-follow types for tracked changes and untracked symlinks',
    async () => {
      const repository = createGitRepository();

      try {
        const trackedPath = path.join(repository.directory, 'tracked-link');

        writeFileSync(trackedPath, 'regular', 'utf8');
        runFixtureGit(repository, ['add', '--', 'tracked-link']);
        unlinkSync(trackedPath);
        symlinkSync('../target', trackedPath);
        symlinkSync('../target', path.join(repository.directory, 'untracked-link'));

        await expect(
          probeGitInventory({
            maxEntries: 2,
            maxMetadataBytes: 4096,
            repositoryRoot: repository.directory,
          }),
        ).resolves.toStrictEqual({
          entries: [
            {
              entryType: 'symlink',
              indexEntries: [{ mode: '100644', stage: 0 }],
              kind: 'tracked',
              path: '/tracked-link',
              requiresSymlinkOverlay: false,
            },
            {
              entryType: 'symlink',
              kind: 'untracked',
              path: '/untracked-link',
              requiresSymlinkOverlay: false,
            },
          ],
          kind: 'probed',
        });
      } finally {
        repository.remove();
      }
    },
  );

  test.skipIf(process.platform !== 'linux')(
    'rejects a tracked path that Git returns as invalid UTF-8',
    async () => {
      const repository = createGitRepository();

      try {
        const invalidPath = Buffer.concat([
          Buffer.from(`${repository.directory}${path.sep}`),
          Buffer.from([0x69, 0x6e, 0x76, 0x61, 0x6c, 0x69, 0x64, 0xff]),
        ]);

        writeFileSync(invalidPath, 'invalid path bytes');
        runFixtureGit(repository, ['add', '--all']);

        await expect(
          probeGitInventory({
            maxEntries: 1,
            maxMetadataBytes: 4096,
            repositoryRoot: repository.directory,
          }),
        ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
      } finally {
        repository.remove();
      }
    },
  );

  test.skipIf(process.platform === 'win32')(
    'rejects an absent tracked path outside the portable logical-path grammar',
    async () => {
      const repository = createGitRepository();

      try {
        const invalidPath = path.join(repository.directory, 'control\npath.txt');

        writeFileSync(invalidPath, 'invalid', 'utf8');
        runFixtureGit(repository, ['add', '--all']);
        unlinkSync(invalidPath);

        await expect(
          probeGitInventory({
            maxEntries: 1,
            maxMetadataBytes: 4096,
            repositoryRoot: repository.directory,
          }),
        ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
      } finally {
        repository.remove();
      }
    },
  );

  test('excludes nested-only content while retaining selected-repository tracked descendants', async () => {
    const repository = createGitRepository();

    try {
      const nestedDirectory = path.join(repository.directory, 'nested');

      mkdirSync(path.join(repository.directory, '.github'));
      mkdirSync(nestedDirectory);
      writeFileSync(path.join(repository.directory, '.gitattributes'), '*.txt text\n', 'utf8');
      writeFileSync(path.join(repository.directory, '.gitignore'), 'ignored.txt\n', 'utf8');
      writeFileSync(
        path.join(repository.directory, '.github', 'workflow.yml'),
        'name: test\n',
        'utf8',
      );
      writeFileSync(path.join(nestedDirectory, 'tracked.txt'), 'parent owned', 'utf8');
      runFixtureGit(repository, [
        'add',
        '--',
        '.gitattributes',
        '.gitignore',
        'nested/tracked.txt',
      ]);

      initializeGitRepository(nestedDirectory, repository.environment, repository.hooksDirectory);
      writeFileSync(path.join(nestedDirectory, 'untracked.txt'), 'nested owned', 'utf8');

      await expect(
        probeGitInventory({
          maxEntries: 8,
          maxMetadataBytes: 16_384,
          repositoryRoot: repository.directory,
        }),
      ).resolves.toStrictEqual({
        entries: [
          {
            entryType: 'file',
            indexEntries: [{ mode: '100644', stage: 0 }],
            kind: 'tracked',
            path: '/.gitattributes',
            requiresSymlinkOverlay: false,
          },
          {
            entryType: 'file',
            kind: 'untracked',
            path: '/.github/workflow.yml',
            requiresSymlinkOverlay: false,
          },
          {
            entryType: 'file',
            indexEntries: [{ mode: '100644', stage: 0 }],
            kind: 'tracked',
            path: '/.gitignore',
            requiresSymlinkOverlay: false,
          },
          {
            entryType: 'file',
            indexEntries: [{ mode: '100644', stage: 0 }],
            kind: 'tracked',
            path: '/nested/tracked.txt',
            requiresSymlinkOverlay: false,
          },
        ],
        kind: 'probed',
      });
    } finally {
      repository.remove();
    }
  });

  test('excludes initialized and uninitialized submodule roots without recursion', async () => {
    const repository = createGitRepository();

    try {
      const submoduleSource = path.join(repository.testDirectory, 'submodule-source');

      initializeGitRepository(submoduleSource, repository.environment, repository.hooksDirectory);
      writeFileSync(path.join(submoduleSource, 'content.txt'), 'submodule content', 'utf8');
      runFixtureGit(repository, ['add', '--', 'content.txt'], submoduleSource);
      commitFixtureGitIndex(repository, submoduleSource);
      runFixtureGit(repository, [
        '-c',
        'protocol.file.allow=always',
        'submodule',
        'add',
        submoduleSource,
        'module',
      ]);

      const probe = (): ReturnType<typeof probeGitInventory> =>
        probeGitInventory({
          maxEntries: 4,
          maxMetadataBytes: 16_384,
          repositoryRoot: repository.directory,
        });

      await expect(
        probeGitInventory({
          maxEntries: 1,
          maxMetadataBytes: 16_384,
          repositoryRoot: repository.directory,
        }),
      ).resolves.toStrictEqual({ errorCode: 'RESOURCE_LIMIT_EXCEEDED', kind: 'failed' });

      await expect(probe()).resolves.toStrictEqual({
        entries: [
          {
            entryType: 'file',
            indexEntries: [{ mode: '100644', stage: 0 }],
            kind: 'tracked',
            path: '/.gitmodules',
            requiresSymlinkOverlay: false,
          },
        ],
        kind: 'probed',
      });

      runFixtureGit(repository, ['submodule', 'deinit', '--force', '--', 'module']);

      await expect(probe()).resolves.toStrictEqual({
        entries: [
          {
            entryType: 'file',
            indexEntries: [{ mode: '100644', stage: 0 }],
            kind: 'tracked',
            path: '/.gitmodules',
            requiresSymlinkOverlay: false,
          },
        ],
        kind: 'probed',
      });
    } finally {
      repository.remove();
    }
  });

  test('excludes a nested linked worktree boundary', async () => {
    const repository = createGitRepository();

    try {
      const worktreeSource = path.join(repository.testDirectory, 'worktree-source');
      const nestedWorktree = path.join(repository.directory, 'linked-worktree');

      initializeGitRepository(worktreeSource, repository.environment, repository.hooksDirectory);
      writeFileSync(path.join(worktreeSource, 'content.txt'), 'linked content', 'utf8');
      runFixtureGit(repository, ['add', '--', 'content.txt'], worktreeSource);
      commitFixtureGitIndex(repository, worktreeSource);
      runFixtureGit(
        repository,
        ['worktree', 'add', '--detach', nestedWorktree, 'HEAD'],
        worktreeSource,
      );

      await expect(
        probeGitInventory({
          maxEntries: 2,
          maxMetadataBytes: 16_384,
          repositoryRoot: repository.directory,
        }),
      ).resolves.toStrictEqual({ entries: [], kind: 'probed' });
    } finally {
      repository.remove();
    }
  });
});
