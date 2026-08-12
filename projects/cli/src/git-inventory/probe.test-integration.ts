// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { createGitProcessEnvironment } from '../git-process/index.js';

import { probeGitInventory } from './probe.js';

interface IGitRepositoryFixture {
  readonly directory: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly remove: () => void;
}

/** Creates an isolated unborn Git repository with no ambient user configuration. */
const createGitRepository = (): IGitRepositoryFixture => {
  const testDirectory = mkdtempSync(path.join(tmpdir(), 'moldea-git-inventory-'));
  const directory = path.join(testDirectory, 'repository');
  const homeDirectory = path.join(testDirectory, 'home');
  const configDirectory = path.join(testDirectory, 'config');
  const hooksDirectory = path.join(testDirectory, 'hooks');
  const environment = createGitProcessEnvironment({
    ...process.env,
    HOME: homeDirectory,
    XDG_CONFIG_HOME: configDirectory,
  });

  for (const fixtureDirectory of [directory, homeDirectory, configDirectory, hooksDirectory]) {
    mkdirSync(fixtureDirectory, { recursive: true });
  }

  execFileSync(
    'git',
    ['-c', `core.hooksPath=${hooksDirectory}`, '-c', 'init.defaultBranch=main', 'init'],
    { cwd: directory, env: environment, stdio: 'ignore' },
  );

  return {
    directory,
    environment,
    remove: () => rmSync(testDirectory, { force: true, recursive: true }),
  };
};

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
      execFileSync('git', ['add', '--', '.gitignore', 'nested/tracked file.txt'], {
        cwd: repository.directory,
        env: repository.environment,
        stdio: 'ignore',
      });

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
      execFileSync('git', ['add', '--', 'tracked.txt'], {
        cwd: repository.directory,
        env: repository.environment,
        stdio: 'ignore',
      });

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
        execFileSync('git', ['add', '--all'], {
          cwd: repository.directory,
          env: repository.environment,
          stdio: 'ignore',
        });

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
});
