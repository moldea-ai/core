import { appendFile } from 'node:fs/promises';

import { NPM_RELEASE_GITHUB_REF } from './constants.ts';
import { createNpmReleaseWorkflowOutputs, createNpmReleaseWorkflowPlan } from './planning.ts';
import { loadNpmReleaseProjectChanges } from './project-changes.ts';

const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const repositoryRoot = new URL('../../', import.meta.url);
const [project = '', mode = '', baseCommit = ''] = process.argv.slice(2);
const eventName = process.env['GITHUB_EVENT_NAME'];
const gitRef = process.env['GITHUB_REF'];
const commit = process.env['GITHUB_SHA'];
const githubOutputPath = process.env['GITHUB_OUTPUT'];

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
const plan = createNpmReleaseWorkflowPlan({
  eventName,
  mode,
  project,
  projectChanges,
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
