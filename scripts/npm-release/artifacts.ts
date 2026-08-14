import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { NPM_RELEASE_CHECKSUM_FILE_NAME, NPM_RELEASE_PROJECTS } from './constants.ts';
import type { INpmReleaseArtifactChecksum } from './types.ts';
import { createNpmReleaseIdentity } from './validations.ts';

const compareExactStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const requireArtifactNames = (
  actualNames: readonly string[],
  expectedNames: readonly string[],
): string[] => {
  const actual = [...actualNames].sort(compareExactStrings);
  const expected = [...expectedNames].sort(compareExactStrings);

  if (
    new Set(actual).size !== actual.length ||
    JSON.stringify(actual) !== JSON.stringify(expected)
  ) {
    throw new TypeError('The public package artifact set is inconsistent.');
  }

  return actual;
};

const requireArtifactDirectoryNames = async (
  artifactDirectory: string,
  expectedNames: readonly string[],
): Promise<void> => {
  const entries = await readdir(artifactDirectory, { withFileTypes: true });
  const artifactNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tgz'))
    .map(({ name }) => name);

  requireArtifactNames(artifactNames, expectedNames);
};

/**
 * Creates one deterministic SHA-256 manifest for the exact expected package artifacts.
 * @param artifacts The complete in-memory package artifact set.
 * @param expectedNames The exact allowed package artifact names.
 * @returns The sorted checksum manifest with one final line break.
 * @throws
 * - If the artifact names are missing, duplicated, or unexpected
 */
export const createNpmReleaseChecksumManifest = (
  artifacts: readonly { content: Uint8Array; fileName: string }[],
  expectedNames: readonly string[],
): string => {
  const artifactByName = new Map(artifacts.map((artifact) => [artifact.fileName, artifact]));
  const artifactNames = requireArtifactNames(
    artifacts.map(({ fileName }) => fileName),
    expectedNames,
  );

  return `${artifactNames
    .map((fileName) => {
      const artifact = artifactByName.get(fileName);

      if (artifact === undefined) {
        throw new TypeError(`The ${fileName} package artifact is unavailable.`);
      }

      const checksum = createHash('sha256').update(artifact.content).digest('hex');
      return `${checksum}  ${fileName}`;
    })
    .join('\n')}\n`;
};

/**
 * Writes the checksum manifest for package tarballs produced by one CI build.
 * @param artifactDirectory The directory containing only the expected package tarballs.
 * @param expectedNames The exact allowed package artifact names.
 * @returns A promise that resolves after the checksum manifest is written.
 * @throws
 * - If the artifact directory is unreadable or contains an inconsistent tarball set
 */
export const writeNpmReleaseChecksumManifest = async (
  artifactDirectory: string,
  expectedNames: readonly string[],
): Promise<void> => {
  await requireArtifactDirectoryNames(artifactDirectory, expectedNames);

  const artifacts = await Promise.all(
    expectedNames.map(async (fileName) => ({
      content: await readFile(path.join(artifactDirectory, fileName)),
      fileName,
    })),
  );
  const manifest = createNpmReleaseChecksumManifest(artifacts, expectedNames);

  await writeFile(path.join(artifactDirectory, NPM_RELEASE_CHECKSUM_FILE_NAME), manifest, 'utf8');
};

/**
 * Verifies package tarballs against the recorded artifact checksum manifest.
 * @param artifactDirectory The downloaded package artifact directory.
 * @param expectedNames The exact allowed package artifact names.
 * @returns A promise that resolves when every artifact and checksum is valid.
 * @throws
 * - If the artifact set or checksum manifest is unavailable or inconsistent
 */
export const verifyNpmReleaseChecksumManifest = async (
  artifactDirectory: string,
  expectedNames: readonly string[],
): Promise<void> => {
  await requireArtifactDirectoryNames(artifactDirectory, expectedNames);

  const [recordedManifest, ...artifactContents] = await Promise.all([
    readFile(path.join(artifactDirectory, NPM_RELEASE_CHECKSUM_FILE_NAME), 'utf8'),
    ...expectedNames.map((fileName) => readFile(path.join(artifactDirectory, fileName))),
  ]);
  const expectedManifest = createNpmReleaseChecksumManifest(
    expectedNames.map((fileName, index) => {
      const content = artifactContents[index];

      if (content === undefined) {
        throw new TypeError(`The ${fileName} package artifact is unavailable.`);
      }

      return { content, fileName };
    }),
    expectedNames,
  );

  if (recordedManifest !== expectedManifest) {
    throw new TypeError('The public package artifact checksum manifest is invalid.');
  }
};

/**
 * Produces structured checksums for release summaries and audit output.
 * @param manifest The complete checksum-manifest text.
 * @returns The checksum records in manifest order.
 * @throws
 * - If the manifest is empty, malformed, unterminated, or contains an unsafe path
 */
export const parseNpmReleaseChecksumManifest = (
  manifest: string,
): INpmReleaseArtifactChecksum[] => {
  if (!manifest.endsWith('\n') || manifest === '\n') {
    throw new TypeError('The public package artifact checksum manifest is invalid.');
  }

  const lines = manifest.slice(0, -1).split('\n');

  return lines.map((line) => {
    const match = /^(?<sha256>[0-9a-f]{64}) {2}(?<fileName>[^/\\]+\.tgz)$/u.exec(line);

    if (match?.groups === undefined) {
      throw new TypeError('The public package artifact checksum manifest is invalid.');
    }

    return {
      fileName: match.groups['fileName'] ?? '',
      sha256: match.groups['sha256'] ?? '',
    };
  });
};

/**
 * Loads canonical package manifests and derives the complete expected artifact set.
 * @param repositoryRoot The repository root containing the public project manifests.
 * @returns A promise that resolves to the expected tarball names.
 * @throws
 * - If a public package manifest is missing or invalid
 */
export const loadNpmReleaseArtifactNames = async (repositoryRoot: URL): Promise<string[]> =>
  Promise.all(
    Object.entries(NPM_RELEASE_PROJECTS).map(async ([project, configuration]) => {
      const manifest = JSON.parse(
        await readFile(
          new URL(`${configuration.projectDirectory}/package.json`, repositoryRoot),
          'utf8',
        ),
      ) as unknown;

      return createNpmReleaseIdentity({
        commit: '0'.repeat(40),
        gitRef: 'refs/heads/main',
        manifest,
        mode: 'bootstrap',
        project,
      }).artifactName;
    }),
  );
