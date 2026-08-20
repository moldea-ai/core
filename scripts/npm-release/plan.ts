import { appendFile } from 'node:fs/promises';

import {
  NPM_RELEASE_GITHUB_REF,
  NPM_RELEASE_PROJECT_ORDER,
  NPM_RELEASE_PROJECTS,
} from './constants.ts';
import { createNpmReleaseWorkflowOutputs, createNpmReleaseWorkflowPlan } from './planning.ts';
import { loadNpmReleaseProjectChanges } from './project-changes.ts';
import { loadNpmRegistryVersions } from './registry.ts';
import type { INpmReleaseWorkflowPlanSources } from './types.ts';

const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const repositoryRoot = new URL('../../', import.meta.url);
const [project = '', mode = '', baseCommit = ''] = process.argv.slice(2);
const eventName = process.env['GITHUB_EVENT_NAME'];
const gitRef = process.env['GITHUB_REF'];
const commit = process.env['GITHUB_SHA'];
const githubOutputPath = process.env['GITHUB_OUTPUT'];

/**
 * Loads current registry state for automatic recovery without contacting npm during manual planning.
 * @returns The published versions keyed by public project.
 */
const loadPublishedVersions = async (): Promise<
  INpmReleaseWorkflowPlanSources['publishedVersions']
> =>
  Object.fromEntries(
    await Promise.all(
      NPM_RELEASE_PROJECT_ORDER.map(async (releaseProject) => [
        releaseProject,
        await loadNpmRegistryVersions(NPM_RELEASE_PROJECTS[releaseProject].packageName),
      ]),
    ),
  ) as INpmReleaseWorkflowPlanSources['publishedVersions'];

const createEmptyPublishedVersions = (): INpmReleaseWorkflowPlanSources['publishedVersions'] => ({
  'adapter-anthropic': [],
  'adapter-claude-agent-sdk': [],
  'adapter-google-genai': [],
  'adapter-openai': [],
  'adapter-openai-agents-sdk': [],
  'adapter-cloudflare-agents': [],
  'adapter-eve': [],
  'adapter-langchain': [],
  'adapter-vercel-ai-sdk': [],
  cli: [],
  core: [],
  repository: [],
  'repository-fs': [],
  'website-ui': [],
});

if (
  eventName === undefined ||
  gitRef !== NPM_RELEASE_GITHUB_REF ||
  commit === undefined ||
  !COMMIT_PATTERN.test(commit) ||
  githubOutputPath === undefined ||
  process.argv.length !== 5
) {
  throw new TypeError('The npm release planning command requires valid GitHub workflow context.');
}

const projectChanges = await loadNpmReleaseProjectChanges(
  repositoryRoot,
  eventName === 'push' ? baseCommit : null,
  eventName === 'push' ? commit : null,
);
const publishedVersions =
  eventName === 'push' ? await loadPublishedVersions() : createEmptyPublishedVersions();
const plan = createNpmReleaseWorkflowPlan({
  eventName,
  mode,
  project,
  projectChanges,
  publishedVersions,
});
const outputs = createNpmReleaseWorkflowOutputs(plan);

await appendFile(
  githubOutputPath,
  `${Object.entries(outputs)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')}\n`,
  'utf8',
);
process.stdout.write(`${JSON.stringify({ ...outputs, trigger: plan.trigger }, null, 2)}\n`);
