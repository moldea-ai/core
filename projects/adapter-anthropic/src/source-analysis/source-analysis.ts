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
  IAnthropicExportState,
  IAnthropicSourceAnalysis,
  IAnthropicSourceAnalysisResult,
} from '../contracts/index.js';

export const ANTHROPIC_SOURCE_CONFIG = Object.freeze({
  importConfig: Object.freeze({
    namedConstructorImports: Object.freeze(['Anthropic']),
    packageName: '@anthropic-ai/sdk',
    supportsDefaultConstructorImport: true,
  }),
  requestConfig: Object.freeze({
    acceptedArgumentCounts: Object.freeze([1, 2]),
    methodName: 'create',
    relationshipNames: Object.freeze(['system', 'tools']),
    resourceName: 'messages',
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
export const analyzeAnthropicSource = (
  path: IRepositoryPath,
  bytes: Uint8Array,
  signal?: AbortSignal,
): IAnthropicSourceAnalysisResult => {
  const result = analyzeSource(path, bytes, ANTHROPIC_SOURCE_CONFIG, signal);

  if (result.kind !== 'valid') {
    return result;
  }

  return Object.freeze({
    analysis: Object.freeze({
      ...result.analysis,
      anthropicConstructorNames: result.analysis.constructorNames,
      path,
    }),
    kind: 'valid',
  });
};

/** Determines whether a bound path uses a supported TypeScript source extension. */
export const isSupportedAnthropicSourcePath = (path: IRepositoryPath): boolean =>
  isSupportedTypeScriptSourcePath(path);

/** Classifies a direct exported runtime-agent function and exposes its body. */
export const getAnthropicRuntimeExport = (
  analysis: IAnthropicSourceAnalysis,
  symbol: string,
): IAnthropicExportState & { readonly body?: ts.ConciseBody } => getRuntimeExport(analysis, symbol);

/** Classifies a directly exported callable value such as an instruction loader. */
export const getAnthropicCallableExportState = (
  analysis: IAnthropicSourceAnalysis,
  symbol: string,
): IAnthropicExportState => getCallableExportState(analysis, symbol);

/** Classifies a directly exported constant and returns its static initializer. */
export const getAnthropicConstExport = (
  analysis: IAnthropicSourceAnalysis,
  symbol: string,
): IAnthropicExportState & { readonly expression?: ts.Expression } =>
  getConstExport(analysis, symbol);
