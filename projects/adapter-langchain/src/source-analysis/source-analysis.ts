import ts from 'typescript';

import { analyzeTypeScriptModule } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { LANGCHAIN_PACKAGE_NAME } from '../constants/index.js';
import type {
  ILangChainImports,
  ILangChainSourceAnalysis,
  ILangChainSourceAnalysisResult,
} from '../contracts/index.js';

const SUPPORTED_IMPORTS = Object.freeze({
  '@langchain/core/messages': new Set(['SystemMessage']),
  '@langchain/core/tools': new Set(['tool']),
  langchain: new Set(['createAgent', 'providerStrategy', 'SystemMessage', 'tool', 'toolStrategy']),
  'langchain/tools': new Set(['tool']),
} as const);

const indexLangChainImports = (sourceFile: ts.SourceFile): ILangChainImports => {
  const createAgentNames = new Set<string>();
  const providerStrategyNames = new Set<string>();
  const systemMessageNames = new Set<string>();
  const toolNames = new Map<string, string>();
  const toolStrategyNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.importClause?.isTypeOnly === true ||
      statement.importClause?.namedBindings === undefined ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }

    const moduleSpecifier = statement.moduleSpecifier.text;
    const supportedNames = SUPPORTED_IMPORTS[moduleSpecifier as keyof typeof SUPPORTED_IMPORTS];

    if (supportedNames === undefined) {
      continue;
    }

    for (const element of statement.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;

      if (element.isTypeOnly || !supportedNames.has(importedName)) {
        continue;
      }

      if (moduleSpecifier === 'langchain' && importedName === 'createAgent') {
        createAgentNames.add(element.name.text);
      } else if (moduleSpecifier === 'langchain' && importedName === 'providerStrategy') {
        providerStrategyNames.add(element.name.text);
      } else if (importedName === 'SystemMessage') {
        systemMessageNames.add(element.name.text);
      } else if (importedName === 'tool') {
        toolNames.set(element.name.text, moduleSpecifier);
      } else if (moduleSpecifier === 'langchain' && importedName === 'toolStrategy') {
        toolStrategyNames.add(element.name.text);
      }
    }
  }

  return Object.freeze({
    createAgentNames,
    providerStrategyNames,
    systemMessageNames,
    toolNames,
    toolStrategyNames,
  });
};

/** Parses and indexes one supported LangChain TypeScript module without executing it. */
export const analyzeLangChainSource = (
  path: IRepositoryPath,
  bytes: Uint8Array,
  signal?: AbortSignal,
): ILangChainSourceAnalysisResult => {
  const result = analyzeTypeScriptModule(
    path,
    bytes,
    {
      namedConstructorImports: [],
      packageName: LANGCHAIN_PACKAGE_NAME,
      supportsDefaultConstructorImport: false,
    },
    signal,
  );

  if (result.kind !== 'valid') {
    return result;
  }

  const analysis: ILangChainSourceAnalysis = Object.freeze({
    ...result.analysis,
    imports: indexLangChainImports(result.analysis.sourceFile),
    path,
  });

  return Object.freeze({ analysis, kind: 'valid' });
};
