import ts from 'typescript';

import { isModuleBindingVisible, unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type {
  IOpenAiAgentsSdkAgentDefinition,
  IOpenAiAgentsSdkExportState,
  IOpenAiAgentsSdkRelationship,
  IOpenAiAgentsSdkSourceAnalysis,
} from '../contracts/index.js';
import { analyzeOpenAiAgentsSdkMutations } from './mutations.js';

const RELATIONSHIP_NAMES = [
  'handoffDescription',
  'handoffs',
  'instructions',
  'name',
  'outputType',
  'tools',
] as const;

type IRelationshipName = (typeof RELATIONSHIP_NAMES)[number];

const getStaticPropertyName = (name: ts.PropertyName): string | null =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;

const createAbsentRelationships = (): Record<IRelationshipName, IOpenAiAgentsSdkRelationship> => ({
  handoffDescription: { kind: 'absent' },
  handoffs: { kind: 'absent' },
  instructions: { kind: 'absent' },
  name: { kind: 'absent' },
  outputType: { kind: 'absent' },
  tools: { kind: 'absent' },
});

const markAllRelationshipsUnresolved = (
  relationships: Record<IRelationshipName, IOpenAiAgentsSdkRelationship>,
): void => {
  for (const relationshipName of RELATIONSHIP_NAMES) {
    relationships[relationshipName] = { kind: 'unresolved' };
  }
};

const analyzeAgentRelationships = (
  config: ts.ObjectLiteralExpression,
): Record<IRelationshipName, IOpenAiAgentsSdkRelationship> => {
  const relationships = createAbsentRelationships();
  const relationshipNames = new Set<string>(RELATIONSHIP_NAMES);

  for (const property of config.properties) {
    if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name)) {
      markAllRelationshipsUnresolved(relationships);
      continue;
    }

    const propertyName = getStaticPropertyName(property.name);

    if (propertyName === null || !relationshipNames.has(propertyName)) {
      continue;
    }

    const relationshipName = propertyName as IRelationshipName;

    if (relationships[relationshipName].kind !== 'absent') {
      relationships[relationshipName] = { kind: 'unresolved' };
      continue;
    }

    if (ts.isPropertyAssignment(property)) {
      relationships[relationshipName] = {
        expression: unwrapExpression(property.initializer),
        kind: 'present',
      };
    } else if (ts.isShorthandPropertyAssignment(property)) {
      relationships[relationshipName] = { expression: property.name, kind: 'present' };
    } else {
      relationships[relationshipName] = { kind: 'unresolved' };
    }
  }

  return relationships;
};

const getAgentConfig = (
  initializer: ts.Expression,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
): ts.ObjectLiteralExpression | null => {
  const candidate = unwrapExpression(initializer);
  let callArguments: readonly ts.Expression[] | undefined;

  if (ts.isNewExpression(candidate)) {
    const constructor = unwrapExpression(candidate.expression);

    if (
      !ts.isIdentifier(constructor) ||
      !analysis.imports.agentNames.has(constructor.text) ||
      !isModuleBindingVisible(constructor, analysis)
    ) {
      return null;
    }

    callArguments = candidate.arguments;
  } else if (ts.isCallExpression(candidate)) {
    const callee = unwrapExpression(candidate.expression);

    if (
      !ts.isPropertyAccessExpression(callee) ||
      callee.name.text !== 'create' ||
      !ts.isIdentifier(unwrapExpression(callee.expression))
    ) {
      return null;
    }

    const agentIdentifier = unwrapExpression(callee.expression) as ts.Identifier;

    if (
      !analysis.imports.agentNames.has(agentIdentifier.text) ||
      !isModuleBindingVisible(agentIdentifier, analysis)
    ) {
      return null;
    }

    callArguments = candidate.arguments;
  } else {
    return null;
  }

  if (callArguments?.length !== 1) {
    return null;
  }

  const config = unwrapExpression(callArguments[0] as ts.Expression);
  return ts.isObjectLiteralExpression(config) ? config : null;
};

/**
 * Classifies one directly exported Agent binding and its relationship-specific configuration.
 * @param analysis The indexed source module.
 * @param symbol The exact exported Agent symbol.
 * @returns The absent, unsupported, or supported definition state.
 */
export const getOpenAiAgentsSdkAgentDefinition = (
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  symbol: string,
): IOpenAiAgentsSdkExportState & { readonly definition?: IOpenAiAgentsSdkAgentDefinition } => {
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

  const config = getAgentConfig(exported.declaration.initializer, analysis);

  if (config === null) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const relationships = analyzeAgentRelationships(config);
  const definition: IOpenAiAgentsSdkAgentDefinition = Object.freeze({
    config,
    declaration: exported.declaration,
    ...relationships,
  });

  return Object.freeze({
    config,
    declaration: exported.declaration,
    definition,
    kind: 'present-supported',
  });
};

/**
 * Applies relationship-specific post-construction Agent mutation uncertainty.
 * @param analysis The Agent source analysis.
 * @param definition The supported initial Agent definition.
 * @param allowedTargetReferences Direct uses as supported handoff targets.
 * @returns The definition with only affected relationships marked unresolved.
 */
export const applyOpenAiAgentsSdkAgentMutations = (
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  definition: IOpenAiAgentsSdkAgentDefinition,
  allowedTargetReferences: ReadonlySet<ts.Identifier>,
): IOpenAiAgentsSdkAgentDefinition => {
  const mutations = analyzeOpenAiAgentsSdkMutations(
    analysis,
    definition.declaration,
    allowedTargetReferences,
  );

  if (!mutations.hasUnknownMutation && mutations.mutatedMembers.size === 0) {
    return definition;
  }

  const relationship = (name: IRelationshipName): IOpenAiAgentsSdkRelationship =>
    mutations.hasUnknownMutation || mutations.mutatedMembers.has(name)
      ? { kind: 'unresolved' }
      : definition[name];

  return Object.freeze({
    ...definition,
    handoffDescription: relationship('handoffDescription'),
    handoffs: relationship('handoffs'),
    instructions: relationship('instructions'),
    name: relationship('name'),
    outputType: relationship('outputType'),
    tools: relationship('tools'),
  });
};
