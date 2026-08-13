// @vitest-environment node
import { mkdirSync, writeFileSync } from 'node:fs';
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
        candidates: [
          { kind: 'tracked', mode: '100644', path: '.gitignore', stage: 0 },
          {
            kind: 'tracked',
            mode: '100644',
            path: 'nested/tracked file.txt',
            stage: 0,
          },
          { kind: 'untracked', path: 'untracked-😀.txt' },
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

  test.skipIf(process.platform === 'win32')(
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
        candidates: [
          { kind: 'tracked', mode: '100644', path: '.gitattributes', stage: 0 },
          { kind: 'tracked', mode: '100644', path: '.gitignore', stage: 0 },
          { kind: 'tracked', mode: '100644', path: 'nested/tracked.txt', stage: 0 },
          { kind: 'untracked', path: '.github/workflow.yml' },
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
        candidates: [{ kind: 'tracked', mode: '100644', path: '.gitmodules', stage: 0 }],
        kind: 'probed',
      });

      runFixtureGit(repository, ['submodule', 'deinit', '--force', '--', 'module']);

      await expect(probe()).resolves.toStrictEqual({
        candidates: [{ kind: 'tracked', mode: '100644', path: '.gitmodules', stage: 0 }],
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
      ).resolves.toStrictEqual({ candidates: [], kind: 'probed' });
    } finally {
      repository.remove();
    }
  });
});
