import ts from 'typescript';

import { analyzeTypeScriptModule } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { LANGGRAPH_PACKAGE_NAME } from '../constants/index.js';
import type {
  ILangGraphImports,
  ILangGraphSourceAnalysis,
  ILangGraphSourceAnalysisResult,
} from '../contracts/index.js';

const SUPPORTED_IMPORTS = new Set([
  'END',
  'START',
  'StateGraph',
  'entrypoint',
  'getPreviousState',
  'interrupt',
  'task',
]);

const indexLangGraphImports = (sourceFile: ts.SourceFile): ILangGraphImports => {
  const names = {
    endNames: new Set<string>(),
    entrypointNames: new Set<string>(),
    getPreviousStateNames: new Set<string>(),
    interruptNames: new Set<string>(),
    startNames: new Set<string>(),
    stateGraphNames: new Set<string>(),
    taskNames: new Set<string>(),
  };
  const targetByImport = {
    END: names.endNames,
    START: names.startNames,
    StateGraph: names.stateGraphNames,
    entrypoint: names.entrypointNames,
    getPreviousState: names.getPreviousStateNames,
    interrupt: names.interruptNames,
    task: names.taskNames,
  } as const;

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== LANGGRAPH_PACKAGE_NAME ||
      statement.importClause?.isTypeOnly === true ||
      statement.importClause?.namedBindings === undefined ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }

    for (const element of statement.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;

      if (element.isTypeOnly || !SUPPORTED_IMPORTS.has(importedName)) {
        continue;
      }

      targetByImport[importedName as keyof typeof targetByImport].add(element.name.text);
    }
  }

  return Object.freeze(names);
};

/** Parses and indexes one supported LangGraph TypeScript module without executing it. */
export const analyzeLangGraphSource = (
  path: IRepositoryPath,
  bytes: Uint8Array,
  signal?: AbortSignal,
): ILangGraphSourceAnalysisResult => {
  const result = analyzeTypeScriptModule(
    path,
    bytes,
    {
      namedConstructorImports: ['StateGraph'],
      packageName: LANGGRAPH_PACKAGE_NAME,
      supportsDefaultConstructorImport: false,
    },
    signal,
  );

  if (result.kind !== 'valid') {
    return result;
  }

  const analysis: ILangGraphSourceAnalysis = Object.freeze({
    ...result.analysis,
    imports: indexLangGraphImports(result.analysis.sourceFile),
    path,
  });

  return Object.freeze({ analysis, kind: 'valid' });
};
