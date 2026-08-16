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
  IAnthropicExportState,
  IAnthropicModuleArray,
  IAnthropicNamedImport,
  IAnthropicSourceAnalysis,
} from '../contracts/index.js';

const ANTHROPIC_IMPORT_CONFIG = Object.freeze({
  namedConstructorImports: Object.freeze(['Anthropic']),
  packageName: '@anthropic-ai/sdk',
  supportsDefaultConstructorImport: true,
});

/**
 * Indexes static value imports and the default Anthropic constructor import.
 * @param sourceFile The parsed TypeScript source.
 * @returns Module-owned import bindings needed by static relationship checks.
 */
export const indexAnthropicImports = (
  sourceFile: ts.SourceFile,
): {
  readonly namedImports: ReadonlyMap<string, IAnthropicNamedImport>;
  readonly anthropicConstructorNames: ReadonlySet<string>;
} => {
  const result = indexImports(sourceFile, ANTHROPIC_IMPORT_CONFIG);

  return {
    namedImports: result.namedImports,
    anthropicConstructorNames: result.constructorNames,
  };
};

/**
 * Indexes direct value exports, module-level Anthropic clients, and constant arrays.
 * @param sourceFile The parsed TypeScript source.
 * @param anthropicConstructorNames Default Anthropic constructor bindings.
 * @returns Static module declarations used by inspection.
 */
export const indexAnthropicModuleDeclarations = (
  sourceFile: ts.SourceFile,
  anthropicConstructorNames: ReadonlySet<string>,
): {
  readonly clientNames: ReadonlySet<string>;
  readonly exports: ReadonlyMap<string, IAnthropicExportState & { readonly declaration: ts.Node }>;
  readonly moduleArrays: ReadonlyMap<string, IAnthropicModuleArray>;
  readonly moduleConstDeclarations: ReadonlyMap<string, ts.VariableDeclaration>;
} => indexModuleDeclarations(sourceFile, anthropicConstructorNames);

/** Indexes local bindings that can shadow module-owned identifiers. */
export const indexAnthropicLocalBindingNames: (
  sourceFile: ts.SourceFile,
) => ReadonlyMap<ts.Node, ReadonlySet<string>> = indexLocalBindingNames;

/** Determines whether a module-bound name is visible at one use. */
export const isAnthropicModuleBindingVisible = (
  identifier: ts.Identifier,
  analysis: IAnthropicSourceAnalysis,
): boolean => isModuleBindingVisible(identifier, analysis);

/** Resolves TypeScript candidates for a supported relative ESM specifier. */
export const resolveAnthropicImportCandidatePaths = (
  containingPath: IRepositoryPath,
  moduleSpecifier: string,
): readonly string[] => resolveImportCandidatePaths(containingPath, moduleSpecifier);

/** Checks whether an identifier resolves to an explicit bound reference. */
export const isAnthropicBoundIdentifier = (
  identifier: ts.Identifier,
  analysis: IAnthropicSourceAnalysis,
  reference: IRepositoryReference,
): boolean => isBoundIdentifier(identifier, analysis, reference);
