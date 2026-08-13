import { readFile, writeFile } from 'node:fs/promises';

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

/** Validates canonical release sources and writes every deterministic derived artifact. */
const generate = async (): Promise<void> => {
  const source = utf8Decoder.decode(await readFile(sourceUrl));
  const result = parseRuntimeCompatibilityMatrix(source);

  if (!result.valid) {
    const details = result.issues.map(({ message, path }) => `${path}: ${message}`).join('\n');
    throw new Error(`Runtime compatibility matrix validation failed:\n${details}`);
  }

  const releaseMetadata = await loadMoldeaCliReleaseMetadata(repositoryRoot, result.matrix);
  const [document, releaseMetadataModule] = await Promise.all([
    generateRuntimeCompatibilityMarkdown(result.matrix),
    generateMoldeaCliReleaseMetadataModule(releaseMetadata),
  ]);

  await Promise.all([
    writeFile(documentUrl, document, 'utf8'),
    writeFile(releaseMetadataUrl, releaseMetadataModule, 'utf8'),
  ]);
  process.stdout.write(
    `Generated ${RUNTIME_COMPATIBILITY_DOCUMENT_PATH} and ${MOLDEA_CLI_RELEASE_METADATA_PATH}.\n`,
  );
};

await generate();
