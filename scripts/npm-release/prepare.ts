import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  loadNpmReleaseArtifactNames,
  parseNpmReleaseChecksumManifest,
  verifyNpmReleaseChecksumManifest,
} from './artifacts.ts';
import { NPM_RELEASE_CHECKSUM_FILE_NAME, NPM_RELEASE_PROJECTS } from './constants.ts';
import { loadGitTagCommit } from './git.ts';
import { loadNpmRegistryVersions } from './registry.ts';
import { createNpmReleaseCandidate, createNpmReleaseIdentity } from './validations.ts';

const repositoryRoot = new URL('../../', import.meta.url);
const [project, mode, artifactDirectoryValue, previousVersionValue] = process.argv.slice(2);
const gitRef = process.env['GITHUB_REF'];
const commit = process.env['GITHUB_SHA'];
const githubOutputPath = process.env['GITHUB_OUTPUT'];

if (
  project === undefined ||
  mode === undefined ||
  artifactDirectoryValue === undefined ||
  previousVersionValue === undefined ||
  process.argv.length !== 6 ||
  gitRef === undefined ||
  commit === undefined ||
  githubOutputPath === undefined
) {
  throw new TypeError(
    'The npm release preparation command requires project, mode, artifact directory, previous version, and GitHub workflow context.',
  );
}

const projectConfiguration = Object.hasOwn(NPM_RELEASE_PROJECTS, project)
  ? NPM_RELEASE_PROJECTS[project as keyof typeof NPM_RELEASE_PROJECTS]
  : undefined;

if (projectConfiguration === undefined) {
  throw new TypeError(`The ${project} project is not eligible for npm release.`);
}

const manifest = JSON.parse(
  await readFile(
    new URL(`${projectConfiguration.projectDirectory}/package.json`, repositoryRoot),
    'utf8',
  ),
) as unknown;
const identity = createNpmReleaseIdentity({ commit, gitRef, manifest, mode, project });
const artifactDirectory = path.resolve(artifactDirectoryValue);
const expectedArtifactNames = await loadNpmReleaseArtifactNames(repositoryRoot);

await verifyNpmReleaseChecksumManifest(artifactDirectory, expectedArtifactNames);

if (!expectedArtifactNames.includes(identity.artifactName)) {
  throw new TypeError(`The ${identity.artifactName} release artifact is unavailable.`);
}

const moldeaDependencyNames = Object.keys(identity.manifest.dependencies).filter((packageName) =>
  packageName.startsWith('@moldea.ai/'),
);
const [publishedVersions, dependencyVersionEntries] = await Promise.all([
  loadNpmRegistryVersions(identity.manifest.name),
  Promise.all(
    moldeaDependencyNames.map(
      async (packageName) => [packageName, await loadNpmRegistryVersions(packageName)] as const,
    ),
  ),
]);
const candidate = createNpmReleaseCandidate({
  dependencyVersions: Object.fromEntries(dependencyVersionEntries),
  identity,
  previousVersion: previousVersionValue === '' ? null : previousVersionValue,
  publishedVersions,
  tagCommit: loadGitTagCommit(identity.tag),
});
const checksums = parseNpmReleaseChecksumManifest(
  await readFile(path.join(artifactDirectory, NPM_RELEASE_CHECKSUM_FILE_NAME), 'utf8'),
);
const checksum = checksums.find(({ fileName }) => fileName === candidate.artifactName)?.sha256;

if (checksum === undefined) {
  throw new TypeError(`The ${candidate.artifactName} release checksum is unavailable.`);
}

const outputs = {
  artifact_name: candidate.artifactName,
  checksum,
  package_name: candidate.manifest.name,
  package_version: candidate.manifest.version,
  project: candidate.project,
  release_state: candidate.releaseState,
  should_create_tag: String(candidate.shouldCreateTag),
  should_publish: String(candidate.shouldPublish),
  tag: candidate.tag,
};

await appendFile(
  githubOutputPath,
  `${Object.entries(outputs)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')}\n`,
  'utf8',
);
process.stdout.write(`${JSON.stringify(outputs, null, 2)}\n`);
