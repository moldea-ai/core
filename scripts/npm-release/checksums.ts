import path from 'node:path';

import {
  loadNpmReleaseArtifactNames,
  verifyNpmReleaseChecksumManifest,
  writeNpmReleaseChecksumManifest,
} from './artifacts.ts';

const repositoryRoot = new URL('../../', import.meta.url);

const [operation, artifactDirectoryValue] = process.argv.slice(2);

if (
  (operation !== 'create' && operation !== 'verify') ||
  artifactDirectoryValue === undefined ||
  process.argv.length !== 4
) {
  throw new TypeError('Use checksums.ts <create|verify> <artifact-directory>.');
}

const artifactDirectory = path.resolve(artifactDirectoryValue);
const expectedArtifactNames = await loadNpmReleaseArtifactNames(repositoryRoot);

if (operation === 'create') {
  await writeNpmReleaseChecksumManifest(artifactDirectory, expectedArtifactNames);
} else {
  await verifyNpmReleaseChecksumManifest(artifactDirectory, expectedArtifactNames);
}
