import { gt, prerelease, satisfies, valid, validRange } from 'semver';

import {
  NPM_RELEASE_GITHUB_REF,
  NPM_RELEASE_MODES,
  NPM_RELEASE_PROJECTS,
  NPM_RELEASE_REPOSITORY_URL,
} from './constants.ts';
import type {
  INpmReleaseCandidate,
  INpmReleaseCandidateSources,
  INpmReleaseIdentity,
  INpmReleaseIdentitySources,
  INpmReleaseManifest,
  INpmReleaseMode,
  INpmReleaseProject,
} from './types.ts';

const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const MOLDEA_PACKAGE_PREFIX = '@moldea.ai/';
const WORKSPACE_PROTOCOL_PREFIX = 'workspace:';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Checks whether a workflow value names one supported release mode. */
export const isNpmReleaseMode = (value: string): value is INpmReleaseMode =>
  NPM_RELEASE_MODES.some((mode) => mode === value);

/** Checks whether a workflow value names one supported public project. */
export const isNpmReleaseProject = (value: string): value is INpmReleaseProject =>
  Object.hasOwn(NPM_RELEASE_PROJECTS, value);

const requireManifest = (
  manifestValue: unknown,
  project: INpmReleaseProject,
): INpmReleaseManifest => {
  const configuration = NPM_RELEASE_PROJECTS[project];

  if (!isRecord(manifestValue)) {
    throw new TypeError(`The ${configuration.packageName} package manifest is invalid.`);
  }

  const dependenciesValue = manifestValue['dependencies'];
  const publishConfigValue = manifestValue['publishConfig'];
  const repositoryValue = manifestValue['repository'];

  if (
    manifestValue['name'] !== configuration.packageName ||
    typeof manifestValue['version'] !== 'string' ||
    valid(manifestValue['version']) !== manifestValue['version'] ||
    prerelease(manifestValue['version']) !== null ||
    manifestValue['private'] === true ||
    !isRecord(publishConfigValue) ||
    publishConfigValue['access'] !== 'public' ||
    !isRecord(repositoryValue) ||
    repositoryValue['type'] !== 'git' ||
    repositoryValue['url'] !== NPM_RELEASE_REPOSITORY_URL ||
    repositoryValue['directory'] !== configuration.projectDirectory
  ) {
    throw new TypeError(`The ${configuration.packageName} release metadata is invalid.`);
  }

  if (dependenciesValue !== undefined && !isRecord(dependenciesValue)) {
    throw new TypeError(`The ${configuration.packageName} dependencies are invalid.`);
  }

  const dependencies = Object.fromEntries(
    Object.entries(dependenciesValue ?? {}).map(([packageName, dependencyRange]) => {
      if (typeof dependencyRange !== 'string') {
        throw new TypeError(`The ${configuration.packageName} dependencies are invalid.`);
      }

      return [packageName, dependencyRange];
    }),
  );

  return {
    dependencies,
    name: configuration.packageName,
    publishConfig: { access: 'public' },
    repository: {
      directory: configuration.projectDirectory,
      type: 'git',
      url: NPM_RELEASE_REPOSITORY_URL,
    },
    version: manifestValue['version'],
  };
};

/**
 * Validates local workflow inputs and derives one immutable package release identity.
 * @param sources The untrusted workflow context and selected project manifest.
 * @returns The validated package, artifact, commit, mode, and tag identity.
 * @throws
 * - If the workflow context or package release metadata is invalid
 */
