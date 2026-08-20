import ts from 'typescript';

import { analyzeTypeScriptModule } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryPath } from '@moldea.ai/repository';

import type { IEveSourceAnalysis, IEveSourceAnalysisResult } from '../contracts/index.js';
import { indexEveHelperImports } from './helper-imports.js';

const indexRuntimeSymbols = (sourceFile: ts.SourceFile): ReadonlyMap<string, ts.Declaration> => {
  const symbols = new Map<string, ts.Declaration>();

  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name !== undefined
    ) {
      symbols.set(statement.name.text, statement);
      continue;
    }

    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        symbols.set(declaration.name.text, declaration);
      }
    }
  }

  return symbols;
};

/** Parses one supported Eve TypeScript module without executing or resolving it. */
export const analyzeEveSource = (
  path: IRepositoryPath,
  bytes: Uint8Array,
  signal?: AbortSignal,
): IEveSourceAnalysisResult => {
  const result = analyzeTypeScriptModule(
    path,
    bytes,
    {
      namedConstructorImports: [],
      packageName: 'eve',
      supportsDefaultConstructorImport: false,
    },
    signal,
  );

  if (result.kind !== 'valid') {
    return result;
  }

  const analysis: IEveSourceAnalysis = Object.freeze({
    ...result.analysis,
    defaultExports: Object.freeze(
      result.analysis.sourceFile.statements.filter(
        (statement): statement is ts.ExportAssignment =>
          ts.isExportAssignment(statement) && !statement.isExportEquals,
      ),
    ),
    helperImports: indexEveHelperImports(result.analysis.sourceFile),
    path,
    runtimeSymbols: indexRuntimeSymbols(result.analysis.sourceFile),
  });

  return Object.freeze({ analysis, kind: 'valid' });
};
