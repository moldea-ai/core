import { readFile } from 'node:fs/promises';

import {
  MOLDEA_CLI_RELEASE_METADATA_PATH,
  RUNTIME_COMPATIBILITY_DOCUMENT_PATH,
  RUNTIME_COMPATIBILITY_SOURCE_PATH,
} from './constants.ts';
import { generateRuntimeCompatibilityMarkdown } from './generator.ts';
import { generateMoldeaCliReleaseMetadataModule } from './release-metadata-generator.ts';
import { loadMoldeaCliReleaseMetadata } from './release-metadata-loader.ts';
import { parseRuntimeCompatibilityMatrix } from './validations.ts';

const repositoryRoot = new URL('../../', import.meta.url);
const sourceUrl = new URL(RUNTIME_COMPATIBILITY_SOURCE_PATH, repositoryRoot);
const documentUrl = new URL(RUNTIME_COMPATIBILITY_DOCUMENT_PATH, repositoryRoot);
const releaseMetadataUrl = new URL(MOLDEA_CLI_RELEASE_METADATA_PATH, repositoryRoot);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });

/** Verifies matrix validity and exact synchronization of every generated artifact. */
const check = async (): Promise<void> => {
  const [sourceBytes, committedDocument, committedReleaseMetadata] = await Promise.all([
    readFile(sourceUrl),
    readFile(documentUrl, 'utf8'),
    readFile(releaseMetadataUrl, 'utf8'),
  ]);
  const source = utf8Decoder.decode(sourceBytes);
  const result = parseRuntimeCompatibilityMatrix(source);

  if (!result.valid) {
    const details = result.issues.map(({ message, path }) => `${path}: ${message}`).join('\n');
    throw new Error(`Runtime compatibility matrix validation failed:\n${details}`);
  }

  const releaseMetadata = await loadMoldeaCliReleaseMetadata(repositoryRoot, result.matrix);
  const [expectedDocument, expectedReleaseMetadata] = await Promise.all([
    generateRuntimeCompatibilityMarkdown(result.matrix),
    generateMoldeaCliReleaseMetadataModule(releaseMetadata),
  ]);

  if (committedDocument !== expectedDocument) {
    throw new Error(
      `${RUNTIME_COMPATIBILITY_DOCUMENT_PATH} is stale. Run pnpm compatibility:generate.`,
    );
  }

  if (committedReleaseMetadata !== expectedReleaseMetadata) {
    throw new Error(
      `${MOLDEA_CLI_RELEASE_METADATA_PATH} is stale. Run pnpm compatibility:generate.`,
    );
  }

  process.stdout.write('Runtime compatibility artifacts are valid and synchronized.\n');
};

await check();
