import type { IMoldeaCliReleaseMetadata } from './types.js';

/**
 * Recursively freezes trusted generated CLI release metadata.
 * @param metadata The generated JSON-compatible release composition.
 * @returns The same metadata object with its complete object graph frozen.
 */
export const freezeMoldeaCliReleaseMetadata = (
  metadata: IMoldeaCliReleaseMetadata,
): IMoldeaCliReleaseMetadata => {
  const pendingValues: object[] = [metadata];
  const visitedValues = new Set<object>();

  while (pendingValues.length > 0) {
    const currentValue = pendingValues.pop();

    if (currentValue === undefined || visitedValues.has(currentValue)) {
      continue;
    }

    visitedValues.add(currentValue);
    for (const nestedValue of Object.values(currentValue as Readonly<Record<string, unknown>>)) {
      if (typeof nestedValue === 'object' && nestedValue !== null) {
        pendingValues.push(nestedValue);
      }
    }

    Object.freeze(currentValue);
  }

  return metadata;
};
