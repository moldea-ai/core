import { spawnSync } from 'node:child_process';

const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;

const requireCommit = (commit: string): void => {
  if (!COMMIT_PATTERN.test(commit)) {
    throw new TypeError('The Git commit is invalid.');
  }
};

/**
 * Reads one UTF-8 file from a committed Git tree without changing repository state.
 * @param repositoryRoot The repository containing the committed tree.
 * @param commit The exact source commit.
 * @param filePath The repository-relative file path.
 * @returns The committed file content.
 * @throws
 * - If the commit is invalid or Git cannot read the file safely
 */
export const readGitFile = (repositoryRoot: URL, commit: string, filePath: string): string => {
  requireCommit(commit);

  const result = spawnSync('git', ['show', `${commit}:${filePath}`], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`The ${filePath} file could not be read from ${commit}.`);
  }

  return result.stdout;
};

/**
 * Reads one UTF-8 file when it exists in a committed Git tree.
 * @param repositoryRoot The repository containing the committed tree.
 * @param commit The exact source commit.
 * @param filePath The repository-relative file path.
 * @returns The committed file content, or null when the path is absent.
 * @throws
 * - If the commit is invalid or Git cannot inspect the tree safely
 */
export const readOptionalGitFile = (
  repositoryRoot: URL,
  commit: string,
  filePath: string,
): string | null => {
  requireCommit(commit);

  const result = spawnSync('git', ['ls-tree', '-z', '--name-only', commit, '--', filePath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`The ${filePath} file state could not be read from ${commit}.`);
  }

  if (result.stdout === '') {
    return null;
  }

  if (result.stdout !== `${filePath}\0`) {
    throw new Error(`The ${filePath} file state could not be resolved safely from ${commit}.`);
  }

  return readGitFile(repositoryRoot, commit, filePath);
};

/**
 * Checks whether one project has an npm release-relevant change between exact Git commits.
 * @param repositoryRoot The repository containing both commits.
 * @param baseCommit The commit before the push.
 * @param currentCommit The pushed commit.
 * @param projectDirectory The repository-relative public project directory.
 * @returns Whether the project contains a package-artifact or implementation change.
 * @throws
 * - If either commit is invalid or Git cannot compare the project safely
 */
export const hasGitProjectChanges = (
  repositoryRoot: URL,
  baseCommit: string,
  currentCommit: string,
  projectDirectory: string,
): boolean => {
  requireCommit(baseCommit);
  requireCommit(currentCommit);

  const result = spawnSync(
    'git',
    [
      'diff',
      '--quiet',
      baseCommit,
      currentCommit,
      '--',
      projectDirectory,
      `:(exclude)${projectDirectory}/_archive/**`,
      `:(exclude)${projectDirectory}/_archives/**`,
      `:(exclude)${projectDirectory}/_backup/**`,
      `:(exclude)${projectDirectory}/_backups/**`,
      `:(exclude)${projectDirectory}/**/_archive/**`,
      `:(exclude)${projectDirectory}/**/_archives/**`,
      `:(exclude)${projectDirectory}/**/_backup/**`,
      `:(exclude)${projectDirectory}/**/_backups/**`,
      `:(exclude)${projectDirectory}/docs`,
      `:(exclude)${projectDirectory}/docs/**`,
      `:(exclude)${projectDirectory}/**/*.test-unit.*`,
      `:(exclude)${projectDirectory}/**/*.test-integration.*`,
      `:(exclude)${projectDirectory}/**/*.test-e2e.*`,
      `:(exclude)${projectDirectory}/**/*.test-bench.*`,
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`The ${projectDirectory} project changes could not be resolved safely.`);
  }

  return result.status === 1;
};

/**
 * Resolves an annotated or lightweight tag to its commit without changing Git state.
 * @param tag The validated package release tag.
 * @returns The exact commit, or null when the tag does not exist.
 * @throws
 * - If Git cannot resolve the tag state safely
 */
export const loadGitTagCommit = (tag: string): string | null => {
  const result = spawnSync(
    'git',
    ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`],
    {
      encoding: 'utf8',
    },
  );

  if (result.status === 1 && result.stdout === '' && result.stderr === '') {
    return null;
  }

  const commit = result.stdout.trim();

  if (result.status !== 0 || !COMMIT_PATTERN.test(commit)) {
    throw new Error(`The ${tag} Git tag could not be resolved safely.`);
  }

  return commit;
};
