import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createGitProcessEnvironment } from '../git-process/index.js';
import { parseGitAbsolutePathOutput } from '../git-working-tree/index.js';

// isolated Git repository and configuration used by inventory integration tests
export interface IGitRepositoryFixture {
  readonly directory: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly hooksDirectory: string;
  readonly remove: () => void;
  readonly testDirectory: string;
}

/**
 * Discovers the fixture root through the same canonical Git output used by production.
 * @param directory The initialized fixture working tree.
 * @param environment The isolated Git fixture environment.
 * @returns The strictly parsed absolute working-tree root.
 */
const discoverFixtureRepositoryRoot = (
  directory: string,
  environment: NodeJS.ProcessEnv,
): string => {
  const output = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: directory,
    encoding: 'buffer',
    env: environment,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const repositoryRoot = parseGitAbsolutePathOutput(Uint8Array.from(output));

  if (repositoryRoot === null) {
    throw new Error('The Git fixture root output is invalid.');
  }

  return repositoryRoot;
};

/** Initializes one ordinary Git repository with isolated deterministic configuration. */
export const initializeGitRepository = (
  directory: string,
  environment: NodeJS.ProcessEnv,
  hooksDirectory: string,
): void => {
  mkdirSync(directory, { recursive: true });
  execFileSync(
    'git',
    ['-c', `core.hooksPath=${hooksDirectory}`, '-c', 'init.defaultBranch=main', 'init'],
    { cwd: directory, env: environment, stdio: 'ignore' },
  );
};

/** Creates an isolated unborn Git repository with no ambient user configuration. */
export const createGitRepository = (): IGitRepositoryFixture => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'moldea-git-inventory-'));
  const testDirectory = realpathSync(temporaryDirectory);
  const initialDirectory = path.join(testDirectory, 'repository');
  const homeDirectory = path.join(testDirectory, 'home');
  const configDirectory = path.join(testDirectory, 'config');
  const hooksDirectory = path.join(testDirectory, 'hooks');
  const environment = createGitProcessEnvironment({
    ...process.env,
    HOME: homeDirectory,
    XDG_CONFIG_HOME: configDirectory,
  });

  for (const fixtureDirectory of [homeDirectory, configDirectory, hooksDirectory]) {
    mkdirSync(fixtureDirectory, { recursive: true });
  }

  initializeGitRepository(initialDirectory, environment, hooksDirectory);
  const directory = discoverFixtureRepositoryRoot(initialDirectory, environment);

  return {
    directory,
    environment,
    hooksDirectory,
    remove: () => rmSync(testDirectory, { force: true, recursive: true }),
    testDirectory,
  };
};

/** Executes one fixture-owned Git operation without a platform shell. */
export const runFixtureGit = (
  repository: IGitRepositoryFixture,
  gitArguments: readonly string[],
  directory: string = repository.directory,
): void => {
  execFileSync('git', [...gitArguments], {
    cwd: directory,
    env: repository.environment,
    stdio: 'ignore',
  });
};

/** Creates one deterministic commit after fixture content has been staged. */
export const commitFixtureGitIndex = (
  repository: IGitRepositoryFixture,
  directory: string = repository.directory,
): void => {
  runFixtureGit(
    repository,
    [
      '-c',
      'user.name=Moldea Test',
      '-c',
      'user.email=moldea@example.invalid',
      'commit',
      '-m',
      'test fixture',
    ],
    directory,
  );
};
