// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type {
  INpmReleaseProject,
  INpmReleaseProjectChange,
  INpmReleaseWorkflowPlanSources,
} from './types.ts';
import { createNpmReleaseWorkflowOutputs, createNpmReleaseWorkflowPlan } from './planning.ts';

const NO_PREVIOUS_VERSIONS = {
  'adapter-anthropic': null,
  'adapter-claude-agent-sdk': null,
  'adapter-google-genai': null,
  'adapter-openai': null,
  'adapter-openai-agents-sdk': null,
  'adapter-cloudflare-agents': null,
  'adapter-eve': null,
  'adapter-langchain': null,
  'adapter-vercel-ai-sdk': null,
  cli: null,
  core: null,
  repository: null,
  'repository-fs': null,
  'website-ui': null,
} as const;

const createProjectChanges = (
  overrides: Partial<Record<INpmReleaseProject, Partial<INpmReleaseProjectChange>>> = {},
): INpmReleaseWorkflowPlanSources['projectChanges'] =>
  Object.fromEntries(
    (
      [
        'adapter-anthropic',
        'adapter-claude-agent-sdk',
        'adapter-google-genai',
        'adapter-openai',
        'adapter-openai-agents-sdk',
        'adapter-cloudflare-agents',
        'adapter-eve',
        'adapter-langchain',
        'adapter-vercel-ai-sdk',
        'cli',
        'core',
        'repository',
        'repository-fs',
        'website-ui',
      ] as const
    ).map((project) => [
      project,
      {
        currentVersion: '1.0.0',
        isChanged: false,
        previousVersion: '1.0.0',
        ...overrides[project],
      },
    ]),
  ) as INpmReleaseWorkflowPlanSources['projectChanges'];

const createPublishedVersions = (
  overrides: Partial<Record<INpmReleaseProject, readonly string[]>> = {},
): INpmReleaseWorkflowPlanSources['publishedVersions'] =>
  Object.fromEntries(
    (
      [
        'adapter-anthropic',
        'adapter-claude-agent-sdk',
        'adapter-google-genai',
        'adapter-openai',
        'adapter-openai-agents-sdk',
        'adapter-cloudflare-agents',
        'adapter-eve',
        'adapter-langchain',
        'adapter-vercel-ai-sdk',
        'cli',
        'core',
        'repository',
        'repository-fs',
        'website-ui',
      ] as const
    ).map((project) => [project, overrides[project] ?? ['1.0.0']]),
  ) as INpmReleaseWorkflowPlanSources['publishedVersions'];

