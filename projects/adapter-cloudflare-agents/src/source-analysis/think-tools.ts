import ts from 'typescript';

import { unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type {
  ICloudflareAgentsClassDefinition,
  ICloudflareAgentsRelationship,
} from '../contracts/index.js';
import { getCloudflareAgentsMethod } from './methods.js';

/** Extracts the direct tools expression returned by a closed Think `getTools` method. */
export const getCloudflareAgentsThinkTools = (
  definition: ICloudflareAgentsClassDefinition,
): ICloudflareAgentsRelationship => {
  const method = getCloudflareAgentsMethod(definition.methods, 'getTools', 0);

  if (method === null || method.body.statements.length !== 1) {
    return Object.freeze({ kind: 'absent' });
  }

  const statement = method.body.statements[0];

  return statement !== undefined &&
    ts.isReturnStatement(statement) &&
    statement.expression !== undefined
    ? Object.freeze({ expression: unwrapExpression(statement.expression), kind: 'present' })
    : Object.freeze({ kind: 'unresolved' });
};
