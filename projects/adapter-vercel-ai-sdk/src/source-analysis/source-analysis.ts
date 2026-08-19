import ts from 'typescript';

import { analyzeTypeScriptModule } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { VERCEL_AI_SDK_PACKAGE_NAME } from '../constants/index.js';
import type {
  IVercelAiSdkImports,
  IVercelAiSdkSourceAnalysis,
  IVercelAiSdkSourceAnalysisResult,
} from '../contracts/index.js';

const VERCEL_AI_SDK_IMPORT_CONFIG = Object.freeze({
  namedConstructorImports: ['ToolLoopAgent'],
  packageName: VERCEL_AI_SDK_PACKAGE_NAME,
  supportsDefaultConstructorImport: false,
});

const indexVercelAiSdkImports = (sourceFile: ts.SourceFile): IVercelAiSdkImports => {
  const generateTextNames = new Set<string>();
  const outputNames = new Set<string>();
  const streamTextNames = new Set<string>();
  const toolLoopAgentNames = new Set<string>();
  const toolNames = new Set<string>();
  const bindings = new Map([
    ['generateText', generateTextNames],
    ['Output', outputNames],
    ['streamText', streamTextNames],
    ['ToolLoopAgent', toolLoopAgentNames],
    ['tool', toolNames],
  ]);

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== VERCEL_AI_SDK_PACKAGE_NAME ||
      statement.importClause?.isTypeOnly === true ||
      statement.importClause?.namedBindings === undefined ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }

    for (const element of statement.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      const names = bindings.get(importedName);

      if (!element.isTypeOnly && names !== undefined) {
        names.add(element.name.text);
      }
    }
  }

  return Object.freeze({
    generateTextNames,
    outputNames,
    streamTextNames,
    toolLoopAgentNames,
    toolNames,
  });
};

/**
 * Parses and indexes one Vercel AI SDK TypeScript module without executing it.
 * @param path The normalized repository source path.
 * @param bytes The exact repository bytes.
 * @param signal The active inspection signal.
 * @returns The source analysis or a stable invalid source result.
 */
export const analyzeVercelAiSdkSource = (
  path: IRepositoryPath,
  bytes: Uint8Array,
  signal?: AbortSignal,
): IVercelAiSdkSourceAnalysisResult => {
  const result = analyzeTypeScriptModule(path, bytes, VERCEL_AI_SDK_IMPORT_CONFIG, signal);

  if (result.kind !== 'valid') {
    return result;
  }

  const analysis: IVercelAiSdkSourceAnalysis = Object.freeze({
    ...result.analysis,
    imports: indexVercelAiSdkImports(result.analysis.sourceFile),
    path,
  });

  return Object.freeze({ analysis, kind: 'valid' });
};
