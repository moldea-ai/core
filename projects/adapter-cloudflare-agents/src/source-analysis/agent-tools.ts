import ts from 'typescript';

import {
  getClosedObjectProperties,
  getStaticString,
  isModuleBindingVisible,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';

import type {
  ICloudflareAgentsAgentTool,
  ICloudflareAgentsSourceAnalysis,
} from '../contracts/index.js';

/** Classifies one direct Cloudflare `agentTool(...)` declaration. */
export const getCloudflareAgentsAgentTool = (
  analysis: ICloudflareAgentsSourceAnalysis,
  declaration: ts.VariableDeclaration,
): ICloudflareAgentsAgentTool | null => {
  if (declaration.initializer === undefined) {
    return null;
  }

  const call = unwrapExpression(declaration.initializer);

  if (!ts.isCallExpression(call) || call.arguments.length < 1 || call.arguments.length > 2) {
    return null;
  }

  const callee = unwrapExpression(call.expression);
  const target = unwrapExpression(call.arguments[0] as ts.Expression);

  if (
    !ts.isIdentifier(callee) ||
    !analysis.imports.agentToolNames.has(callee.text) ||
    !isModuleBindingVisible(callee, analysis) ||
    !ts.isIdentifier(target)
  ) {
    return null;
  }

  const options = call.arguments[1];
  let description: string | null = null;

  if (options !== undefined) {
    const candidate = unwrapExpression(options);

    if (!ts.isObjectLiteralExpression(candidate)) {
      return null;
    }

    const properties = getClosedObjectProperties(candidate);

    if (
      properties === null ||
      [...properties.keys()].some((name) => !['description', 'name'].includes(name))
    ) {
      return null;
    }

    description = getStaticString(properties.get('description'));

    if (properties.has('description') && description === null) {
      return null;
    }
  }

  return Object.freeze({ declaration, description, target });
};
