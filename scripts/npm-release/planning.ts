import { gt, prerelease, valid } from 'semver';

import { NPM_RELEASE_PROJECT_ORDER } from './constants.ts';
import type {
  INpmReleaseProject,
  INpmReleaseWorkflowPlan,
  INpmReleaseWorkflowPlanSources,
} from './types.ts';
import { isNpmReleaseMode, isNpmReleaseProject } from './validations.ts';

const NO_PREVIOUS_VERSIONS = Object.freeze({
  'adapter-anthropic': null,
  'adapter-claude-agent-sdk': null,
  'adapter-google-genai': null,
  'adapter-openai': null,
  'adapter-openai-agents-sdk': null,
  'adapter-vercel-ai-sdk': null,
  cli: null,
  core: null,
  repository: null,
  'repository-fs': null,
  'website-ui': null,
}) satisfies Readonly<Record<INpmReleaseProject, null>>;

const requireStableReleaseVersion = (project: INpmReleaseProject, currentVersion: string): void => {
  if (valid(currentVersion) !== currentVersion || prerelease(currentVersion) !== null) {
    throw new TypeError(`The ${project} project must declare a canonical stable package version.`);
  }
};

const requireChangedReleaseVersion = (
  project: INpmReleaseProject,
  previousVersion: string | null,
  currentVersion: string,
): void => {
  if (
    valid(currentVersion) !== currentVersion ||
    prerelease(currentVersion) !== null ||
    (previousVersion !== null &&
      (valid(previousVersion) !== previousVersion || !gt(currentVersion, previousVersion)))
  ) {
    throw new TypeError(
      `The changed ${project} project must declare a greater stable package version.`,
    );
  }
};

/** Returns the greatest canonical version currently published for one project. */
const getLatestPublishedVersion = (
  project: INpmReleaseProject,
  publishedVersions: readonly string[],
): string | null => {
  let latestVersion: string | null = null;

  for (const publishedVersion of publishedVersions) {
    if (valid(publishedVersion) !== publishedVersion) {
      throw new TypeError(`The ${project} npm registry versions are invalid.`);
    }

    if (latestVersion === null || gt(publishedVersion, latestVersion)) {
      latestVersion = publishedVersion;
    }
  }

  return latestVersion;
};

/**
 * Selects changed public projects after validating their manifest version progression.
 * @param projectChanges The package state across the exact compared Git commits.
 * @returns The changed projects in dependency order.
 * @throws
 * - If a changed package does not declare a greater canonical stable version
 */
export const selectChangedNpmReleaseProjects = (
  projectChanges: INpmReleaseWorkflowPlanSources['projectChanges'],
): readonly INpmReleaseProject[] =>
  NPM_RELEASE_PROJECT_ORDER.filter((project) => {
    const change = projectChanges[project];

    if (!change.isChanged) {
      return false;
    }

    requireChangedReleaseVersion(project, change.previousVersion, change.currentVersion);
    return true;
  });

/** Binds selected automatic releases to their latest published versions. */
const createPreviousVersions = (
  sources: INpmReleaseWorkflowPlanSources,
  projects: readonly INpmReleaseProject[],
): INpmReleaseWorkflowPlan['previousVersions'] => {
  const selectedProjects = new Set(projects);

  return Object.freeze(
    Object.fromEntries(
      NPM_RELEASE_PROJECT_ORDER.map((project) => [
        project,
        selectedProjects.has(project)
          ? sources.publishedVersions[project].includes(
              sources.projectChanges[project].currentVersion,
            )
            ? sources.projectChanges[project].previousVersion
            : getLatestPublishedVersion(project, sources.publishedVersions[project])
          : null,
      ]),
    ) as Record<INpmReleaseProject, string | null>,
  );
};

/**
 * Creates the string outputs consumed by the coordinated publication workflow.
 * @param plan The validated release plan.
 * @returns The selected-project flags, predecessor versions, and shared release metadata.
 */
