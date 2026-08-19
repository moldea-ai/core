import ts from 'typescript';

import { getDirectCall } from '@moldea.ai/adapter-static-analysis';

import type {
  ICloudflareAgentsClassDefinition,
  ICloudflareAgentsRelationship,
} from '../contracts/index.js';
import { getCloudflareAgentsMethod } from './methods.js';

/** Extracts the exact direct loader call returned by `getSystemPrompt`. */
export const getCloudflareAgentsThinkSystemPrompt = (
  definition: ICloudflareAgentsClassDefinition,
): ICloudflareAgentsRelationship => {
  const method = getCloudflareAgentsMethod(definition.methods, 'getSystemPrompt', 0);

  if (method === null || method.body.statements.length !== 1) {
    return Object.freeze({ kind: 'absent' });
  }

  const statement = method.body.statements[0];

  if (
    statement === undefined ||
    !ts.isReturnStatement(statement) ||
    statement.expression === undefined
  ) {
    return Object.freeze({ kind: 'unresolved' });
  }

  return Object.freeze(
    getDirectCall(statement.expression) === null
      ? { kind: 'unresolved' }
      : { expression: statement.expression, kind: 'present' },
  );
};
