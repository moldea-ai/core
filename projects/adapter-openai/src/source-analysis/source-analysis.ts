import type ts from 'typescript';

import {
  analyzeSource,
  getCallableExportState,
  getConstExport,
  getRuntimeExport,
  isSupportedTypeScriptSourcePath,
} from '@moldea.ai/adapter-static-analysis';

import type { IRepositoryPath } from '@moldea.ai/repository';

import type {
  IOpenAiExportState,
  IOpenAiSourceAnalysis,
  IOpenAiSourceAnalysisResult,
} from '../contracts/index.js';

export const OPENAI_SOURCE_CONFIG = Object.freeze({
  importConfig: Object.freeze({
    namedConstructorImports: Object.freeze([]),
    packageName: 'openai',
    supportsDefaultConstructorImport: true,
  }),
  requestConfig: Object.freeze({
    acceptedArgumentCounts: Object.freeze([1]),
    methodName: 'create',
    relationshipNames: Object.freeze(['instructions', 'tools']),
    resourceName: 'responses',
    toolRelationshipName: 'tools',
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
export const analyzeOpenAiSource = (
  path: IRepositoryPath,
  bytes: Uint8Array,
  signal?: AbortSignal,
): IOpenAiSourceAnalysisResult => {
  const result = analyzeSource(path, bytes, OPENAI_SOURCE_CONFIG, signal);

  if (result.kind !== 'valid') {
    return result;
  }

  return Object.freeze({
    analysis: Object.freeze({
      ...result.analysis,
      openAiConstructorNames: result.analysis.constructorNames,
      path,
    }),
    kind: 'valid',
  });
};

/** Determines whether a bound path uses a supported TypeScript source extension. */
export const isSupportedOpenAiSourcePath = (path: IRepositoryPath): boolean =>
  isSupportedTypeScriptSourcePath(path);

/** Classifies a direct exported runtime-agent function and exposes its body. */
export const getOpenAiRuntimeExport = (
  analysis: IOpenAiSourceAnalysis,
  symbol: string,
): IOpenAiExportState & { readonly body?: ts.ConciseBody } => getRuntimeExport(analysis, symbol);

/** Classifies a directly exported callable value such as an instruction loader. */
export const getOpenAiCallableExportState = (
  analysis: IOpenAiSourceAnalysis,
  symbol: string,
): IOpenAiExportState => getCallableExportState(analysis, symbol);

/** Classifies a directly exported constant and returns its static initializer. */
export const getOpenAiConstExport = (
  analysis: IOpenAiSourceAnalysis,
  symbol: string,
): IOpenAiExportState & { readonly expression?: ts.Expression } => getConstExport(analysis, symbol);
