import { selectChangedNpmReleaseProjects } from './planning.ts';
import { loadNpmReleaseProjectChanges } from './project-changes.ts';

const repositoryRoot = new URL('../../', import.meta.url);
const [baseCommit, currentCommit] = process.argv.slice(2);

if (baseCommit === undefined || currentCommit === undefined || process.argv.length !== 4) {
  throw new TypeError('The npm release change check requires exact base and current Git commits.');
}

const projectChanges = await loadNpmReleaseProjectChanges(
  repositoryRoot,
  baseCommit,
  currentCommit,
);
const projects = selectChangedNpmReleaseProjects(projectChanges);

process.stdout.write(`${JSON.stringify({ projects }, null, 2)}\n`);
