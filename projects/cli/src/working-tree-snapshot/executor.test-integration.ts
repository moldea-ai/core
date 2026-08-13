// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { probeGitInventory, type IGitInventoryProbe } from '../git-inventory/index.js';
import { createGitProcessEnvironment } from '../git-process/index.js';
import { inspectGitWorkingTreeIdentity } from '../git-working-tree/index.js';

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

  test('accepts the final stable content classification and rejects three changed attempts', async () => {
    const temporaryDirectory = realpathSync(
      mkdtempSync(path.join(tmpdir(), 'moldea-cli-working-tree-attributes-')),
    );
    const repositoryRoot = path.join(temporaryDirectory, 'repository');
    const homeDirectory = path.join(temporaryDirectory, 'home');
    const configDirectory = path.join(temporaryDirectory, 'config');
    const hooksDirectory = path.join(temporaryDirectory, 'hooks');
    const attributesPath = path.join(repositoryRoot, '.gitattributes');
    const selectedHostPath = path.join(repositoryRoot, 'moldea', 'project.md');
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
      writeFileSync(selectedHostPath, '# Project\n', 'utf8');
      writeFileSync(attributesPath, 'moldea/project.md -ident\n', 'utf8');
      executeFixtureGit(repositoryRoot, environment, hooksDirectory, ['add', '--all']);

      let probeCalls = 0;
      const inventoryProbe: IGitInventoryProbe = async (input) => {
        const result = await probeGitInventory(input);
        probeCalls += 1;

        if (probeCalls === 1 || probeCalls === 3) {
          writeFileSync(
            attributesPath,
            probeCalls === 1 ? 'moldea/project.md ident\n' : 'moldea/project.md -ident\n',
            'utf8',
          );
        }

        return result;
      };
      const executeSnapshot = createWorkingTreeSnapshotExecutor(
        inspectGitWorkingTreeIdentity,
        inventoryProbe,
      );
      let operationCalls = 0;
      const result = await executeSnapshot({
        operation: async (reader) => {
          operationCalls += 1;
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

      expect(result).toStrictEqual({ kind: 'completed', result: '# Project\n' });
      expect(probeCalls).toBe(6);
      expect(operationCalls).toBe(1);

      let exhaustionProbeCalls = 0;
      const exhaustionProbe: IGitInventoryProbe = async (input) => {
        const probeResult = await probeGitInventory(input);
        exhaustionProbeCalls += 1;

        if (exhaustionProbeCalls % 2 === 1) {
          writeFileSync(
            attributesPath,
            exhaustionProbeCalls % 4 === 1
              ? 'moldea/project.md ident\n'
              : 'moldea/project.md -ident\n',
            'utf8',
          );
        }

        return probeResult;
      };
      const executeUnstableSnapshot = createWorkingTreeSnapshotExecutor(
        inspectGitWorkingTreeIdentity,
        exhaustionProbe,
      );
      const unreachableOperation = (): Promise<string> =>
        Promise.reject(new Error('An unstable snapshot must not run its operation.'));

      await expect(
        executeUnstableSnapshot({
          operation: unreachableOperation,
          repositoryRoot,
          resourceLimits: {
            maxDiagnostics: 16,
            maxEntries: 16,
            maxEvidence: 16,
            maxFileBytes: 1024,
            maxManifestBytes: 1024,
            maxTotalBytes: 4096,
          },
        }),
      ).resolves.toStrictEqual({ errorCode: 'WORKING_TREE_UNSTABLE', kind: 'failed' });
      expect(exhaustionProbeCalls).toBe(6);
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects replacement of the pinned repository identity after snapshot loss', async () => {
    const temporaryDirectory = realpathSync(
      mkdtempSync(path.join(tmpdir(), 'moldea-cli-working-tree-identity-')),
    );
    const repositoryRoot = path.join(temporaryDirectory, 'repository');
    const replacedRepositoryRoot = path.join(temporaryDirectory, 'replaced-repository');
    const homeDirectory = path.join(temporaryDirectory, 'home');
    const configDirectory = path.join(temporaryDirectory, 'config');
    const hooksDirectory = path.join(temporaryDirectory, 'hooks');
    const selectedRelativePath = path.join('moldea', 'project.md');
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
      mkdirSync(path.join(repositoryRoot, 'moldea'));
      writeFileSync(path.join(repositoryRoot, selectedRelativePath), 'initial bytes', 'utf8');
      executeFixtureGit(repositoryRoot, environment, hooksDirectory, [
        'add',
        '--',
        'moldea/project.md',
      ]);

      const executeSnapshot = createWorkingTreeSnapshotExecutor();
      const result = await executeSnapshot({
        operation: async (reader) => {
          renameSync(repositoryRoot, replacedRepositoryRoot);
          mkdirSync(repositoryRoot);
          executeFixtureGit(repositoryRoot, environment, hooksDirectory, ['init']);
          mkdirSync(path.join(repositoryRoot, 'moldea'));
          writeFileSync(
            path.join(repositoryRoot, selectedRelativePath),
            'replacement bytes',
            'utf8',
          );
          executeFixtureGit(repositoryRoot, environment, hooksDirectory, [
            'add',
            '--',
            'moldea/project.md',
          ]);

          return reader.readFile(parseRepositoryPath('/moldea/project.md'));
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

      expect(result).toStrictEqual({ errorCode: 'WORKING_TREE_UNSTABLE', kind: 'failed' });
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
