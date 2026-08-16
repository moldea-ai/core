import type ts from 'typescript';

import {
  indexImports,
  indexLocalBindingNames,
  indexModuleDeclarations,
  isBoundIdentifier,
  isModuleBindingVisible,
  resolveImportCandidatePaths,
} from '@moldea.ai/adapter-static-analysis';

import type { IRepositoryReference } from '@moldea.ai/core/format';
import type { IRepositoryPath } from '@moldea.ai/repository';

import type {
  IOpenAiExportState,
  IOpenAiModuleArray,
  IOpenAiNamedImport,
  IOpenAiSourceAnalysis,
} from '../contracts/index.js';

const OPENAI_IMPORT_CONFIG = Object.freeze({
  namedConstructorImports: Object.freeze([]),
  packageName: 'openai',
  supportsDefaultConstructorImport: true,
});

/**
 * Indexes static value imports and the default OpenAI constructor import.
 * @param sourceFile The parsed TypeScript source.
 * @returns Module-owned import bindings needed by static relationship checks.
 */
export const indexOpenAiImports = (
  sourceFile: ts.SourceFile,
): {
  readonly namedImports: ReadonlyMap<string, IOpenAiNamedImport>;
  readonly openAiConstructorNames: ReadonlySet<string>;
} => {
  const result = indexImports(sourceFile, OPENAI_IMPORT_CONFIG);

  return {
    namedImports: result.namedImports,
    openAiConstructorNames: result.constructorNames,
  };
};

/**
 * Indexes direct value exports, module-level OpenAI clients, and constant arrays.
 * @param sourceFile The parsed TypeScript source.
 * @param openAiConstructorNames Default OpenAI constructor bindings.
 * @returns Static module declarations used by inspection.
 */
export const indexOpenAiModuleDeclarations = (
  sourceFile: ts.SourceFile,
  openAiConstructorNames: ReadonlySet<string>,
): {
  readonly clientNames: ReadonlySet<string>;
  readonly exports: ReadonlyMap<string, IOpenAiExportState & { readonly declaration: ts.Node }>;
  readonly moduleArrays: ReadonlyMap<string, IOpenAiModuleArray>;
  readonly moduleConstDeclarations: ReadonlyMap<string, ts.VariableDeclaration>;
} => indexModuleDeclarations(sourceFile, openAiConstructorNames);

/** Indexes local bindings that can shadow module-owned identifiers. */
export const indexOpenAiLocalBindingNames: (
  sourceFile: ts.SourceFile,
) => ReadonlyMap<ts.Node, ReadonlySet<string>> = indexLocalBindingNames;

/** Determines whether a module-bound name is visible at one use. */
export const isOpenAiModuleBindingVisible = (
  identifier: ts.Identifier,
  analysis: IOpenAiSourceAnalysis,
): boolean => isModuleBindingVisible(identifier, analysis);

/** Resolves TypeScript candidates for a supported relative ESM specifier. */
export const resolveOpenAiImportCandidatePaths = (
  containingPath: IRepositoryPath,
  moduleSpecifier: string,
): readonly string[] => resolveImportCandidatePaths(containingPath, moduleSpecifier);

/** Checks whether an identifier resolves to an explicit bound reference. */
export const isOpenAiBoundIdentifier = (
  identifier: ts.Identifier,
  analysis: IOpenAiSourceAnalysis,
  reference: IRepositoryReference,
): boolean => isBoundIdentifier(identifier, analysis, reference);
