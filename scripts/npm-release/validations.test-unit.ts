// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type {
  INpmReleaseCandidateSources,
  INpmReleaseIdentity,
  INpmReleaseIdentitySources,
  INpmReleaseProject,
} from './types.ts';
import { createNpmReleaseCandidate, createNpmReleaseIdentity } from './validations.ts';

const COMMIT = 'a'.repeat(40);

const createManifest = (project: INpmReleaseProject): Record<string, unknown> => {
  const packageName = `@moldea.ai/${project}`;

  return {
    dependencies:
      project === 'repository'
        ? { 'error-message-utils': '1.2.11' }
        : project === 'website-ui'
          ? {
              '@fontsource-variable/ubuntu-sans': '5.2.10',
              '@lucide/astro': '1.31.0',
              'error-message-utils': '1.2.11',
            }
          : project === 'cli'
            ? {
                '@moldea.ai/adapter-anthropic': 'workspace:1.0.0',
                '@moldea.ai/adapter-google-genai': 'workspace:1.0.0',
                '@moldea.ai/adapter-openai': 'workspace:1.0.0',
                '@moldea.ai/core': 'workspace:1.0.0',
                '@moldea.ai/repository': 'workspace:1.0.0',
                '@moldea.ai/repository-fs': 'workspace:1.0.0',
              }
            : project === 'adapter-anthropic' ||
                project === 'adapter-google-genai' ||
                project === 'adapter-openai'
              ? {
                  '@moldea.ai/core': 'workspace:^1.0.0',
                  '@moldea.ai/repository': 'workspace:^1.0.0',
                }
              : { '@moldea.ai/repository': 'workspace:^1.0.0' },
    name: packageName,
    publishConfig: { access: 'public' },
    repository: {
      directory: `projects/${project}`,
      type: 'git',
      url: 'git+https://github.com/moldea-ai/packages.git',
    },
    version: '1.0.0',
  };
};

const createIdentitySources = (
  project: INpmReleaseProject = 'repository',
): INpmReleaseIdentitySources => ({
  commit: COMMIT,
  gitRef: 'refs/heads/main',
  manifest: createManifest(project),
  mode: 'trusted',
  project,
});

const createCandidateSources = (
  identity: INpmReleaseIdentity = createNpmReleaseIdentity(createIdentitySources()),
): INpmReleaseCandidateSources => ({
  dependencyVersions: {},
  identity,
  previousVersion: null,
  publishedVersions: [],
  tagCommit: null,
});

