import ts from 'typescript';

import type { IRepositoryPath } from '@moldea.ai/repository';

import { OPENAI_TYPESCRIPT_SOURCE_EXTENSIONS } from '../constants/index.js';
import type {
  IOpenAiExportState,
  IOpenAiSourceAnalysis,
  IOpenAiSourceAnalysisResult,
} from '../contracts/index.js';
import { normalizeOpenAiText } from '../text/index.js';
import {
  indexOpenAiImports,
  indexOpenAiLocalBindingNames,
  indexOpenAiModuleDeclarations,
} from './bindings.js';
import { unwrapOpenAiExpression } from './expressions.js';
import { indexSafeOpenAiModuleArrayNames } from './responses.js';

const getScriptKind = (path: IRepositoryPath): ts.ScriptKind =>
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
 * Parses and indexes one supported TypeScript source without execution, emit, or typechecking.
 * @param path The normalized logical source path.
 * @param bytes The exact source bytes returned by the repository reader.
 * @param signal The active inspection signal.
 * @returns A source analysis or stable invalid-text or invalid-syntax result.
 * @throws
 * - If source analysis is aborted
 */
export const analyzeOpenAiSource = (
  path: IRepositoryPath,
  bytes: Uint8Array,
  signal?: AbortSignal,
): IOpenAiSourceAnalysisResult => {
  signal?.throwIfAborted();
  const text = normalizeOpenAiText(bytes);

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

  const { namedImports, openAiConstructorNames } = indexOpenAiImports(sourceFile);
  signal?.throwIfAborted();
  const { clientNames, exports, moduleArrays, moduleConstDeclarations } =
    indexOpenAiModuleDeclarations(sourceFile, openAiConstructorNames);
  signal?.throwIfAborted();
  const localBindingNames = indexOpenAiLocalBindingNames(sourceFile);
  signal?.throwIfAborted();
  const preliminaryAnalysis: IOpenAiSourceAnalysis = Object.freeze({
    clientNames,
    exports,
    localBindingNames,
    moduleArrays,
    moduleConstDeclarations,
    namedImports,
    openAiConstructorNames,
    path,
    safeModuleArrayNames: new Set<string>(),
    sourceFile,
    text,
  });
  const analysis: IOpenAiSourceAnalysis = Object.freeze({
    ...preliminaryAnalysis,
    safeModuleArrayNames: indexSafeOpenAiModuleArrayNames(preliminaryAnalysis),
  });
  signal?.throwIfAborted();

  return Object.freeze({ analysis, kind: 'valid' });
};

/**
 * Determines whether a bound path uses a supported TypeScript source extension.
 * @param path The bound source path.
 * @returns Whether its extension is supported.
 */
export const isSupportedOpenAiSourcePath = (path: IRepositoryPath): boolean =>
  OPENAI_TYPESCRIPT_SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));

/**
 * Classifies a direct exported runtime-agent function and exposes its lexical body.
 * @param analysis The indexed runtime source.
 * @param symbol The bound runtime-agent symbol.
 * @returns The symbol state and supported body when available.
 */
export const getOpenAiRuntimeExport = (
  analysis: IOpenAiSourceAnalysis,
  symbol: string,
): IOpenAiExportState & { readonly body?: ts.ConciseBody } => {
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
    const initializer = unwrapOpenAiExpression(declaration.initializer);

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
export const getOpenAiCallableExportState = (
  analysis: IOpenAiSourceAnalysis,
  symbol: string,
): IOpenAiExportState => {
  const runtimeExport = getOpenAiRuntimeExport(analysis, symbol);

  return runtimeExport.kind === 'present-supported'
    ? Object.freeze({ declaration: runtimeExport.declaration, kind: 'present-supported' })
    : runtimeExport;
};

/**
 * Classifies a directly exported constant and returns its static initializer.
 * @param analysis The indexed source.
 * @param symbol The exact bound symbol.
 * @returns The symbol state and initializer when its declaration form is supported.
 */
export const getOpenAiConstExport = (
  analysis: IOpenAiSourceAnalysis,
  symbol: string,
): IOpenAiExportState & { readonly expression?: ts.Expression } => {
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
      expression: unwrapOpenAiExpression(exported.declaration.initializer),
      kind: 'present-supported',
    });
  }

  return Object.freeze({
    declaration: exported.declaration,
    kind: 'present-unsupported',
  });
};
