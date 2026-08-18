// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { NPM_RELEASE_PROJECT_ORDER, NPM_RELEASE_PROJECTS } from './constants.ts';
import { createNpmReleaseWorkflowPlan } from './planning.ts';
import { loadNpmReleaseProjectChanges } from './project-changes.ts';
import type { INpmReleaseProject } from './types.ts';

let repositoryDirectory: string;

const runGit = (gitArguments: readonly string[], input?: string): string =>
  execFileSync('git', gitArguments, {
    cwd: repositoryDirectory,
    encoding: 'utf8',
    input,
  }).trim();

const writeRepositoryFile = async (filePath: string, content: string): Promise<void> => {
  const absolutePath = join(repositoryDirectory, filePath);

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');
};

const writeProjectManifest = async (
  project: INpmReleaseProject,
  version: string,
): Promise<void> => {
  const configuration = NPM_RELEASE_PROJECTS[project];

  await writeRepositoryFile(
    `${configuration.projectDirectory}/package.json`,
    `${JSON.stringify({ name: configuration.packageName, version }, null, 2)}\n`,
  );
};

const commitIndex = (message: string): string => {
  runGit(['commit', '--quiet', '--no-gpg-sign', '--message', message]);

  return runGit(['rev-parse', 'HEAD']);
};

const commitWorktree = (message: string): string => {
  runGit(['add', '--all']);

  return commitIndex(message);
};

/**
 * Stages a synthetic Git tree entry without materializing an excluded path.
 * @param filePath The repository-relative tree path.
 * @param content The blob content associated with the path.
 */
const stageGitTreeFile = (filePath: string, content: string): void => {
  const blob = runGit(['hash-object', '-w', '--stdin'], content);

  runGit(['update-index', '--add', '--cacheinfo', `100644,${blob},${filePath}`]);
};

const loadChanges = (baseCommit: string, currentCommit: string) =>
  loadNpmReleaseProjectChanges(
    pathToFileURL(`${repositoryDirectory}${sep}`),
    baseCommit,
    currentCommit,
  );

beforeEach(async () => {
  repositoryDirectory = await mkdtemp(join(tmpdir(), 'moldea-npm-release-'));
  runGit(['init', '--quiet', '--initial-branch', 'main']);
  runGit(['config', 'user.email', 'npm-release-test@moldea.ai']);
  runGit(['config', 'user.name', 'npm release test']);
  runGit(['config', 'commit.gpgSign', 'false']);

  await Promise.all(
    NPM_RELEASE_PROJECT_ORDER.map((project) => writeProjectManifest(project, '1.0.0')),
  );
  commitWorktree('test: initialize package manifests');
});

afterEach(async () => {
  await rm(repositoryDirectory, { force: true, recursive: true });
});

