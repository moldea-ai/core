import ts from 'typescript';

import { isModuleBindingVisible, unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type {
  IClaudeAgentSdkSourceAnalysis,
  IClaudeAgentSdkToolDefinition,
  IClaudeAgentSdkToolDefinitionResult,
} from '../contracts/index.js';

/**
 * Classifies one directly exported root tool(...) declaration.
 * @param analysis The indexed tool source.
 * @param symbol The exact exported tool registration symbol.
 * @returns The absent, unsupported, or structurally supported tool state.
 */
export const getClaudeAgentSdkToolDefinition = (
  analysis: IClaudeAgentSdkSourceAnalysis,
  symbol: string,
): IClaudeAgentSdkToolDefinitionResult => {
  const exported = analysis.exports.get(symbol);

  if (exported === undefined) {
    return Object.freeze({ kind: 'absent' });
  }

  if (
    exported.kind !== 'present-supported' ||
    !ts.isVariableDeclaration(exported.declaration) ||
    exported.declaration.initializer === undefined
  ) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const initializer = unwrapExpression(exported.declaration.initializer);

  if (
    !ts.isCallExpression(initializer) ||
    (initializer.arguments.length !== 4 && initializer.arguments.length !== 5)
  ) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const helper = unwrapExpression(initializer.expression);

  if (
    !ts.isIdentifier(helper) ||
    !analysis.imports.toolNames.has(helper.text) ||
    !isModuleBindingVisible(helper, analysis)
  ) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const tool: IClaudeAgentSdkToolDefinition = Object.freeze({
    call: initializer,
    declaration: exported.declaration,
    implementation: unwrapExpression(initializer.arguments[3] as ts.Expression),
    inputSchema: unwrapExpression(initializer.arguments[2] as ts.Expression),
    name: unwrapExpression(initializer.arguments[0] as ts.Expression),
  });

  return Object.freeze({ kind: 'present-supported', tool });
};
