import ts from 'typescript';

import { getClosedObjectProperties, unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type {
  ICloudflareAgentsClassDefinition,
  ICloudflareAgentsRelationship,
} from '../contracts/index.js';
import { getCloudflareAgentsMethod } from './methods.js';

/** Determines whether Think channel configuration can influence the assembled tool set. */
export const getCloudflareAgentsThinkChannelTools = (
  definition: ICloudflareAgentsClassDefinition,
): ICloudflareAgentsRelationship => {
  const method = getCloudflareAgentsMethod(definition.methods, 'configureChannels', 0);

  if (method === null) {
    return Object.freeze({
      kind: definition.methods.has('configureChannels') ? 'unresolved' : 'absent',
    });
  }

  if (method.body.statements.length !== 1) {
    return Object.freeze({ kind: 'unresolved' });
  }

  const statement = method.body.statements[0];

  if (
    statement === undefined ||
    !ts.isReturnStatement(statement) ||
    statement.expression === undefined
  ) {
    return Object.freeze({ kind: 'unresolved' });
  }

  const channelMap = unwrapExpression(statement.expression);

  if (!ts.isObjectLiteralExpression(channelMap)) {
    return Object.freeze({ kind: 'unresolved' });
  }

  const channels = getClosedObjectProperties(channelMap);

  if (channels === null) {
    return Object.freeze({ kind: 'unresolved' });
  }

  for (const channelExpression of channels.values()) {
    const channel = unwrapExpression(channelExpression);

    if (!ts.isObjectLiteralExpression(channel)) {
      return Object.freeze({ kind: 'unresolved' });
    }

    const properties = getClosedObjectProperties(channel);

    if (properties === null || properties.has('tools')) {
      return Object.freeze({ kind: 'unresolved' });
    }
  }

  return Object.freeze({ kind: 'absent' });
};
