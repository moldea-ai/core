// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { parseRepositoryPath, type IRepositoryEntry } from '@moldea.ai/repository';

import { createWorkingTreeRepositoryReader } from './factory.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('working-tree reader composition with repository-fs', () => {
  test('materializes exact selected paths and applies the Git symlink overlay', async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), 'moldea-cli-repository-reader-'));

    temporaryDirectories.push(repositoryRoot);
    await mkdir(join(repositoryRoot, 'moldea'));
    await writeFile(join(repositoryRoot, 'moldea', 'link'), '../target');
    await writeFile(join(repositoryRoot, 'moldea', 'project.md'), 'project context');
    await writeFile(join(repositoryRoot, 'unselected.txt'), 'excluded');

    const linkPath = parseRepositoryPath('/moldea/link');
    const projectPath = parseRepositoryPath('/moldea/project.md');
    const reader = await createWorkingTreeRepositoryReader({
      entries: [
        {
          entryType: 'file',
          indexEntries: [{ mode: '120000', stage: 0 }],
          kind: 'tracked',
          path: linkPath,
          requiresSymlinkOverlay: true,
        },
        {
          entryType: 'file',
          kind: 'untracked',
          path: projectPath,
          requiresSymlinkOverlay: false,
        },
      ],
      repositoryRoot,
      resourceLimits: {
        maxDiagnostics: 16,
        maxEntries: 16,
        maxEvidence: 16,
        maxFileBytes: 1024,
        maxManifestBytes: 1024,
        maxTotalBytes: 2048,
      },
    });

    const entries: IRepositoryEntry[] = [];

    for await (const entry of reader.listEntries()) {
      entries.push(entry);
    }

    expect(entries).toStrictEqual([
      { path: parseRepositoryPath('/moldea'), type: 'directory' },
      { path: linkPath, type: 'symlink' },
      { path: projectPath, type: 'file' },
    ]);
    await expect(reader.readFile(linkPath)).rejects.toMatchObject({
      code: 'ENTRY_NOT_FILE',
      operation: 'read-file',
      path: linkPath,
      retryable: false,
    });
    await expect(reader.readFile(projectPath)).resolves.toStrictEqual(
      new TextEncoder().encode('project context'),
    );
    await expect(reader.getEntry(parseRepositoryPath('/unselected.txt'))).resolves.toBeNull();
  });
});