describe('npm release project changes', () => {
  test('loads committed versions and detects only the changed public project', async () => {
    const baseCommit = runGit(['rev-parse', 'HEAD']);

    await writeProjectManifest('core', '1.0.1');
    await writeRepositoryFile('projects/core/src/change.ts', 'export const change = true;\n');

    const currentCommit = commitWorktree('feat(core): change the package');
    const changes = await loadChanges(baseCommit, currentCommit);

    expect(changes).toStrictEqual({
      'adapter-anthropic': {
        currentVersion: '1.0.0',
        isChanged: false,
        previousVersion: '1.0.0',
      },
      'adapter-openai': {
        currentVersion: '1.0.0',
        isChanged: false,
        previousVersion: '1.0.0',
      },
      cli: { currentVersion: '1.0.0', isChanged: false, previousVersion: '1.0.0' },
      core: { currentVersion: '1.0.1', isChanged: true, previousVersion: '1.0.0' },
      repository: { currentVersion: '1.0.0', isChanged: false, previousVersion: '1.0.0' },
      'repository-fs': {
        currentVersion: '1.0.0',
        isChanged: false,
        previousVersion: '1.0.0',
      },
      'website-ui': {
        currentVersion: '1.0.0',
        isChanged: false,
        previousVersion: '1.0.0',
      },
    });
  });

  test('selects a newly introduced public project without a base package version', async () => {
    const projectDirectory = NPM_RELEASE_PROJECTS['adapter-anthropic'].projectDirectory;

    await rm(join(repositoryDirectory, projectDirectory), { recursive: true });
    const baseCommit = commitWorktree('test: establish the tree before the new project');

    await writeProjectManifest('adapter-anthropic', '1.0.0');
    await writeRepositoryFile(`${projectDirectory}/src/index.ts`, 'export const adapter = true;\n');

    const currentCommit = commitWorktree('feat(adapter-anthropic): introduce the project');
    const projectChanges = await loadChanges(baseCommit, currentCommit);
    const plan = createNpmReleaseWorkflowPlan({
      eventName: 'push',
      mode: '',
      project: '',
      projectChanges,
    });

    expect(projectChanges['adapter-anthropic']).toStrictEqual({
      currentVersion: '1.0.0',
      isChanged: true,
      previousVersion: null,
    });
    expect(plan).toStrictEqual({
      mode: 'trusted',
      previousVersions: {
        'adapter-anthropic': null,
        'adapter-openai': null,
        cli: null,
        core: null,
        repository: null,
        'repository-fs': null,
        'website-ui': null,
      },
      projects: ['adapter-anthropic'],
      trigger: 'automatic',
    });
  });

  test('ignores archived and backup-only Git tree changes', async () => {
    const baseCommit = runGit(['rev-parse', 'HEAD']);

    stageGitTreeFile('projects/core/_archive/legacy.ts', 'legacy');
    stageGitTreeFile('projects/core/nested/_backups/legacy.ts', 'backup');

    const currentCommit = commitIndex('test: add excluded Git tree entries');
    const changes = await loadChanges(baseCommit, currentCommit);

    expect(Object.values(changes).every((change) => !change.isChanged)).toBe(true);
  });

  test.each(NPM_RELEASE_PROJECT_ORDER)(
    'ignores package-owned full documentation for %s',
    async (project) => {
      const baseCommit = runGit(['rev-parse', 'HEAD']);
      const projectDirectory = NPM_RELEASE_PROJECTS[project].projectDirectory;

      await writeRepositoryFile(`${projectDirectory}/docs/concepts.md`, '# Package concepts\n');

      const currentCommit = commitWorktree(`docs(${project}): add full documentation`);
      const changes = await loadChanges(baseCommit, currentCommit);

      expect(changes[project].isChanged).toBe(false);
    },
  );

  test.each([
    ['README.md', '# Repository\n'],
    ['package.json', null],
    ['src/change.ts', 'export const change = true;\n'],
  ] as const)('keeps repository %s changes release-relevant', async (filePath, content) => {
    const baseCommit = runGit(['rev-parse', 'HEAD']);

    if (filePath === 'package.json') {
      await writeProjectManifest('repository', '1.0.1');
    } else {
      await writeRepositoryFile(`projects/repository/${filePath}`, content ?? '');
    }

    const currentCommit = commitWorktree(`test: change repository ${filePath}`);
    const changes = await loadChanges(baseCommit, currentCommit);

    expect(changes.repository.isChanged).toBe(true);
  });

  test('keeps a project release-relevant when documentation and source change together', async () => {
    const baseCommit = runGit(['rev-parse', 'HEAD']);

    await writeRepositoryFile('projects/repository/docs/concepts.md', '# Concepts\n');
    await writeRepositoryFile('projects/repository/src/change.ts', 'export const change = true;\n');

    const currentCommit = commitWorktree('feat(repository): change source with documentation');
    const changes = await loadChanges(baseCommit, currentCommit);

    expect(changes.repository.isChanged).toBe(true);
  });

  test('feeds a real project change into version-bump validation', async () => {
    const baseCommit = runGit(['rev-parse', 'HEAD']);

    await writeRepositoryFile('projects/repository/README.md', '# Repository\n');

    const currentCommit = commitWorktree('docs(repository): change package documentation');
    const projectChanges = await loadChanges(baseCommit, currentCommit);

    expect(() =>
      createNpmReleaseWorkflowPlan({
        eventName: 'push',
        mode: '',
        project: '',
        projectChanges,
      }),
    ).toThrow('must declare a greater stable package version');
  });

  test('rejects a missing committed package manifest', async () => {
    const baseCommit = runGit(['rev-parse', 'HEAD']);

    await rm(join(repositoryDirectory, 'projects/cli/package.json'));

    const currentCommit = commitWorktree('test: remove a package manifest');

    await expect(loadChanges(baseCommit, currentCommit)).rejects.toThrow(
      'projects/cli/package.json file could not be read',
    );
  });

  test('rejects malformed committed package metadata', async () => {
    const baseCommit = runGit(['rev-parse', 'HEAD']);

    await writeRepositoryFile('projects/repository-fs/package.json', '[]\n');

    const currentCommit = commitWorktree('test: invalidate package metadata');

    await expect(loadChanges(baseCommit, currentCommit)).rejects.toThrow(
      '@moldea.ai/repository-fs package manifest is invalid',
    );
  });
});
