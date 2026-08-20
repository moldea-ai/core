import ts from 'typescript';

import { unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type {
  ICloudflareAgentsToolMapEntry,
  ICloudflareAgentsToolMapResult,
} from '../contracts/index.js';
import { getCloudflareAgentsPropertyName } from './bindings.js';

/** Classifies one direct tools-map object while retaining supported own entries. */
export const getCloudflareAgentsToolMap = (
  object: ts.ObjectLiteralExpression,
): ICloudflareAgentsToolMapResult => {
  const entries: ICloudflareAgentsToolMapEntry[] = [];
  const names = new Set<string>();
  let isUnresolved = false;

  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name)) {
      isUnresolved = true;
      continue;
    }

    const name = getCloudflareAgentsPropertyName(property.name);

    if (name === null || names.has(name)) {
      isUnresolved = true;
      continue;
    }

    names.add(name);

    if (ts.isPropertyAssignment(property) && name !== '__proto__') {
      entries.push(Object.freeze({ expression: unwrapExpression(property.initializer), name }));
    } else if (ts.isShorthandPropertyAssignment(property)) {
      entries.push(Object.freeze({ expression: property.name, name }));
    } else if (name !== '__proto__') {
      isUnresolved = true;
    }
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    kind: isUnresolved ? 'unresolved' : 'closed',
  });
};
