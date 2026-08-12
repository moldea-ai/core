// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  GIT_PROCESS_ENVIRONMENT_OVERRIDES,
  GIT_PROCESS_REMOVED_ENVIRONMENT_NAMES,
  GIT_PROCESS_REMOVED_ENVIRONMENT_PREFIXES,
} from './constants.js';
import { createGitProcessEnvironment } from './environment.js';

describe('createGitProcessEnvironment', () => {
  test.each(GIT_PROCESS_REMOVED_ENVIRONMENT_NAMES)(
    'removes inherited %s case-insensitively',
    (environmentName) => {
      const result = createGitProcessEnvironment({
        [environmentName.toLowerCase()]: 'unsafe',
      });

      expect(Object.keys(result).map((name) => name.toUpperCase())).not.toContain(environmentName);
    },
  );

  test.each(GIT_PROCESS_REMOVED_ENVIRONMENT_PREFIXES)(
    'removes inherited %s variables case-insensitively',
    (environmentPrefix) => {
      const environmentName = `${environmentPrefix.toLowerCase()}unsafe`;
      const result = createGitProcessEnvironment({ [environmentName]: 'unsafe' });

      expect(result).not.toHaveProperty(environmentName);
    },
  );

  test('preserves unrelated variables and applies deterministic overrides without mutation', () => {
    const environment: NodeJS.ProcessEnv = {
      HOME: '/safe/home',
      LANG: 'host-locale',
      PATH: '/safe/bin',
      UNDEFINED_ENTRY: undefined,
    };
    const originalEnvironment = { ...environment };

    const result = createGitProcessEnvironment(environment);

    expect(result).toStrictEqual({
      HOME: '/safe/home',
      PATH: '/safe/bin',
      ...GIT_PROCESS_ENVIRONMENT_OVERRIDES,
    });
    expect(environment).toStrictEqual(originalEnvironment);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test('removes case variants that would compete with deterministic overrides', () => {
    const result = createGitProcessEnvironment({
      git_pager: 'unsafe-pager',
      lang: 'unsafe-locale',
      no_color: '0',
      pager: 'unsafe-pager',
    });

    expect(result).toStrictEqual(GIT_PROCESS_ENVIRONMENT_OVERRIDES);
  });
});
