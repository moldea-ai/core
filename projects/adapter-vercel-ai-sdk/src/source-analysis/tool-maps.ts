import ts from 'typescript';

import { unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type { IVercelAiSdkToolMapEntry, IVercelAiSdkToolMapResult } from '../contracts/index.js';
import { getVercelAiSdkPropertyName } from './bindings.js';

/** Classifies one direct tools-map object while retaining supported own entries. */
export const getVercelAiSdkToolMap = (
  object: ts.ObjectLiteralExpression,
): IVercelAiSdkToolMapResult => {
  const entries: IVercelAiSdkToolMapEntry[] = [];
  const names = new Set<string>();
  let isUnresolved = false;

  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name)) {
      isUnresolved = true;
      continue;
    }

    const name = getVercelAiSdkPropertyName(property.name);

    if (name === null) {
      isUnresolved = true;
      continue;
    }

    if (ts.isPropertyAssignment(property) && name === '__proto__') {
      continue;
    }

    if (names.has(name)) {
      isUnresolved = true;
      continue;
    }

    names.add(name);

    if (ts.isPropertyAssignment(property)) {
      entries.push(Object.freeze({ expression: unwrapExpression(property.initializer), name }));
    } else if (ts.isShorthandPropertyAssignment(property)) {
      entries.push(Object.freeze({ expression: property.name, name }));
    } else {
      isUnresolved = true;
    }
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    kind: isUnresolved ? 'unresolved' : 'closed',
  });
};
