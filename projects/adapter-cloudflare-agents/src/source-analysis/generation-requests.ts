import ts from 'typescript';

import { isModuleBindingVisible, unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type {
  ICloudflareAgentsGenerationRequest,
  ICloudflareAgentsMethod,
  ICloudflareAgentsSourceAnalysis,
} from '../contracts/index.js';
import { analyzeCloudflareAgentsObjectRelationships } from './bindings.js';

/** Finds supported direct AI SDK requests in the method's own lexical body. */
export const getCloudflareAgentsGenerationRequests = (
  method: ICloudflareAgentsMethod,
  analysis: ICloudflareAgentsSourceAnalysis,
): readonly ICloudflareAgentsGenerationRequest[] => {
  const requests: ICloudflareAgentsGenerationRequest[] = [];
  const visit = (node: ts.Node): void => {
    if (node !== method.body && ts.isFunctionLike(node)) {
      return;
    }

    if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);
      const argument = node.arguments[0] === undefined ? null : unwrapExpression(node.arguments[0]);

      if (
        ts.isIdentifier(callee) &&
        isModuleBindingVisible(callee, analysis) &&
        argument !== null &&
        ts.isObjectLiteralExpression(argument)
      ) {
        const call = analysis.imports.generateTextNames.has(callee.text)
          ? 'generateText'
          : analysis.imports.streamTextNames.has(callee.text)
            ? 'streamText'
            : null;

        if (call !== null && node.arguments.length === 1) {
          const relationships = analyzeCloudflareAgentsObjectRelationships(argument, [
            'instructions',
            'system',
            'output',
            'tools',
            'prepareStep',
          ] as const);
          const instructions =
            relationships.prepareStep.kind !== 'absent'
              ? ({ kind: 'unresolved' } as const)
              : relationships.instructions.kind !== 'absent'
                ? relationships.instructions
                : relationships.system;
          requests.push(
            Object.freeze({
              call,
              instructions,
              object: argument,
              output: relationships.output,
              tools: relationships.tools,
            }),
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(method.body);
  return Object.freeze(requests);
};
