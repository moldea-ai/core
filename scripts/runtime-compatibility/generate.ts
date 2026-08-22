import { readFile, writeFile } from 'node:fs/promises';

import {
  RUNTIME_COMPATIBILITY_DOCUMENT_PATH,
  RUNTIME_COMPATIBILITY_SOURCE_PATH,
} from './constants.ts';
import { generateRuntimeCompatibilityMarkdown } from './generator.ts';
import { validateMoldeaCliImplementationSources } from './implementation-loader.ts';
import { parseRuntimeCompatibilityMatrix } from './validations.ts';

const repositoryRoot = new URL('../../', import.meta.url);
const sourceUrl = new URL(RUNTIME_COMPATIBILITY_SOURCE_PATH, repositoryRoot);
const documentUrl = new URL(RUNTIME_COMPATIBILITY_DOCUMENT_PATH, repositoryRoot);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });

/** Validates canonical technical sources and writes the matrix documentation artifact. */
const generate = async (): Promise<void> => {
  const source = utf8Decoder.decode(await readFile(sourceUrl));
  const result = parseRuntimeCompatibilityMatrix(source);

  if (!result.valid) {
    const details = result.issues.map(({ message, path }) => `${path}: ${message}`).join('\n');
    throw new Error(`Runtime compatibility matrix validation failed:\n${details}`);
  }

  await validateMoldeaCliImplementationSources(repositoryRoot, result.matrix);
  const document = await generateRuntimeCompatibilityMarkdown(result.matrix);

  await writeFile(documentUrl, document, 'utf8');
  process.stdout.write(`Generated ${RUNTIME_COMPATIBILITY_DOCUMENT_PATH}.\n`);
};

await generate();
