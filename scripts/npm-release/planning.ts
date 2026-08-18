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
  'adapter-openai': null,
  cli: null,
  core: null,
  repository: null,
  'repository-fs': null,
  'website-ui': null,
}) satisfies Readonly<Record<INpmReleaseProject, null>>;

const requireStableReleaseVersion = (
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

/** Binds selected automatic releases to their preceding main versions. */
const createPreviousVersions = (
  sources: INpmReleaseWorkflowPlanSources,
  projects: readonly INpmReleaseProject[],
): INpmReleaseWorkflowPlan['previousVersions'] => {
  const selectedProjects = new Set(projects);

  return Object.freeze(
    Object.fromEntries(
      NPM_RELEASE_PROJECT_ORDER.map((project) => [
        project,
        selectedProjects.has(project) ? sources.projectChanges[project].previousVersion : null,
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
    adapter_openai: String(selectedProjects.has('adapter-openai')),
    adapter_openai_previous_version: plan.previousVersions['adapter-openai'] ?? '',
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

  const projects = NPM_RELEASE_PROJECT_ORDER.filter((project) => {
    const change = sources.projectChanges[project];

    if (!change.isChanged) {
      return false;
    }

    requireStableReleaseVersion(project, change.previousVersion, change.currentVersion);
    return true;
  });

  return {
    mode: 'trusted',
    previousVersions: createPreviousVersions(sources, projects),
    projects,
    trigger: 'automatic',
  };
};
