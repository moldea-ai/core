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

// dependency-safe order for coordinated public-package releases
export const NPM_RELEASE_PROJECT_ORDER = [
  'repository',
  'repository-fs',
  'core',
  'adapter-anthropic',
  'adapter-google-genai',
  'adapter-openai',
  'adapter-openai-agents-sdk',
  'adapter-claude-agent-sdk',
  'adapter-cloudflare-agents',
  'adapter-vercel-ai-sdk',
  'cli',
  'website-ui',
] as const satisfies readonly INpmReleaseProject[];

// public package identities currently eligible for release
export const NPM_RELEASE_PROJECTS = {
  'adapter-anthropic': {
    artifactPrefix: 'moldea.ai-adapter-anthropic',
    packageName: '@moldea.ai/adapter-anthropic',
    projectDirectory: 'projects/adapter-anthropic',
    tagPrefix: 'adapter-anthropic-v',
  },
  'adapter-claude-agent-sdk': {
    artifactPrefix: 'moldea.ai-adapter-claude-agent-sdk',
    packageName: '@moldea.ai/adapter-claude-agent-sdk',
    projectDirectory: 'projects/adapter-claude-agent-sdk',
    tagPrefix: 'adapter-claude-agent-sdk-v',
  },
  'adapter-google-genai': {
    artifactPrefix: 'moldea.ai-adapter-google-genai',
    packageName: '@moldea.ai/adapter-google-genai',
    projectDirectory: 'projects/adapter-google-genai',
    tagPrefix: 'adapter-google-genai-v',
  },
  'adapter-openai': {
    artifactPrefix: 'moldea.ai-adapter-openai',
    packageName: '@moldea.ai/adapter-openai',
    projectDirectory: 'projects/adapter-openai',
    tagPrefix: 'adapter-openai-v',
  },
  'adapter-openai-agents-sdk': {
    artifactPrefix: 'moldea.ai-adapter-openai-agents-sdk',
    packageName: '@moldea.ai/adapter-openai-agents-sdk',
    projectDirectory: 'projects/adapter-openai-agents-sdk',
    tagPrefix: 'adapter-openai-agents-sdk-v',
  },
  'adapter-vercel-ai-sdk': {
    artifactPrefix: 'moldea.ai-adapter-vercel-ai-sdk',
    packageName: '@moldea.ai/adapter-vercel-ai-sdk',
    projectDirectory: 'projects/adapter-vercel-ai-sdk',
    tagPrefix: 'adapter-vercel-ai-sdk-v',
  },
  'adapter-cloudflare-agents': {
    artifactPrefix: 'moldea.ai-adapter-cloudflare-agents',
    packageName: '@moldea.ai/adapter-cloudflare-agents',
    projectDirectory: 'projects/adapter-cloudflare-agents',
    tagPrefix: 'adapter-cloudflare-agents-v',
  },
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
  'website-ui': {
    artifactPrefix: 'moldea.ai-website-ui',
    packageName: '@moldea.ai/website-ui',
    projectDirectory: 'projects/website-ui',
    tagPrefix: 'website-ui-v',
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
