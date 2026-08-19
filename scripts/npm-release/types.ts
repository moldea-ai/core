// npm release modes supported by the publication workflow
export type INpmReleaseMode = 'bootstrap' | 'trusted';

// public projects currently eligible for npm publication
export type INpmReleaseProject =
  | 'adapter-anthropic'
  | 'adapter-claude-agent-sdk'
  | 'adapter-google-genai'
  | 'adapter-openai'
  | 'adapter-openai-agents-sdk'
  | 'adapter-vercel-ai-sdk'
  | 'cli'
  | 'core'
  | 'repository'
  | 'repository-fs'
  | 'website-ui';

// immutable package identity and artifact naming owned by one project
export interface INpmReleaseProjectConfiguration {
  artifactPrefix: string;
  packageName: string;
  projectDirectory: string;
  tagPrefix: string;
}

// package state compared across one push to the main branch
export interface INpmReleaseProjectChange {
  currentVersion: string;
  isChanged: boolean;
  previousVersion: string | null;
}

// untrusted workflow trigger, package-change, and registry state used to select releases
export interface INpmReleaseWorkflowPlanSources {
  eventName: string;
  mode: string;
  project: string;
  projectChanges: Readonly<Record<INpmReleaseProject, INpmReleaseProjectChange>>;
  publishedVersions: Readonly<Record<INpmReleaseProject, readonly string[]>>;
}

// validated package selection consumed by the publication workflow
export interface INpmReleaseWorkflowPlan {
  mode: INpmReleaseMode;
  previousVersions: Readonly<Record<INpmReleaseProject, string | null>>;
  projects: readonly INpmReleaseProject[];
  trigger: 'automatic' | 'manual';
}

// package manifest fields required at the release boundary
export interface INpmReleaseManifest {
  dependencies: Record<string, string>;
  name: string;
  publishConfig: { access: 'public' };
  repository: {
    directory: string;
    type: 'git';
    url: string;
  };
  version: string;
}

// untrusted workflow and manifest values used to establish a release identity
export interface INpmReleaseIdentitySources {
  commit: string;
  gitRef: string;
  manifest: unknown;
  mode: string;
  project: string;
}

// validated release identity derived before registry and tag inspection
export interface INpmReleaseIdentity {
  artifactName: string;
  commit: string;
  manifest: INpmReleaseManifest;
  mode: INpmReleaseMode;
  project: INpmReleaseProject;
  tag: string;
}

// external state needed to decide whether a release is new, resumable, or complete
export interface INpmReleaseCandidateSources {
  dependencyVersions: Readonly<Record<string, readonly string[]>>;
  identity: INpmReleaseIdentity;
  previousVersion: string | null;
  publishedVersions: readonly string[];
  tagCommit: string | null;
}

// safe actions selected after validating source, registry, artifact, and tag state
export interface INpmReleaseCandidate extends INpmReleaseIdentity {
  releaseState: 'complete' | 'new' | 'resume';
  shouldCreateTag: boolean;
  shouldPublish: boolean;
}

// one deterministic checksum entry for a packed public artifact
export interface INpmReleaseArtifactChecksum {
  fileName: string;
  sha256: string;
}