export const createNpmReleaseIdentity = (
  sources: INpmReleaseIdentitySources,
): INpmReleaseIdentity => {
  if (!isNpmReleaseProject(sources.project)) {
    throw new TypeError(`The ${sources.project} project is not eligible for npm release.`);
  }

  if (!isNpmReleaseMode(sources.mode)) {
    throw new TypeError(`The ${sources.mode} npm release mode is invalid.`);
  }

  if (sources.gitRef !== NPM_RELEASE_GITHUB_REF) {
    throw new TypeError('Npm releases must run from the main branch.');
  }

  if (!COMMIT_PATTERN.test(sources.commit)) {
    throw new TypeError('The npm release commit is invalid.');
  }

  const configuration = NPM_RELEASE_PROJECTS[sources.project];
  const manifest = requireManifest(sources.manifest, sources.project);

  return {
    artifactName: `${configuration.artifactPrefix}-${manifest.version}.tgz`,
    commit: sources.commit,
    manifest,
    mode: sources.mode,
    project: sources.project,
    tag: `${configuration.tagPrefix}${manifest.version}`,
  };
};

const requirePublishedDependencies = (
  identity: INpmReleaseIdentity,
  dependencyVersions: Readonly<Record<string, readonly string[]>>,
): void => {
  for (const [packageName, sourceRange] of Object.entries(identity.manifest.dependencies)) {
    if (!packageName.startsWith(MOLDEA_PACKAGE_PREFIX)) {
      continue;
    }

    if (!sourceRange.startsWith(WORKSPACE_PROTOCOL_PREFIX)) {
      throw new TypeError(`The ${packageName} release dependency must use the workspace protocol.`);
    }

    const publishedRange = sourceRange.slice(WORKSPACE_PROTOCOL_PREFIX.length);
    const availableVersions = dependencyVersions[packageName];

    if (
      validRange(publishedRange) === null ||
      availableVersions === undefined ||
      !availableVersions.some((version) =>
        satisfies(version, publishedRange, { includePrerelease: false }),
      )
    ) {
      throw new TypeError(
        `The ${packageName} release dependency is not satisfied by the npm registry.`,
      );
    }
  }
};

const requirePublishableVersionSequence = (sources: INpmReleaseCandidateSources): void => {
  const candidateVersion = sources.identity.manifest.version;

  if (
    sources.publishedVersions.some((publishedVersion) => gt(publishedVersion, candidateVersion))
  ) {
    throw new TypeError(
      `${sources.identity.manifest.name}@${candidateVersion} is older than a published version.`,
    );
  }

  if (
    sources.previousVersion !== null &&
    (valid(sources.previousVersion) !== sources.previousVersion ||
      prerelease(sources.previousVersion) !== null ||
      !gt(candidateVersion, sources.previousVersion))
  ) {
    throw new TypeError(`The previous ${sources.identity.manifest.name} version is invalid.`);
  }

  if (
    sources.previousVersion !== null &&
    !sources.publishedVersions.includes(sources.previousVersion)
  ) {
    throw new TypeError(
      `${sources.identity.manifest.name}@${sources.previousVersion} must be published first.`,
    );
  }
};

/**
 * Resolves the only safe action for a validated release and its external state.
 * @param sources The validated identity together with npm and Git tag state.
 * @returns The idempotent tag and publication actions for the release.
 * @throws
 * - If dependencies, release order, registry state, or Git tag state are inconsistent
 */
export const createNpmReleaseCandidate = (
  sources: INpmReleaseCandidateSources,
): INpmReleaseCandidate => {
  const { identity } = sources;
  const isPublished = sources.publishedVersions.includes(identity.manifest.version);

  requirePublishedDependencies(identity, sources.dependencyVersions);

  if (!isPublished) {
    requirePublishableVersionSequence(sources);
  }

  if (sources.tagCommit !== null && sources.tagCommit !== identity.commit) {
    throw new TypeError(`The ${identity.tag} tag already targets another commit.`);
  }

  if (isPublished && sources.tagCommit === null) {
    throw new TypeError(
      `${identity.manifest.name}@${identity.manifest.version} is published without its release tag.`,
    );
  }

  const releaseState = isPublished ? 'complete' : sources.tagCommit === null ? 'new' : 'resume';

  return {
    ...identity,
    releaseState,
    shouldCreateTag: releaseState === 'new',
    shouldPublish: identity.mode === 'trusted' && releaseState !== 'complete',
  };
};
