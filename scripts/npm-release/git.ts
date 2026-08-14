import { spawnSync } from 'node:child_process';

const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;

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