export const createNpmReleaseWorkflowOutputs = (plan: INpmReleaseWorkflowPlan) => {
  const selectedProjects = new Set(plan.projects);

  return {
    adapter_anthropic: String(selectedProjects.has('adapter-anthropic')),
    adapter_anthropic_previous_version: plan.previousVersions['adapter-anthropic'] ?? '',
    adapter_claude_agent_sdk: String(selectedProjects.has('adapter-claude-agent-sdk')),
    adapter_claude_agent_sdk_previous_version:
      plan.previousVersions['adapter-claude-agent-sdk'] ?? '',
    adapter_google_genai: String(selectedProjects.has('adapter-google-genai')),
    adapter_google_genai_previous_version: plan.previousVersions['adapter-google-genai'] ?? '',
    adapter_openai: String(selectedProjects.has('adapter-openai')),
    adapter_openai_previous_version: plan.previousVersions['adapter-openai'] ?? '',
    adapter_openai_agents_sdk: String(selectedProjects.has('adapter-openai-agents-sdk')),
    adapter_openai_agents_sdk_previous_version:
      plan.previousVersions['adapter-openai-agents-sdk'] ?? '',
    adapter_vercel_ai_sdk: String(selectedProjects.has('adapter-vercel-ai-sdk')),
    adapter_vercel_ai_sdk_previous_version: plan.previousVersions['adapter-vercel-ai-sdk'] ?? '',
    cli: String(selectedProjects.has('cli')),
    cli_previous_version: plan.previousVersions.cli ?? '',
    core: String(selectedProjects.has('core')),
    core_previous_version: plan.previousVersions.core ?? '',
    has_releases: String(plan.projects.length > 0),
    mode: plan.mode,
    project_key: plan.projects.join('-'),
    projects: JSON.stringify(plan.projects),
    repository: String(selectedProjects.has('repository')),
    repository_previous_version: plan.previousVersions.repository ?? '',
    repository_fs: String(selectedProjects.has('repository-fs')),
    repository_fs_previous_version: plan.previousVersions['repository-fs'] ?? '',
    website_ui: String(selectedProjects.has('website-ui')),
    website_ui_previous_version: plan.previousVersions['website-ui'] ?? '',
  };
};

/**
 * Selects the packages eligible for one manual or automatic release workflow.
 * @param sources The untrusted trigger inputs and per-project Git change state.
 * @returns The validated mode, trigger, predecessor versions, and dependency-ordered projects.
 * @throws
 * - If the trigger is unsupported, manual inputs are invalid, or a changed package version is invalid for its release state
 */
export const createNpmReleaseWorkflowPlan = (
  sources: INpmReleaseWorkflowPlanSources,
): INpmReleaseWorkflowPlan => {
  if (sources.eventName === 'workflow_dispatch') {
    if (!isNpmReleaseProject(sources.project)) {
      throw new TypeError(`The ${sources.project} project is not eligible for npm release.`);
    }

    if (!isNpmReleaseMode(sources.mode)) {
      throw new TypeError(`The ${sources.mode} npm release mode is invalid.`);
    }

    return {
      mode: sources.mode,
      previousVersions: NO_PREVIOUS_VERSIONS,
      projects: [sources.project],
      trigger: 'manual',
    };
  }

  if (sources.eventName !== 'push' || sources.project !== '' || sources.mode !== '') {
    throw new TypeError('The npm release workflow trigger is invalid.');
  }

  selectChangedNpmReleaseProjects(sources.projectChanges);

  const projects = NPM_RELEASE_PROJECT_ORDER.filter((project) => {
    const change = sources.projectChanges[project];
    const publishedVersions = sources.publishedVersions[project];

    requireStableReleaseVersion(project, change.currentVersion);

    const latestPublishedVersion = getLatestPublishedVersion(project, publishedVersions);

    if (latestPublishedVersion !== null && gt(latestPublishedVersion, change.currentVersion)) {
      throw new TypeError(
        `The ${project} project version must not be lower than its latest published version.`,
      );
    }

    return change.isChanged || !publishedVersions.includes(change.currentVersion);
  });

  return {
    mode: 'trusted',
    previousVersions: createPreviousVersions(sources, projects),
    projects,
    trigger: 'automatic',
  };
};