describe('npm release validation', () => {
  test.each([
    ['repository', 'moldea.ai-repository-1.0.0.tgz', 'repository-v1.0.0'],
    ['repository-fs', 'moldea.ai-repository-fs-1.0.0.tgz', 'repository-fs-v1.0.0'],
    ['core', 'moldea.ai-core-1.0.0.tgz', 'core-v1.0.0'],
    ['adapter-anthropic', 'moldea.ai-adapter-anthropic-1.0.0.tgz', 'adapter-anthropic-v1.0.0'],
    [
      'adapter-google-genai',
      'moldea.ai-adapter-google-genai-1.0.0.tgz',
      'adapter-google-genai-v1.0.0',
    ],
    ['adapter-openai', 'moldea.ai-adapter-openai-1.0.0.tgz', 'adapter-openai-v1.0.0'],
    ['cli', 'moldea.ai-cli-1.0.0.tgz', 'cli-v1.0.0'],
    ['website-ui', 'moldea.ai-website-ui-1.0.0.tgz', 'website-ui-v1.0.0'],
  ] as const)('createNpmReleaseIdentity(%s) -> %s and %s', (project, artifactName, tag) => {
    const identity = createNpmReleaseIdentity(createIdentitySources(project));

    expect(identity).toMatchObject({ artifactName, project, tag });
  });

  test.each([
    ['unknown project', { project: 'unknown' }, 'not eligible'],
    ['unknown mode', { mode: 'automatic' }, 'mode is invalid'],
    ['non-main ref', { gitRef: 'refs/heads/1.0.0' }, 'main branch'],
    ['abbreviated commit', { commit: 'abc123' }, 'commit is invalid'],
  ])('rejects an %s', (_description, override, expectedMessage) => {
    expect(() => createNpmReleaseIdentity({ ...createIdentitySources(), ...override })).toThrow(
      expectedMessage,
    );
  });

  test.each([
    ['prerelease version', { version: '1.0.1-rc.1' }],
    ['noncanonical version', { version: 'v1.0.0' }],
    ['private manifest', { private: true }],
    ['wrong package', { name: '@moldea.ai/core' }],
    [
      'wrong repository',
      {
        repository: {
          directory: 'projects/repository',
          type: 'git',
          url: 'git+https://example.com/packages.git',
        },
      },
    ],
    ['private access', { publishConfig: { access: 'restricted' } }],
  ])('rejects a manifest with %s', (_description, override) => {
    expect(() =>
      createNpmReleaseIdentity({
        ...createIdentitySources(),
        manifest: { ...createManifest('repository'), ...override },
      }),
    ).toThrow('release metadata is invalid');
  });

  test('creates a new trusted release action', () => {
    expect(createNpmReleaseCandidate(createCandidateSources())).toMatchObject({
      releaseState: 'new',
      shouldCreateTag: true,
      shouldPublish: true,
    });
  });

  test('creates a new bootstrap action without publishing', () => {
    const identity = createNpmReleaseIdentity({
      ...createIdentitySources(),
      mode: 'bootstrap',
    });

    expect(createNpmReleaseCandidate(createCandidateSources(identity))).toMatchObject({
      releaseState: 'new',
      shouldCreateTag: true,
      shouldPublish: false,
    });
  });

  test('resumes trusted publication from a matching existing tag', () => {
    expect(
      createNpmReleaseCandidate({ ...createCandidateSources(), tagCommit: COMMIT }),
    ).toMatchObject({
      releaseState: 'resume',
      shouldCreateTag: false,
      shouldPublish: true,
    });
  });

  test('recognizes an already complete release', () => {
    expect(
      createNpmReleaseCandidate({
        ...createCandidateSources(),
        publishedVersions: ['1.0.0'],
        tagCommit: COMMIT,
      }),
    ).toMatchObject({
      releaseState: 'complete',
      shouldCreateTag: false,
      shouldPublish: false,
    });
  });

  test('requires the preceding main version before an automatic release advances', () => {
    const identity = createNpmReleaseIdentity({
      ...createIdentitySources(),
      manifest: { ...createManifest('repository'), version: '1.0.1' },
    });
    const sources = {
      ...createCandidateSources(identity),
      previousVersion: '1.0.0',
    };

    expect(() => createNpmReleaseCandidate(sources)).toThrow(
      '@moldea.ai/repository@1.0.0 must be published first',
    );
    expect(createNpmReleaseCandidate({ ...sources, publishedVersions: ['1.0.0'] })).toMatchObject({
      releaseState: 'new',
      shouldPublish: true,
    });
  });

  test('rejects an unpublished candidate below a registry version', () => {
    expect(() =>
      createNpmReleaseCandidate({
        ...createCandidateSources(),
        publishedVersions: ['1.0.1'],
      }),
    ).toThrow('@moldea.ai/repository@1.0.0 is older than a published version');
  });

  test.each(['1.0.0', '1.0.1-rc.1', 'v0.9.0'])(
    'rejects the invalid previous version %s',
    (previousVersion) => {
      expect(() =>
        createNpmReleaseCandidate({
          ...createCandidateSources(),
          previousVersion,
        }),
      ).toThrow('previous @moldea.ai/repository version is invalid');
    },
  );

  test('rejects a tag owned by another commit', () => {
    expect(() =>
      createNpmReleaseCandidate({
        ...createCandidateSources(),
        tagCommit: 'b'.repeat(40),
      }),
    ).toThrow('already targets another commit');
  });

  test('rejects a published version without its release tag', () => {
    expect(() =>
      createNpmReleaseCandidate({
        ...createCandidateSources(),
        publishedVersions: ['1.0.0'],
      }),
    ).toThrow('published without its release tag');
  });

  test('requires every moldea dependency to be published at a compatible version', () => {
    const identity = createNpmReleaseIdentity(createIdentitySources('core'));

    expect(() => createNpmReleaseCandidate(createCandidateSources(identity))).toThrow(
      'release dependency is not satisfied',
    );
    expect(
      createNpmReleaseCandidate({
        ...createCandidateSources(identity),
        dependencyVersions: { '@moldea.ai/repository': ['0.0.1', '1.0.0'] },
      }),
    ).toMatchObject({ releaseState: 'new', shouldPublish: true });
  });

  test('rejects a moldea source dependency outside the workspace protocol', () => {
    const manifest = createManifest('core');
    manifest['dependencies'] = { '@moldea.ai/repository': '^1.0.0' };
    const identity = createNpmReleaseIdentity({ ...createIdentitySources('core'), manifest });

    expect(() => createNpmReleaseCandidate(createCandidateSources(identity))).toThrow(
      'must use the workspace protocol',
    );
  });
});
