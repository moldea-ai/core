import type {
  INpmReleaseMode,
  INpmReleaseProject,
  INpmReleaseProjectConfiguration,
} from './types.ts';

// release modes exposed by the manual GitHub workflow
export const NPM_RELEASE_MODES = [
  'bootstrap',
  'trusted',
] as const satisfies readonly INpmReleaseMode[];

// public package identities currently eligible for release
export const NPM_RELEASE_PROJECTS = {
  cli: {
    artifactPrefix: 'moldea.ai-cli',
    packageName: '@moldea.ai/cli',
    projectDirectory: 'projects/cli',
    tagPrefix: 'cli-v',
  },
  core: {
    artifactPrefix: 'moldea.ai-core',
    packageName: '@moldea.ai/core',
    projectDirectory: 'projects/core',
    tagPrefix: 'core-v',
  },
  repository: {
    artifactPrefix: 'moldea.ai-repository',
    packageName: '@moldea.ai/repository',
    projectDirectory: 'projects/repository',
    tagPrefix: 'repository-v',
  },
  'repository-fs': {
    artifactPrefix: 'moldea.ai-repository-fs',
    packageName: '@moldea.ai/repository-fs',
    projectDirectory: 'projects/repository-fs',
    tagPrefix: 'repository-fs-v',
  },
} as const satisfies Readonly<Record<INpmReleaseProject, INpmReleaseProjectConfiguration>>;

// immutable repository and release-environment boundaries
export const NPM_RELEASE_ARTIFACT_NAME = 'public-package-tarballs';
export const NPM_RELEASE_CHECKSUM_FILE_NAME = 'SHA256SUMS';
export const NPM_RELEASE_ENVIRONMENT = 'npm-release';
export const NPM_RELEASE_GITHUB_REF = 'refs/heads/main';
export const NPM_RELEASE_GITHUB_REPOSITORY = 'moldea-ai/packages';
export const NPM_RELEASE_REGISTRY_URL = 'https://registry.npmjs.org/';
export const NPM_RELEASE_REPOSITORY_URL = 'git+https://github.com/moldea-ai/packages.git';
