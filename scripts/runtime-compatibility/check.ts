import { readFile } from 'node:fs/promises';

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

/** Verifies matrix validity, implementation consistency, and synchronized documentation. */
const check = async (): Promise<void> => {
  const [sourceBytes, committedDocument] = await Promise.all([
    readFile(sourceUrl),
    readFile(documentUrl, 'utf8'),
  ]);
  const source = utf8Decoder.decode(sourceBytes);
  const result = parseRuntimeCompatibilityMatrix(source);

  if (!result.valid) {
    const details = result.issues.map(({ message, path }) => `${path}: ${message}`).join('\n');
    throw new Error(`Runtime compatibility matrix validation failed:\n${details}`);
  }

  await validateMoldeaCliImplementationSources(repositoryRoot, result.matrix);
  const expectedDocument = await generateRuntimeCompatibilityMarkdown(result.matrix);

  if (committedDocument !== expectedDocument) {
    throw new Error(
      `${RUNTIME_COMPATIBILITY_DOCUMENT_PATH} is stale. Run pnpm compatibility:generate.`,
    );
  }

  process.stdout.write('Runtime compatibility sources are valid and synchronized.\n');
};

await check();
