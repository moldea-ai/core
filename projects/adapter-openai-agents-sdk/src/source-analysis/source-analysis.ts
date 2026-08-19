import ts from 'typescript';

import { analyzeTypeScriptModule } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { OPENAI_AGENTS_SDK_PACKAGE_NAME } from '../constants/index.js';
import type {
  IOpenAiAgentsSdkImports,
  IOpenAiAgentsSdkSourceAnalysis,
  IOpenAiAgentsSdkSourceAnalysisResult,
} from '../contracts/index.js';

const OPENAI_AGENTS_SDK_IMPORT_CONFIG = Object.freeze({
  namedConstructorImports: ['Agent'],
  packageName: OPENAI_AGENTS_SDK_PACKAGE_NAME,
  supportsDefaultConstructorImport: false,
});

const indexOpenAiAgentsSdkImports = (sourceFile: ts.SourceFile): IOpenAiAgentsSdkImports => {
  const agentNames = new Set<string>();
  const handoffNames = new Set<string>();
  const toolNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== OPENAI_AGENTS_SDK_PACKAGE_NAME ||
      statement.importClause?.isTypeOnly === true ||
      statement.importClause?.namedBindings === undefined ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }

    for (const element of statement.importClause.namedBindings.elements) {
      if (element.isTypeOnly) {
        continue;
      }

      const importedName = element.propertyName?.text ?? element.name.text;

      if (importedName === 'Agent') {
        agentNames.add(element.name.text);
      } else if (importedName === 'handoff') {
        handoffNames.add(element.name.text);
      } else if (importedName === 'tool') {
        toolNames.add(element.name.text);
      }
    }
  }

  return Object.freeze({ agentNames, handoffNames, toolNames });
};

/**
 * Parses and indexes one OpenAI Agents SDK TypeScript module without executing it.
 * @param path The normalized repository source path.
 * @param bytes The exact repository bytes.
 * @param signal The active inspection signal.
 * @returns The source analysis or a stable invalid source result.
 */
export const analyzeOpenAiAgentsSdkSource = (
  path: IRepositoryPath,
  bytes: Uint8Array,
  signal?: AbortSignal,
): IOpenAiAgentsSdkSourceAnalysisResult => {
  const result = analyzeTypeScriptModule(path, bytes, OPENAI_AGENTS_SDK_IMPORT_CONFIG, signal);

  if (result.kind !== 'valid') {
    return result;
  }

  const analysis: IOpenAiAgentsSdkSourceAnalysis = Object.freeze({
    ...result.analysis,
    imports: indexOpenAiAgentsSdkImports(result.analysis.sourceFile),
    path,
  });

  return Object.freeze({ analysis, kind: 'valid' });
};
