import ts from 'typescript';

import type { ICloudflareAgentsMethod } from '../contracts/index.js';
import { getCloudflareAgentsPropertyName } from './bindings.js';

/** Returns a supported non-generator block-bodied method with an exact parameter count. */
export const getCloudflareAgentsMethod = (
  methods: ReadonlyMap<string, ICloudflareAgentsMethod>,
  name: string,
  parameterCount: number,
): ICloudflareAgentsMethod | null => {
  const method = methods.get(name);

  if (
    method === undefined ||
    method.declaration.asteriskToken !== undefined ||
    method.declaration.parameters.length !== parameterCount ||
    method.declaration.parameters.some(
      (parameter) =>
        !ts.isIdentifier(parameter.name) ||
        parameter.dotDotDotToken !== undefined ||
        parameter.initializer !== undefined,
    )
  ) {
    return null;
  }

  return method;
};

/** Indexes static method names while rejecting overloads and duplicate implementations. */
export const indexCloudflareAgentsMethods = (
  declaration: ts.ClassDeclaration,
): ReadonlyMap<string, ICloudflareAgentsMethod> | null => {
  const methods = new Map<string, ICloudflareAgentsMethod>();

  for (const member of declaration.members) {
    if (!ts.isMethodDeclaration(member)) {
      continue;
    }

    const name = getCloudflareAgentsPropertyName(member.name);

    if (name === null || member.body === undefined || methods.has(name)) {
      return null;
    }

    methods.set(name, Object.freeze({ body: member.body, declaration: member }));
  }

  return methods;
};
