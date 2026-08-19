import ts from 'typescript';

import { analyzeTypeScriptModule } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { CLAUDE_AGENT_SDK_PACKAGE_NAME } from '../constants/index.js';
import type {
  IClaudeAgentSdkImports,
  IClaudeAgentSdkSourceAnalysis,
  IClaudeAgentSdkSourceAnalysisResult,
} from '../contracts/index.js';

const CLAUDE_AGENT_SDK_IMPORT_CONFIG = Object.freeze({
  namedConstructorImports: [],
  packageName: CLAUDE_AGENT_SDK_PACKAGE_NAME,
  supportsDefaultConstructorImport: false,
});

const indexClaudeAgentSdkImports = (sourceFile: ts.SourceFile): IClaudeAgentSdkImports => {
  const createSdkMcpServerNames = new Set<string>();
  const queryNames = new Set<string>();
  const toolNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== CLAUDE_AGENT_SDK_PACKAGE_NAME ||
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

      if (importedName === 'createSdkMcpServer') {
        createSdkMcpServerNames.add(element.name.text);
      } else if (importedName === 'query') {
        queryNames.add(element.name.text);
      } else if (importedName === 'tool') {
        toolNames.add(element.name.text);
      }
    }
  }

  return Object.freeze({ createSdkMcpServerNames, queryNames, toolNames });
};

/**
 * Parses and indexes one Claude Agent SDK TypeScript module without executing it.
 * @param path The normalized repository source path.
 * @param bytes The exact repository bytes.
 * @param signal The active inspection signal.
 * @returns The source analysis or a stable invalid source result.
 */
export const analyzeClaudeAgentSdkSource = (
  path: IRepositoryPath,
  bytes: Uint8Array,
  signal?: AbortSignal,
): IClaudeAgentSdkSourceAnalysisResult => {
  const result = analyzeTypeScriptModule(path, bytes, CLAUDE_AGENT_SDK_IMPORT_CONFIG, signal);

  if (result.kind !== 'valid') {
    return result;
  }

  const analysis: IClaudeAgentSdkSourceAnalysis = Object.freeze({
    ...result.analysis,
    imports: indexClaudeAgentSdkImports(result.analysis.sourceFile),
    path,
  });

  return Object.freeze({ analysis, kind: 'valid' });
};
