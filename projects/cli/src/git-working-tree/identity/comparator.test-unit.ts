// @vitest-environment node
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { areGitWorkingTreeIdentitiesEqual } from './comparator.js';
import type { IGitWorkingTreeIdentity } from './types.js';

const REPOSITORY_ROOT = path.resolve('repository');
const GIT_DIRECTORY = path.join(REPOSITORY_ROOT, '.git', 'worktrees', 'selected');
const COMMON_DIRECTORY = path.join(REPOSITORY_ROOT, '.git');

/** Creates one complete identity with deterministic location identifiers. */
const createIdentity = (): IGitWorkingTreeIdentity => ({
  commonDirectory: { dev: 1n, ino: 3n, path: COMMON_DIRECTORY },
  gitDirectory: { dev: 1n, ino: 2n, path: GIT_DIRECTORY },
  repositoryRoot: { dev: 1n, ino: 1n, path: REPOSITORY_ROOT },
});

describe('areGitWorkingTreeIdentitiesEqual', () => {
  test('accepts distinct immutable observations of the same complete identity', () => {
    expect(areGitWorkingTreeIdentitiesEqual(createIdentity(), createIdentity())).toBe(true);
  });

  test.each(['repositoryRoot', 'gitDirectory', 'commonDirectory'] as const)(
    'rejects a replaced %s identity',
    (locationName) => {
      const left = createIdentity();
      const unchangedRight = createIdentity();
      const right: IGitWorkingTreeIdentity = {
        ...unchangedRight,
        [locationName]: {
          ...unchangedRight[locationName],
          ino: unchangedRight[locationName].ino + 1n,
        },
      };

      expect(areGitWorkingTreeIdentitiesEqual(left, right)).toBe(false);
    },
  );

  test('accepts an alternate path spelling for the same filesystem identity', () => {
    const left = createIdentity();
    const unchangedRight = createIdentity();
    const right: IGitWorkingTreeIdentity = {
      ...unchangedRight,
      gitDirectory: {
        ...unchangedRight.gitDirectory,
        path: path.join(REPOSITORY_ROOT, '.git', 'worktrees', 'replacement'),
      },
    };

    expect(areGitWorkingTreeIdentitiesEqual(left, right)).toBe(true);
  });
});
