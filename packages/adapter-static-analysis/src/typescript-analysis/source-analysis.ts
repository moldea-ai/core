import ts from 'typescript';

import type {
  IStaticAnalysisExportState,
  IStaticAnalysisSource,
  IStaticAnalysisSourceConfig,
  IStaticAnalysisSourceResult,
} from '../types.js';
import { normalizeText } from '../text/index.js';
import {
  indexIdentifierUses,
  indexImports,
  indexLocalBindingNames,
  indexModuleDeclarations,
} from './bindings.js';
import { unwrapExpression } from './expressions.js';
import { indexSafeModuleArrayNames } from './requests.js';

const getScriptKind = (path: string): ts.ScriptKind =>
  path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;

const createSyntaxProgram = (sourceFile: ts.SourceFile, text: string): ts.Program => {
  const host: ts.CompilerHost = {
    fileExists: (fileName) => fileName === sourceFile.fileName,
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => '/',
    getDefaultLibFileName: () => '/lib.d.ts',
    getDirectories: () => [],
    getNewLine: () => '\n',
    getSourceFile: (fileName) => (fileName === sourceFile.fileName ? sourceFile : undefined),
    readFile: (fileName) => (fileName === sourceFile.fileName ? text : undefined),
    useCaseSensitiveFileNames: () => true,
    writeFile: () => undefined,
  };

  return ts.createProgram({
    host,
    options: {
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      noLib: true,
      noResolve: true,
      target: ts.ScriptTarget.ES2023,
    },
    rootNames: [sourceFile.fileName],
  });
};

/**
 * Parses and indexes one TypeScript source without execution, emit, or typechecking.
 * @param path The normalized logical source path.
 * @param bytes The exact source bytes returned by the adapter reader.
 * @param config The provider import and request analysis contract.
 * @param signal The active inspection signal.
 * @returns A source analysis or stable invalid-text or invalid-syntax result.
 * @throws If source analysis is aborted.
 */
export const analyzeSource = (
  path: string,
  bytes: Uint8Array,
  config: IStaticAnalysisSourceConfig,
  signal?: AbortSignal,
): IStaticAnalysisSourceResult => {
  signal?.throwIfAborted();
  const text = normalizeText(bytes);

  if (!text.valid) {
    return Object.freeze({ kind: 'invalid-text' });
  }

  signal?.throwIfAborted();
  const sourceFile = ts.createSourceFile(
    path,
    text.value,
    ts.ScriptTarget.ES2023,
    true,
    getScriptKind(path),
  );
  const program = createSyntaxProgram(sourceFile, text.value);
  const syntaxDiagnostic = program
    .getSyntacticDiagnostics(sourceFile)
    .filter(({ category }) => category === ts.DiagnosticCategory.Error)
    .sort((left, right) => (left.start ?? 0) - (right.start ?? 0))[0];
  signal?.throwIfAborted();

  if (syntaxDiagnostic !== undefined) {
    const start = syntaxDiagnostic.start;

    return Object.freeze({
      kind: 'invalid-syntax',
      range:
        start === undefined
          ? null
          : text.locator.locateRange(start, start + (syntaxDiagnostic.length ?? 0)),
    });
  }

  const { constructorNames, namedImports } = indexImports(sourceFile, config.importConfig);
  signal?.throwIfAborted();
  const { clientNames, exports, moduleArrays, moduleConstDeclarations } = indexModuleDeclarations(
    sourceFile,
    constructorNames,
  );
  signal?.throwIfAborted();
  const identifierUses = indexIdentifierUses(sourceFile);
  signal?.throwIfAborted();
  const localBindingNames = indexLocalBindingNames(sourceFile);
  signal?.throwIfAborted();
  const preliminaryAnalysis: IStaticAnalysisSource = Object.freeze({
    clientNames,
    constructorNames,
    exports,
    identifierUses,
    localBindingNames,
    moduleArrays,
    moduleConstDeclarations,
    namedImports,
    path,
    safeModuleArrayNames: new Set<string>(),
    sourceFile,
    text,
  });
  const analysis: IStaticAnalysisSource = Object.freeze({
    ...preliminaryAnalysis,
    safeModuleArrayNames: indexSafeModuleArrayNames(preliminaryAnalysis, config.requestConfig),
  });
  signal?.throwIfAborted();

  return Object.freeze({ analysis, kind: 'valid' });
};

/**
 * Determines whether a path uses a supported TypeScript source extension.
 * @param path The bound source path.
 * @returns Whether its extension is supported.
 */
export const isSupportedTypeScriptSourcePath = (path: string): boolean =>
  ['.ts', '.tsx', '.mts'].some((extension) => path.endsWith(extension));

/**
 * Classifies a direct exported runtime-agent function and exposes its body.
 * @param analysis The indexed runtime source.
 * @param symbol The bound runtime-agent symbol.
 * @returns The symbol state and supported body when available.
 */
export const getRuntimeExport = (
  analysis: IStaticAnalysisSource,
  symbol: string,
): IStaticAnalysisExportState & { readonly body?: ts.ConciseBody } => {
  const exported = analysis.exports.get(symbol);

  if (exported === undefined) {
    return Object.freeze({ kind: 'absent' });
  }

  if (exported.kind === 'present-unsupported') {
    return exported;
  }

  const { declaration } = exported;

  if (ts.isFunctionDeclaration(declaration) && declaration.body !== undefined) {
    return Object.freeze({ body: declaration.body, declaration, kind: 'present-supported' });
  }

  if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
    const initializer = unwrapExpression(declaration.initializer);

    if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
      return Object.freeze({ body: initializer.body, declaration, kind: 'present-supported' });
    }
  }

  return Object.freeze({ declaration, kind: 'present-unsupported' });
};

/**
 * Classifies a directly exported callable value such as an instruction loader.
 * @param analysis The indexed source.
 * @param symbol The exact bound symbol.
 * @returns The symbol state for conservative call matching.
 */
export const getCallableExportState = (
  analysis: IStaticAnalysisSource,
  symbol: string,
): IStaticAnalysisExportState => {
  const runtimeExport = getRuntimeExport(analysis, symbol);

  return runtimeExport.kind === 'present-supported'
    ? Object.freeze({ declaration: runtimeExport.declaration, kind: 'present-supported' })
    : runtimeExport;
};

/**
 * Classifies a directly exported constant and returns its static initializer.
 * @param analysis The indexed source.
 * @param symbol The exact bound symbol.
 * @returns The symbol state and initializer when supported.
 */
export const getConstExport = (
  analysis: IStaticAnalysisSource,
  symbol: string,
): IStaticAnalysisExportState & { readonly expression?: ts.Expression } => {
  const exported = analysis.exports.get(symbol);

  if (exported === undefined) {
    return Object.freeze({ kind: 'absent' });
  }

  if (
    exported.kind === 'present-supported' &&
    ts.isVariableDeclaration(exported.declaration) &&
    exported.declaration.initializer !== undefined
  ) {
    return Object.freeze({
      declaration: exported.declaration,
      expression: unwrapExpression(exported.declaration.initializer),
      kind: 'present-supported',
    });
  }

  return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
};
