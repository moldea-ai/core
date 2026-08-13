import { format } from 'prettier';

import type { IMoldeaCliGeneratedReleaseMetadata } from './types.ts';
import { compareExactStrings, isRecord } from './utilities.ts';

/** Recursively orders generated object properties by exact Unicode code point. */
const normalizeGeneratedObjectOrder = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeGeneratedObjectOrder);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([leftKey], [rightKey]) => compareExactStrings(leftKey, rightKey))
      .map(([key, nestedValue]) => [key, normalizeGeneratedObjectOrder(nestedValue)]),
  );
};

/**
 * Generates the deterministic immutable TypeScript module bundled by the CLI.
 * @param metadata The validated release composition to serialize.
 * @returns A promise resolving to formatted TypeScript source with a trailing LF.
 */
export const generateMoldeaCliReleaseMetadataModule = async (
  metadata: IMoldeaCliGeneratedReleaseMetadata,
): Promise<string> => {
  const source = `/*
 * Generated file. Do not edit directly.
 * Canonical sources:
 * - /compatibility/runtimes.yaml
 * - /projects/<project>/package.json
 * - /projects/core/src/constants/index.ts
 * - /projects/cli/src/core-composition/constants.ts
 * - /projects/cli/src/git-version/constants.ts
 * - /projects/cli/src/json-output-contract/index.ts
 */
import type { IMoldeaCliReleaseMetadata } from './types.js';
import { freezeMoldeaCliReleaseMetadata } from './utilities.js';

// immutable compatibility and package composition bundled into this CLI release
export const MOLDEA_CLI_RELEASE_METADATA = freezeMoldeaCliReleaseMetadata(
  ${JSON.stringify(normalizeGeneratedObjectOrder(metadata), null, 2)} satisfies IMoldeaCliReleaseMetadata,
);
`;

  return format(source, {
    endOfLine: 'lf',
    parser: 'typescript',
    printWidth: 100,
    singleQuote: true,
    trailingComma: 'all',
  });
};
