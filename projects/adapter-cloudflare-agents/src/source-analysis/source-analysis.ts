import ts from 'typescript';

import { analyzeTypeScriptModule } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { CLOUDFLARE_THINK_PACKAGE_NAME } from '../constants/index.js';
import type {
  ICloudflareAgentsImports,
  ICloudflareAgentsSourceAnalysis,
  ICloudflareAgentsSourceAnalysisResult,
} from '../contracts/index.js';

const IMPORT_CONFIG = Object.freeze({
  namedConstructorImports: ['Think'],
  packageName: CLOUDFLARE_THINK_PACKAGE_NAME,
  supportsDefaultConstructorImport: false,
});

const indexCloudflareAgentsImports = (sourceFile: ts.SourceFile): ICloudflareAgentsImports => {
  const imports = {
    agentToolNames: new Set<string>(),
    aiChatAgentNames: new Set<string>(),
    generateTextNames: new Set<string>(),
    outputNames: new Set<string>(),
    streamTextNames: new Set<string>(),
    thinkNames: new Set<string>(),
    toolNames: new Set<string>(),
  };

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

    for (const element of statement.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;

      if (element.isTypeOnly) {
        continue;
      }

      if (
        statement.moduleSpecifier.text === '@cloudflare/ai-chat' &&
        importedName === 'AIChatAgent'
      ) {
        imports.aiChatAgentNames.add(element.name.text);
      } else if (
        statement.moduleSpecifier.text === '@cloudflare/think' &&
        importedName === 'Think'
      ) {
        imports.thinkNames.add(element.name.text);
      } else if (
        statement.moduleSpecifier.text === 'agents/agent-tools' &&
        importedName === 'agentTool'
      ) {
        imports.agentToolNames.add(element.name.text);
      } else if (statement.moduleSpecifier.text === 'ai') {
        if (importedName === 'generateText') imports.generateTextNames.add(element.name.text);
        if (importedName === 'Output') imports.outputNames.add(element.name.text);
        if (importedName === 'streamText') imports.streamTextNames.add(element.name.text);
        if (importedName === 'tool') imports.toolNames.add(element.name.text);
      }
    }
  }

  return Object.freeze(imports);
};

/** Parses and indexes one Cloudflare Agents TypeScript module without executing it. */
export const analyzeCloudflareAgentsSource = (
  path: IRepositoryPath,
  bytes: Uint8Array,
  signal?: AbortSignal,
): ICloudflareAgentsSourceAnalysisResult => {
  const result = analyzeTypeScriptModule(path, bytes, IMPORT_CONFIG, signal);

  if (result.kind !== 'valid') {
    return result;
  }

  const analysis: ICloudflareAgentsSourceAnalysis = Object.freeze({
    ...result.analysis,
    imports: indexCloudflareAgentsImports(result.analysis.sourceFile),
    path,
  });

  return Object.freeze({ analysis, kind: 'valid' });
};