describe('npm release workflow planning', () => {
  test('selects one explicit project for manual bootstrap or recovery', () => {
    expect(
      createNpmReleaseWorkflowPlan({
        eventName: 'workflow_dispatch',
        mode: 'bootstrap',
        project: 'core',
        projectChanges: createProjectChanges(),
        publishedVersions: createPublishedVersions(),
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
          'adapter-anthropic': { currentVersion: '1.0.1', isChanged: true },
          'adapter-claude-agent-sdk': {
            currentVersion: '1.0.0',
            isChanged: true,
            previousVersion: null,
          },
          'adapter-google-genai': {
            currentVersion: '1.0.0',
            isChanged: true,
            previousVersion: null,
          },
          'adapter-openai': { currentVersion: '1.0.1', isChanged: true },
          'adapter-openai-agents-sdk': {
            currentVersion: '1.0.0',
            isChanged: true,
            previousVersion: null,
          },
          'adapter-cloudflare-agents': {
            currentVersion: '1.0.0',
            isChanged: true,
            previousVersion: null,
          },
          'adapter-eve': {
            currentVersion: '1.0.0',
            isChanged: true,
            previousVersion: null,
          },
          'adapter-langchain': {
            currentVersion: '1.0.0',
            isChanged: true,
            previousVersion: null,
          },
          'adapter-vercel-ai-sdk': {
            currentVersion: '1.0.0',
            isChanged: true,
            previousVersion: null,
          },
          cli: { currentVersion: '1.0.1', isChanged: true },
          repository: { currentVersion: '1.1.0', isChanged: true },
          'repository-fs': { currentVersion: '2.0.0', isChanged: true },
          'website-ui': { currentVersion: '1.0.0', isChanged: true, previousVersion: null },
        }),
        publishedVersions: createPublishedVersions({
          'adapter-google-genai': [],
          'adapter-claude-agent-sdk': [],
          'adapter-openai-agents-sdk': [],
          'adapter-cloudflare-agents': [],
          'adapter-eve': [],
          'adapter-langchain': [],
          'adapter-vercel-ai-sdk': [],
          'website-ui': [],
        }),
      }),
    ).toStrictEqual({
      mode: 'trusted',
      previousVersions: {
        'adapter-anthropic': '1.0.0',
        'adapter-claude-agent-sdk': null,
        'adapter-google-genai': null,
        'adapter-openai': '1.0.0',
        'adapter-openai-agents-sdk': null,
        'adapter-cloudflare-agents': null,
        'adapter-eve': null,
        'adapter-langchain': null,
        'adapter-vercel-ai-sdk': null,
        cli: '1.0.0',
        core: null,
        repository: '1.0.0',
        'repository-fs': '1.0.0',
        'website-ui': null,
      },
      projects: [
        'repository',
        'repository-fs',
        'adapter-anthropic',
        'adapter-google-genai',
        'adapter-openai',
        'adapter-openai-agents-sdk',
        'adapter-claude-agent-sdk',
        'adapter-cloudflare-agents',
        'adapter-eve',
        'adapter-langchain',
        'adapter-vercel-ai-sdk',
        'cli',
        'website-ui',
      ],
      trigger: 'automatic',
    });
  });

  test('selects a newly introduced stable package without a predecessor version', () => {
    expect(
      createNpmReleaseWorkflowPlan({
        eventName: 'push',
        mode: '',
        project: '',
        projectChanges: createProjectChanges({
          'adapter-anthropic': {
            currentVersion: '1.0.0',
            isChanged: true,
            previousVersion: null,
          },
        }),
        publishedVersions: createPublishedVersions({ 'adapter-anthropic': [] }),
      }),
    ).toStrictEqual({
      mode: 'trusted',
      previousVersions: NO_PREVIOUS_VERSIONS,
      projects: ['adapter-anthropic'],
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
        publishedVersions: createPublishedVersions(),
      }),
    ).toStrictEqual({
      mode: 'trusted',
      previousVersions: NO_PREVIOUS_VERSIONS,
      projects: [],
      trigger: 'automatic',
    });
  });

  test('selects safe unpublished versions that were not changed by the triggering push', () => {
    expect(
      createNpmReleaseWorkflowPlan({
        eventName: 'push',
        mode: '',
        project: '',
        projectChanges: createProjectChanges({
          'adapter-google-genai': {
            currentVersion: '1.0.2',
            previousVersion: '1.0.2',
          },
          cli: { currentVersion: '3.1.2', previousVersion: '3.1.2' },
          'website-ui': { currentVersion: '1.1.2', previousVersion: '1.1.2' },
        }),
        publishedVersions: createPublishedVersions({
          'adapter-google-genai': ['1.0.0'],
          cli: ['3.0.1', '2.0.0'],
          'website-ui': ['1.0.0', '1.1.2'],
        }),
      }),
    ).toStrictEqual({
      mode: 'trusted',
      previousVersions: {
        'adapter-anthropic': null,
        'adapter-claude-agent-sdk': null,
        'adapter-google-genai': '1.0.0',
        'adapter-openai': null,
        'adapter-openai-agents-sdk': null,
        'adapter-cloudflare-agents': null,
        'adapter-eve': null,
        'adapter-langchain': null,
        'adapter-vercel-ai-sdk': null,
        cli: '3.0.1',
        core: null,
        repository: null,
        'repository-fs': null,
        'website-ui': null,
      },
      projects: ['adapter-google-genai', 'cli'],
      trigger: 'automatic',
    });
  });

  test('selects a changed published version for release tag validation', () => {
    expect(
      createNpmReleaseWorkflowPlan({
        eventName: 'push',
        mode: '',
        project: '',
        projectChanges: createProjectChanges({
          core: {
            currentVersion: '1.1.0',
            isChanged: true,
            previousVersion: '1.0.0',
          },
        }),
        publishedVersions: createPublishedVersions({ core: ['1.0.0', '1.1.0'] }),
      }),
    ).toStrictEqual({
      mode: 'trusted',
      previousVersions: {
        'adapter-anthropic': null,
        'adapter-claude-agent-sdk': null,
        'adapter-google-genai': null,
        'adapter-openai': null,
        'adapter-openai-agents-sdk': null,
        'adapter-cloudflare-agents': null,
        'adapter-eve': null,
        'adapter-langchain': null,
        'adapter-vercel-ai-sdk': null,
        cli: null,
        core: '1.0.0',
        repository: null,
        'repository-fs': null,
        'website-ui': null,
      },
      projects: ['core'],
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
      publishedVersions: createPublishedVersions(),
    });

    expect(createNpmReleaseWorkflowOutputs(plan)).toStrictEqual({
      adapter_anthropic: 'false',
      adapter_anthropic_previous_version: '',
      adapter_claude_agent_sdk: 'false',
      adapter_claude_agent_sdk_previous_version: '',
      adapter_cloudflare_agents: 'false',
      adapter_cloudflare_agents_previous_version: '',
      adapter_eve: 'false',
      adapter_eve_previous_version: '',
      adapter_langchain: 'false',
      adapter_langchain_previous_version: '',
      adapter_google_genai: 'false',
      adapter_google_genai_previous_version: '',
      adapter_openai: 'false',
      adapter_openai_previous_version: '',
      adapter_openai_agents_sdk: 'false',
      adapter_openai_agents_sdk_previous_version: '',
      adapter_vercel_ai_sdk: 'false',
      adapter_vercel_ai_sdk_previous_version: '',
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
      website_ui: 'false',
      website_ui_previous_version: '',
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
        publishedVersions: createPublishedVersions(),
      }),
    ).toThrow('must declare a greater stable package version');
  });

  test.each([
    ['prerelease version', '1.0.0-rc.1'],
    ['noncanonical version', 'v1.0.0'],
  ])('rejects a newly introduced package with a %s', (_description, currentVersion) => {
    expect(() =>
      createNpmReleaseWorkflowPlan({
        eventName: 'push',
        mode: '',
        project: '',
        projectChanges: createProjectChanges({
          'adapter-anthropic': { currentVersion, isChanged: true, previousVersion: null },
        }),
        publishedVersions: createPublishedVersions({ 'adapter-anthropic': [] }),
      }),
    ).toThrow('must declare a greater stable package version');
  });

  test('rejects a repository version lower than the latest published version', () => {
    expect(() =>
      createNpmReleaseWorkflowPlan({
        eventName: 'push',
        mode: '',
        project: '',
        projectChanges: createProjectChanges(),
        publishedVersions: createPublishedVersions({ core: ['1.0.0', '1.1.0'] }),
      }),
    ).toThrow('must not be lower than its latest published version');
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
        publishedVersions: createPublishedVersions(),
        ...override,
      }),
    ).toThrow();
  });
});
