import {
  GIT_PROCESS_ENVIRONMENT_OVERRIDES,
  GIT_PROCESS_REMOVED_ENVIRONMENT_NAMES,
  GIT_PROCESS_REMOVED_ENVIRONMENT_PREFIXES,
} from './constants.js';
import type { IGitProcessEnvironment } from './types.js';

const REMOVED_ENVIRONMENT_NAMES = new Set(
  GIT_PROCESS_REMOVED_ENVIRONMENT_NAMES.map((name) => name.toUpperCase()),
);

/**
 * Determines whether an inherited environment variable can alter Git behavior.
 * @param name The environment variable name.
 * @returns Whether the variable must be removed.
 */
const isRemovedEnvironmentVariable = (name: string): boolean => {
  const normalizedName = name.toUpperCase();

  return (
    REMOVED_ENVIRONMENT_NAMES.has(normalizedName) ||
    GIT_PROCESS_REMOVED_ENVIRONMENT_PREFIXES.some((prefix) => normalizedName.startsWith(prefix))
  );
};

/**
 * Creates the immutable, deterministic environment used by Git subprocesses.
 * @param environment The host environment to sanitize.
 * @returns A frozen environment that preserves unrelated variables.
 */
export const createGitProcessEnvironment = (
  environment: NodeJS.ProcessEnv,
): IGitProcessEnvironment => {
  const sanitizedEnvironment: Record<string, string> = {};

  for (const [name, environmentValue] of Object.entries(environment)) {
    if (
      environmentValue !== undefined &&
      !isRemovedEnvironmentVariable(name) &&
      !(name.toUpperCase() in GIT_PROCESS_ENVIRONMENT_OVERRIDES)
    ) {
      sanitizedEnvironment[name] = environmentValue;
    }
  }

  return Object.freeze({
    ...sanitizedEnvironment,
    ...GIT_PROCESS_ENVIRONMENT_OVERRIDES,
  });
};
