import ts from 'typescript';

import {
  analyzeModuleValueMutations,
  isModuleBindingVisible,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';

import type {
  ILangChainAgentDefinition,
  ILangChainAgentDefinitionResult,
  ILangChainRelationship,
  ILangChainSourceAnalysis,
} from '../contracts/index.js';
import { getLangChainPropertyName, hasLangChainPrototypeSetter } from './bindings.js';

const CONFIGURATION_PROPERTY_NAMES = new Set([
  'model',
  'tools',
  'systemPrompt',
  'stateSchema',
  'contextSchema',
  'checkpointer',
  'store',
  'responseFormat',
  'middleware',
  'name',
  'description',
  'includeAgentName',
  'signal',
  'version',
  'streamTransformers',
]);
const RELATIONSHIP_NAMES = [
  'middleware',
  'name',
  'responseFormat',
  'systemPrompt',
  'tools',
] as const;
const SAFE_AGENT_METHOD_CALLS = new Set(['invoke', 'stream', 'streamEvents']);
const AGENT_INVOCATION_MEMBER_NAMES = new Set(['invoke', 'stream', 'streamEvents']);

const createRelationships = (): Record<
  (typeof RELATIONSHIP_NAMES)[number],
  ILangChainRelationship
> =>
  Object.fromEntries(
    RELATIONSHIP_NAMES.map((name) => [name, { expression: null, kind: 'absent' }]),
  ) as Record<(typeof RELATIONSHIP_NAMES)[number], ILangChainRelationship>;

const getAgentObject = (
  initializer: ts.Expression,
  analysis: ILangChainSourceAnalysis,
): ts.ObjectLiteralExpression | null => {
  const candidate = unwrapExpression(initializer);

  if (!ts.isCallExpression(candidate) || candidate.arguments.length !== 1) {
    return null;
  }

  const callee = unwrapExpression(candidate.expression);

  if (
    !ts.isIdentifier(callee) ||
    !analysis.imports.createAgentNames.has(callee.text) ||
    !isModuleBindingVisible(callee, analysis)
  ) {
    return null;
  }

  const object = unwrapExpression(candidate.arguments[0] as ts.Expression);
  return ts.isObjectLiteralExpression(object) ? object : null;
};

const analyzeConfiguration = (
  object: ts.ObjectLiteralExpression,
): Record<(typeof RELATIONSHIP_NAMES)[number], ILangChainRelationship> | null => {
  const hasPrototypeSetter = hasLangChainPrototypeSetter(object);
  const relationships = createRelationships();
  const seenRelationships = new Set<string>();
  let hasModel = false;
  let isModelClosed = false;

  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name)) {
      isModelClosed = false;

      for (const name of RELATIONSHIP_NAMES) {
        relationships[name] = { kind: 'unresolved' };
      }

      continue;
    }

    const name = getLangChainPropertyName(property.name);

    if (hasPrototypeSetter && name === '__proto__' && ts.isPropertyAssignment(property)) {
      continue;
    }

    if (name === null || !CONFIGURATION_PROPERTY_NAMES.has(name)) {
      return null;
    }

    if (name === 'model') {
      if (hasModel || !ts.isPropertyAssignment(property)) {
        return null;
      }

      hasModel = true;
      isModelClosed = true;
      continue;
    }

    if (!RELATIONSHIP_NAMES.includes(name as (typeof RELATIONSHIP_NAMES)[number])) {
      continue;
    }

    const relationshipName = name as (typeof RELATIONSHIP_NAMES)[number];

    if (seenRelationships.has(name)) {
      relationships[relationshipName] = { kind: 'unresolved' };
      continue;
    }

    seenRelationships.add(name);
    relationships[relationshipName] = ts.isPropertyAssignment(property)
      ? { expression: unwrapExpression(property.initializer), kind: 'present' }
      : { kind: 'unresolved' };
  }

  if (!hasModel || !isModelClosed) {
    return null;
  }

  if (hasPrototypeSetter) {
    for (const name of RELATIONSHIP_NAMES) {
      relationships[name] = { kind: 'unresolved' };
    }
  }

  return relationships;
};

/** Classifies one directly exported package-root `createAgent(...)` definition. */
export const getLangChainAgentDefinition = (
  analysis: ILangChainSourceAnalysis,
  symbol: string,
): ILangChainAgentDefinitionResult => {
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

  const object = getAgentObject(exported.declaration.initializer, analysis);
  const relationships = object === null ? null : analyzeConfiguration(object);

  if (object === null || relationships === null) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const mutations = analyzeModuleValueMutations(
    analysis,
    exported.declaration,
    new Set(),
    SAFE_AGENT_METHOD_CALLS,
  );

  const hasInvocationMutation = [...AGENT_INVOCATION_MEMBER_NAMES].some((name) =>
    mutations.mutatedMembers.has(name),
  );
  const hasBroadRelationshipMutation =
    mutations.hasUnknownMutation ||
    [...mutations.mutatedMembers].some(
      (name) =>
        name !== 'name' &&
        !RELATIONSHIP_NAMES.includes(name as (typeof RELATIONSHIP_NAMES)[number]) &&
        !AGENT_INVOCATION_MEMBER_NAMES.has(name),
    );
  const relationship = (name: (typeof RELATIONSHIP_NAMES)[number]): ILangChainRelationship => {
    const isInvocationRelationship = [
      'middleware',
      'responseFormat',
      'systemPrompt',
      'tools',
    ].includes(name);

    return hasBroadRelationshipMutation ||
      (hasInvocationMutation && isInvocationRelationship) ||
      mutations.mutatedMembers.has(name)
      ? { kind: 'unresolved' }
      : relationships[name];
  };
  const definition: ILangChainAgentDefinition = Object.freeze({
    configuredTools: relationships.tools,
    declaration: exported.declaration,
    middleware: relationship('middleware'),
    name:
      mutations.hasUnknownMutation || mutations.mutatedMembers.has('name')
        ? ({ kind: 'unresolved' } as const)
        : relationships.name,
    object,
    responseFormat: relationship('responseFormat'),
    systemPrompt: relationship('systemPrompt'),
    tools: relationship('tools'),
  });

  return Object.freeze({ definition, kind: 'present-supported' });
};
