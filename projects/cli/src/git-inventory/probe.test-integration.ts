// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import {
  executeGitStreamingProcess,
  type IGitStreamingProcessExecutor,
} from '../git-process/index.js';

import { createGitInventoryProbe, probeGitInventory } from './probe.js';
import {
  commitFixtureGitIndex,
  createGitRepository,
  initializeGitRepository,
  runFixtureGit,
} from './probe.test-fixtures.js';

const CONTENT_TRANSFORMATION = Object.freeze({
  filter: 'unspecified',
  ident: 'unspecified',
  isGuarded: false,
  workingTreeEncoding: 'unspecified',
});

describe('real Git inventory probe', () => {
  test('returns an empty immutable inventory for an empty working tree', async () => {
    const repository = createGitRepository();

    try {
      const result = await probeGitInventory({
        maxEntries: 1,
        maxMetadataBytes: 4096,
        repositoryRoot: repository.directory,
      });

      expect(result).toStrictEqual({ entries: [], kind: 'probed' });
      expect(Object.isFrozen(result)).toBe(true);
      expect(result.kind === 'probed' && Object.isFrozen(result.entries)).toBe(true);
    } finally {
      repository.remove();
    }
  });

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
            contentTransformation: CONTENT_TRANSFORMATION,
            entryType: 'file',
            indexEntries: [{ mode: '100644', stage: 0 }],
            kind: 'tracked',
            path: '/.gitignore',
            requiresSymlinkOverlay: false,
          },
          {
            contentTransformation: CONTENT_TRANSFORMATION,
            entryType: 'file',
            indexEntries: [{ mode: '100644', stage: 0 }],
            kind: 'tracked',
            path: '/nested/tracked file.txt',
            requiresSymlinkOverlay: false,
          },
          {
            contentTransformation: CONTENT_TRANSFORMATION,
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

  test('retains tracked files across committed, modified, staged, and ignored states', async () => {
    const repository = createGitRepository();

    try {
      for (const fileName of ['ignored-tracked.txt', 'modified.txt', 'unchanged.txt']) {
        writeFileSync(path.join(repository.directory, fileName), `${fileName}\n`, 'utf8');
      }
      runFixtureGit(repository, ['add', '--all']);
      commitFixtureGitIndex(repository);

      writeFileSync(path.join(repository.directory, '.gitignore'), 'ignored-tracked.txt\n', 'utf8');
      writeFileSync(
        path.join(repository.directory, 'modified.txt'),
        'working-tree change\n',
        'utf8',
      );
      writeFileSync(path.join(repository.directory, 'staged.txt'), 'staged\n', 'utf8');
      writeFileSync(path.join(repository.directory, 'staged-modified.txt'), 'staged\n', 'utf8');
      runFixtureGit(repository, ['add', '--', '.gitignore', 'staged.txt', 'staged-modified.txt']);
      writeFileSync(
        path.join(repository.directory, 'staged-modified.txt'),
        'further working-tree change\n',
        'utf8',
      );

      const result = await probeGitInventory({
        maxEntries: 8,
        maxMetadataBytes: 16_384,
        repositoryRoot: repository.directory,
      });

      expect(result).toMatchObject({
        entries: [
          { kind: 'tracked', path: '/.gitignore' },
          { kind: 'tracked', path: '/ignored-tracked.txt' },
          { kind: 'tracked', path: '/modified.txt' },
          { kind: 'tracked', path: '/staged-modified.txt' },
          { kind: 'tracked', path: '/staged.txt' },
          { kind: 'tracked', path: '/unchanged.txt' },
        ],
        kind: 'probed',
      });
      expect(
        result.kind === 'probed' && result.entries.every((entry) => entry.entryType === 'file'),
      ).toBe(true);
    } finally {
      repository.remove();
    }
  });

  test('normalizes staged renames, unstaged renames, and copied paths by current ownership', async () => {
    const repository = createGitRepository();

    try {
      writeFileSync(path.join(repository.directory, 'source.txt'), 'source\n', 'utf8');
      writeFileSync(path.join(repository.directory, 'staged-old.txt'), 'staged rename\n', 'utf8');
      writeFileSync(
        path.join(repository.directory, 'unstaged-old.txt'),
        'unstaged rename\n',
        'utf8',
      );
      runFixtureGit(repository, ['add', '--all']);
      commitFixtureGitIndex(repository);

      runFixtureGit(repository, ['mv', '--', 'staged-old.txt', 'staged-renamed.txt']);
      writeFileSync(path.join(repository.directory, 'copied.txt'), 'source\n', 'utf8');
      runFixtureGit(repository, ['add', '--', 'copied.txt']);
      renameSync(
        path.join(repository.directory, 'unstaged-old.txt'),
        path.join(repository.directory, 'unstaged-renamed.txt'),
      );

      await expect(
        probeGitInventory({
          maxEntries: 8,
          maxMetadataBytes: 16_384,
          repositoryRoot: repository.directory,
        }),
      ).resolves.toMatchObject({
        entries: [
          { kind: 'tracked', path: '/copied.txt' },
          { kind: 'tracked', path: '/source.txt' },
          { kind: 'tracked', path: '/staged-renamed.txt' },
          { kind: 'untracked', path: '/unstaged-renamed.txt' },
        ],
        kind: 'probed',
      });
    } finally {
      repository.remove();
    }
  });

  test('retains every unmerged index stage for one current file', async () => {
    const repository = createGitRepository();

    try {
      const conflictPath = path.join(repository.directory, 'conflict.txt');

      writeFileSync(conflictPath, 'base\n', 'utf8');
      runFixtureGit(repository, ['add', '--', 'conflict.txt']);
      commitFixtureGitIndex(repository);
      runFixtureGit(repository, ['switch', '-c', 'theirs']);
      writeFileSync(conflictPath, 'theirs\n', 'utf8');
      runFixtureGit(repository, ['add', '--', 'conflict.txt']);
      commitFixtureGitIndex(repository);
      runFixtureGit(repository, ['switch', 'main']);
      writeFileSync(conflictPath, 'ours\n', 'utf8');
      runFixtureGit(repository, ['add', '--', 'conflict.txt']);
      commitFixtureGitIndex(repository);

      const mergeResult = spawnSync(
        'git',
        [
          '-c',
          'user.name=Moldea Test',
          '-c',
          'user.email=moldea@example.invalid',
          '-c',
          'commit.gpgSign=false',
          'merge',
          '--no-edit',
          'theirs',
        ],
        {
          cwd: repository.directory,
          env: repository.environment,
          stdio: 'ignore',
        },
      );

      expect(mergeResult.status).toBe(1);
      await expect(
        probeGitInventory({
          maxEntries: 4,
          maxMetadataBytes: 16_384,
          repositoryRoot: repository.directory,
        }),
      ).resolves.toStrictEqual({
        entries: [
          {
            contentTransformation: CONTENT_TRANSFORMATION,
            entryType: 'file',
            indexEntries: [
              { mode: '100644', stage: 1 },
              { mode: '100644', stage: 2 },
              { mode: '100644', stage: 3 },
            ],
            kind: 'tracked',
            path: '/conflict.txt',
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
            contentTransformation: CONTENT_TRANSFORMATION,
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
            contentTransformation: CONTENT_TRANSFORMATION,
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
              contentTransformation: CONTENT_TRANSFORMATION,
              entryType: 'symlink',
              indexEntries: [{ mode: '100644', stage: 0 }],
              kind: 'tracked',
              path: '/tracked-link',
              requiresSymlinkOverlay: false,
            },
            {
              contentTransformation: CONTENT_TRANSFORMATION,
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
            contentTransformation: CONTENT_TRANSFORMATION,
            entryType: 'file',
            indexEntries: [{ mode: '100644', stage: 0 }],
            kind: 'tracked',
            path: '/.gitattributes',
            requiresSymlinkOverlay: false,
          },
          {
            contentTransformation: CONTENT_TRANSFORMATION,
            entryType: 'file',
            kind: 'untracked',
            path: '/.github/workflow.yml',
            requiresSymlinkOverlay: false,
          },
          {
            contentTransformation: CONTENT_TRANSFORMATION,
            entryType: 'file',
            indexEntries: [{ mode: '100644', stage: 0 }],
            kind: 'tracked',
            path: '/.gitignore',
            requiresSymlinkOverlay: false,
          },
          {
            contentTransformation: CONTENT_TRANSFORMATION,
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

  // real submodule setup and repeated Git probes need a wider Windows process-startup budget
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
            contentTransformation: CONTENT_TRANSFORMATION,
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
            contentTransformation: CONTENT_TRANSFORMATION,
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
  }, 30_000);

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

  test('classifies guarded transformations while ordinary text and eol remain unguarded', async () => {
    const repository = createGitRepository();

    try {
      writeFileSync(
        path.join(repository.directory, '.git', 'info', 'attributes'),
        [
          'guarded.txt filter=private working-tree-encoding=UTF-16LE ident',
          'ordinary.txt text eol=crlf',
          '',
        ].join('\n'),
        'utf8',
      );
      writeFileSync(path.join(repository.directory, 'guarded.txt'), 'guarded', 'utf8');
      writeFileSync(path.join(repository.directory, 'ordinary.txt'), 'ordinary', 'utf8');
      runFixtureGit(repository, ['config', 'filter.private.clean', 'moldea-filter-must-not-run']);

      await expect(
        probeGitInventory({
          maxEntries: 2,
          maxMetadataBytes: 4096,
          repositoryRoot: repository.directory,
        }),
      ).resolves.toStrictEqual({
        entries: [
          {
            contentTransformation: {
              filter: 'private',
              ident: 'set',
              isGuarded: true,
              workingTreeEncoding: 'UTF-16LE',
            },
            entryType: 'file',
            kind: 'untracked',
            path: '/guarded.txt',
            requiresSymlinkOverlay: false,
          },
          {
            contentTransformation: CONTENT_TRANSFORMATION,
            entryType: 'file',
            kind: 'untracked',
            path: '/ordinary.txt',
            requiresSymlinkOverlay: false,
          },
        ],
        kind: 'probed',
      });
    } finally {
      repository.remove();
    }
  });

  test('ignores ambient attribute-source redirection when classifying working-tree attributes', async () => {
    const repository = createGitRepository();

    try {
      writeFileSync(
        path.join(repository.directory, '.gitattributes'),
        'guarded.txt -filter -working-tree-encoding -ident\n',
        'utf8',
      );
      writeFileSync(path.join(repository.directory, 'guarded.txt'), 'guarded', 'utf8');
      runFixtureGit(repository, ['add', '--', '.gitattributes', 'guarded.txt']);
      commitFixtureGitIndex(repository);
      writeFileSync(
        path.join(repository.directory, '.gitattributes'),
        'guarded.txt filter=private\n',
        'utf8',
      );

      const processExecutor: IGitStreamingProcessExecutor = (options) =>
        executeGitStreamingProcess({
          ...options,
          environment: {
            ...repository.environment,
            GIT_ATTR_SOURCE: 'HEAD',
          },
        });
      const probe = createGitInventoryProbe(processExecutor);

      await expect(
        probe({
          maxEntries: 2,
          maxMetadataBytes: 4096,
          repositoryRoot: repository.directory,
        }),
      ).resolves.toMatchObject({
        entries: [
          { path: '/.gitattributes' },
          {
            contentTransformation: {
              filter: 'private',
              ident: 'unspecified',
              isGuarded: true,
              workingTreeEncoding: 'unspecified',
            },
            path: '/guarded.txt',
          },
        ],
        kind: 'probed',
      });
    } finally {
      repository.remove();
    }
  });

  test('counts attribute stdout against the shared per-probe Git metadata budget', async () => {
    const repository = createGitRepository();

    try {
      const candidatePath = 'guarded.txt';

      writeFileSync(
        path.join(repository.directory, '.git', 'info', 'attributes'),
        `${candidatePath} filter=private working-tree-encoding=UTF-16LE ident\n`,
        'utf8',
      );
      writeFileSync(path.join(repository.directory, candidatePath), 'guarded', 'utf8');

      const encoder = new TextEncoder();
      const rawInventoryBytes = encoder.encode(`${candidatePath}\u0000`).byteLength;
      const attributeBytes = encoder.encode(
        `${candidatePath}\u0000filter\u0000private\u0000${candidatePath}\u0000working-tree-encoding\u0000UTF-16LE\u0000${candidatePath}\u0000ident\u0000set\u0000`,
      ).byteLength;
      const exactMetadataBytes = rawInventoryBytes + attributeBytes;

      await expect(
        probeGitInventory({
          maxEntries: 1,
          maxMetadataBytes: exactMetadataBytes,
          repositoryRoot: repository.directory,
        }),
      ).resolves.toMatchObject({ kind: 'probed' });
      await expect(
        probeGitInventory({
          maxEntries: 1,
          maxMetadataBytes: exactMetadataBytes - 1,
          repositoryRoot: repository.directory,
        }),
      ).resolves.toStrictEqual({ errorCode: 'RESOURCE_LIMIT_EXCEEDED', kind: 'failed' });
    } finally {
      repository.remove();
    }
  });
});
