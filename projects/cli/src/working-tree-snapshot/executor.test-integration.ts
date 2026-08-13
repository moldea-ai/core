// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { createGitProcessEnvironment } from '../git-process/index.js';

import { createWorkingTreeSnapshotExecutor } from './executor.js';

/** Executes one fixture-owned Git operation without a platform shell. */
const executeFixtureGit = (
  directory: string,
  environment: NodeJS.ProcessEnv,
  hooksDirectory: string,
  arguments_: readonly string[],
): void => {
  execFileSync(
    'git',
    ['-c', `core.hooksPath=${hooksDirectory}`, '-c', 'init.defaultBranch=main', ...arguments_],
    { cwd: directory, env: environment, stdio: 'ignore' },
  );
};

describe('working-tree snapshot integration', () => {
  test('retries a real Repository FS snapshot mutation without reusing provisional bytes', async () => {
    const temporaryDirectory = realpathSync(
      mkdtempSync(path.join(tmpdir(), 'moldea-cli-working-tree-snapshot-')),
    );
    const repositoryRoot = path.join(temporaryDirectory, 'repository');
    const homeDirectory = path.join(temporaryDirectory, 'home');
    const configDirectory = path.join(temporaryDirectory, 'config');
    const hooksDirectory = path.join(temporaryDirectory, 'hooks');
    const selectedHostPath = path.join(repositoryRoot, 'moldea', 'project.md');
    const replacementHostPath = path.join(temporaryDirectory, 'replacement.md');
    const environment = createGitProcessEnvironment({
      ...process.env,
      HOME: homeDirectory,
      XDG_CONFIG_HOME: configDirectory,
    });

    try {
      for (const directory of [repositoryRoot, homeDirectory, configDirectory, hooksDirectory]) {
        mkdirSync(directory, { recursive: true });
      }

      executeFixtureGit(repositoryRoot, environment, hooksDirectory, ['init']);
      mkdirSync(path.dirname(selectedHostPath));
      writeFileSync(selectedHostPath, 'initial bytes', 'utf8');
      executeFixtureGit(repositoryRoot, environment, hooksDirectory, [
        'add',
        '--',
        'moldea/project.md',
      ]);

      let operationCalls = 0;
      const executeSnapshot = createWorkingTreeSnapshotExecutor();
      const result = await executeSnapshot({
        operation: async (reader) => {
          operationCalls += 1;

          if (operationCalls === 1) {
            writeFileSync(replacementHostPath, 'accepted replacement bytes', 'utf8');
            rmSync(selectedHostPath);
            renameSync(replacementHostPath, selectedHostPath);
          }

          const bytes = await reader.readFile(parseRepositoryPath('/moldea/project.md'));

          return new TextDecoder().decode(bytes);
        },
        repositoryRoot,
        resourceLimits: {
          maxDiagnostics: 16,
          maxEntries: 16,
          maxEvidence: 16,
          maxFileBytes: 1024,
          maxManifestBytes: 1024,
          maxTotalBytes: 4096,
        },
      });

      expect(result).toStrictEqual({ kind: 'completed', result: 'accepted replacement bytes' });
      expect(operationCalls).toBe(2);
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
