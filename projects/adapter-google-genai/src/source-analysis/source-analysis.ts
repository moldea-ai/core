import { analyzeSource } from '@moldea.ai/adapter-static-analysis';

import type { IRepositoryPath } from '@moldea.ai/repository';

import type { IGoogleGenAiSourceAnalysisResult } from '../contracts/index.js';

export const GOOGLE_GENAI_SOURCE_CONFIG = Object.freeze({
  importConfig: Object.freeze({
    namedConstructorImports: Object.freeze(['GoogleGenAI']),
    packageName: '@google/genai',
    supportsDefaultConstructorImport: false,
  }),
  requestConfig: Object.freeze({
    acceptedArgumentCounts: Object.freeze([1]),
    methodName: 'generateContent',
    relationshipNames: Object.freeze(['config']),
    resourceName: 'models',
  }),
});

/**
 * Parses and indexes one supported TypeScript source without execution.
 * @param path The normalized logical source path.
 * @param bytes The exact source bytes returned by the repository reader.
 * @param signal The active inspection signal.
 * @returns A source analysis or stable invalid source result.
 * @throws If source analysis is aborted.
 */
export const analyzeGoogleGenAiSource = (
  path: IRepositoryPath,
  bytes: Uint8Array,
  signal?: AbortSignal,
): IGoogleGenAiSourceAnalysisResult => {
  const result = analyzeSource(path, bytes, GOOGLE_GENAI_SOURCE_CONFIG, signal);

  if (result.kind !== 'valid') {
    return result;
  }

  return Object.freeze({
    analysis: Object.freeze({
      ...result.analysis,
      googleGenAiConstructorNames: result.analysis.constructorNames,
      path,
    }),
    kind: 'valid',
  });
};
