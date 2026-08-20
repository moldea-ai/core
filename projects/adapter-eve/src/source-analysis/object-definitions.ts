import ts from 'typescript';

import { unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type {
  IEveDefinitionKind,
  IEveDefinitionResult,
  IEveSourceAnalysis,
} from '../contracts/index.js';

const DEFINITION_HELPER_KEYS = Object.freeze({
  agent: 'defineAgent',
  instructions: 'defineInstructions',
  skill: 'defineSkill',
  tool: 'defineTool',
} as const);

/** Returns the exact static name of an ordinary Eve object member. */
export const getEveObjectMemberName = (member: ts.ObjectLiteralElementLike): string | null => {
  if (
    !ts.isPropertyAssignment(member) &&
    !ts.isMethodDeclaration(member) &&
    !ts.isGetAccessorDeclaration(member) &&
    !ts.isSetAccessorDeclaration(member) &&
    !ts.isShorthandPropertyAssignment(member)
  ) {
    return null;
  }

  return ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : null;
};

/** Indexes unique ordinary members without accepting spreads or prototype setters. */
export const getEveObjectMembers = (
  object: ts.ObjectLiteralExpression,
): ReadonlyMap<string, ts.ObjectLiteralElementLike> | null => {
  const members = new Map<string, ts.ObjectLiteralElementLike>();

  for (const member of object.properties) {
    const name = getEveObjectMemberName(member);

    if (
      name === null ||
      name === '__proto__' ||
      members.has(name) ||
      ts.isShorthandPropertyAssignment(member) ||
      ts.isGetAccessorDeclaration(member) ||
      ts.isSetAccessorDeclaration(member)
    ) {
      return null;
    }

    members.set(name, member);
  }

  return members;
};

/** Returns an ordinary property-assignment expression from a closed definition. */
export const getEvePropertyExpression = (
  properties: ReadonlyMap<string, ts.ObjectLiteralElementLike>,
  name: string,
): ts.Expression | null => {
  const property = properties.get(name);

  return property !== undefined && ts.isPropertyAssignment(property)
    ? unwrapExpression(property.initializer)
    : null;
};

/** Classifies one exact direct default-exported Eve helper definition. */
export const getEveDefinition = (
  analysis: IEveSourceAnalysis,
  kind: IEveDefinitionKind,
): IEveDefinitionResult => {
  if (analysis.defaultExports.length === 0) {
    return Object.freeze({ hasDefaultExport: false, kind: 'absent' });
  }

  if (analysis.defaultExports.length !== 1) {
    return Object.freeze({ hasDefaultExport: true, kind: 'present-unsupported' });
  }

  const declaration = analysis.defaultExports[0];

  if (declaration === undefined) {
    return Object.freeze({ hasDefaultExport: false, kind: 'absent' });
  }

  const expression = unwrapExpression(declaration.expression);

  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) {
    return Object.freeze({ hasDefaultExport: true, kind: 'present-unsupported' });
  }

  const callee = unwrapExpression(expression.expression);
  const helperKey = DEFINITION_HELPER_KEYS[kind];

  if (!ts.isIdentifier(callee) || !analysis.helperImports[helperKey].has(callee.text)) {
    return Object.freeze({ hasDefaultExport: true, kind: 'present-unsupported' });
  }

  const argument = expression.arguments[0];

  if (argument === undefined) {
    return Object.freeze({ hasDefaultExport: true, kind: 'present-unsupported' });
  }

  const object = unwrapExpression(argument);

  if (!ts.isObjectLiteralExpression(object)) {
    return Object.freeze({ hasDefaultExport: true, kind: 'present-unsupported' });
  }

  const properties = getEveObjectMembers(object);

  return properties === null
    ? Object.freeze({ hasDefaultExport: true, kind: 'present-unsupported' })
    : Object.freeze({
        call: expression,
        declaration,
        kind: 'present-supported',
        object,
        properties,
      });
};
