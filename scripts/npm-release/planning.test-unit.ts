// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type {
  INpmReleaseProject,
  INpmReleaseProjectChange,
  INpmReleaseWorkflowPlanSources,
} from './types.ts';
import { createNpmReleaseWorkflowOutputs, createNpmReleaseWorkflowPlan } from './planning.ts';

const NO_PREVIOUS_VERSIONS = {
  cli: null,
  core: null,
  repository: null,
  'repository-fs': null,
} as const;

const createProjectChanges = (
  overrides: Partial<Record<INpmReleaseProject, Partial<INpmReleaseProjectChange>>> = {},
): INpmReleaseWorkflowPlanSources['projectChanges'] =>
  Object.fromEntries(
    (['cli', 'core', 'repository', 'repository-fs'] as const).map((project) => [
      project,
      {
        currentVersion: '1.0.0',
        isChanged: false,
        previousVersion: '1.0.0',
        ...overrides[project],
      },
    ]),
  ) as INpmReleaseWorkflowPlanSources['projectChanges'];

describe('npm release workflow planning', () => {
  test('selects one explicit project for manual bootstrap or recovery', () => {
    expect(
      createNpmReleaseWorkflowPlan({
        eventName: 'workflow_dispatch',
        mode: 'bootstrap',
        project: 'core',
        projectChanges: createProjectChanges(),
      }),
    ).toStrictEqual({
      mode: 'bootstrap',
      previousVersions: NO_PREVIOUS_VERSIONS,
      projects: ['core'],
      trigger: 'manual',
    });
  });

  test('selects changed packages in dependency order for trusted publication', () => {
    expect(
      createNpmReleaseWorkflowPlan({
        eventName: 'push',
        mode: '',
        project: '',
        projectChanges: createProjectChanges({
          cli: { currentVersion: '1.0.1', isChanged: true },
          repository: { currentVersion: '1.1.0', isChanged: true },
          'repository-fs': { currentVersion: '2.0.0', isChanged: true },
        }),
      }),
    ).toStrictEqual({
      mode: 'trusted',
      previousVersions: {
        cli: '1.0.0',
        core: null,
        repository: '1.0.0',
        'repository-fs': '1.0.0',
      },
      projects: ['repository', 'repository-fs', 'cli'],
      trigger: 'automatic',
    });
  });

  test('accepts a push without public-package changes as a no-op', () => {
    expect(
      createNpmReleaseWorkflowPlan({
        eventName: 'push',
        mode: '',
        project: '',
        projectChanges: createProjectChanges(),
      }),
    ).toStrictEqual({
      mode: 'trusted',
      previousVersions: NO_PREVIOUS_VERSIONS,
      projects: [],
      trigger: 'automatic',
    });
  });

  test('creates complete workflow outputs for automatic release sequencing', () => {
    const plan = createNpmReleaseWorkflowPlan({
      eventName: 'push',
      mode: '',
      project: '',
      projectChanges: createProjectChanges({
        core: { currentVersion: '1.0.1', isChanged: true },
        repository: { currentVersion: '1.1.0', isChanged: true },
      }),
    });

    expect(createNpmReleaseWorkflowOutputs(plan)).toStrictEqual({
      cli: 'false',
      cli_previous_version: '',
      core: 'true',
      core_previous_version: '1.0.0',
      has_releases: 'true',
      mode: 'trusted',
      project_key: 'repository-core',
      projects: '["repository","core"]',
      repository: 'true',
      repository_previous_version: '1.0.0',
      repository_fs: 'false',
      repository_fs_previous_version: '',
    });
  });

  test.each([
    ['unchanged version', '1.0.0'],
    ['lower version', '0.9.0'],
    ['prerelease version', '1.0.1-rc.1'],
    ['noncanonical version', 'v1.0.1'],
  ])('rejects a changed package with an %s', (_description, currentVersion) => {
    expect(() =>
      createNpmReleaseWorkflowPlan({
        eventName: 'push',
        mode: '',
        project: '',
        projectChanges: createProjectChanges({
          core: { currentVersion, isChanged: true },
        }),
      }),
    ).toThrow('must declare a greater stable package version');
  });

  test.each([
    ['unsupported event', { eventName: 'pull_request' }],
    ['push project input', { project: 'core' }],
    ['push mode input', { mode: 'trusted' }],
    ['unknown manual project', { eventName: 'workflow_dispatch', project: 'unknown' }],
    ['unknown manual mode', { eventName: 'workflow_dispatch', mode: 'automatic' }],
  ])('rejects an %s', (_description, override) => {
    expect(() =>
      createNpmReleaseWorkflowPlan({
        eventName: 'push',
        mode: '',
        project: '',
        projectChanges: createProjectChanges(),
        ...override,
      }),
    ).toThrow();
  });
});
