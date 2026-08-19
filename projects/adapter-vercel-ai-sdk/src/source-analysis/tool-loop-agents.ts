import ts from 'typescript';

import {
  analyzeModuleValueMutations,
  isModuleBindingVisible,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';

import type {
  IVercelAiSdkRelationship,
  IVercelAiSdkSourceAnalysis,
  IVercelAiSdkToolLoopAgentDefinition,
  IVercelAiSdkToolLoopAgentDefinitionResult,
} from '../contracts/index.js';
import { analyzeVercelAiSdkObjectRelationships, hasVercelAiSdkObjectProperty } from './bindings.js';

const RELATIONSHIP_NAMES = ['callOptionsSchema', 'id', 'instructions', 'output', 'tools'] as const;

const getSettingsObject = (
  initializer: ts.Expression,
  analysis: IVercelAiSdkSourceAnalysis,
): ts.ObjectLiteralExpression | null => {
  const candidate = unwrapExpression(initializer);

  if (!ts.isNewExpression(candidate) || candidate.arguments?.length !== 1) {
    return null;
  }

  const constructor = unwrapExpression(candidate.expression);

  if (
    !ts.isIdentifier(constructor) ||
    !analysis.imports.toolLoopAgentNames.has(constructor.text) ||
    !isModuleBindingVisible(constructor, analysis)
  ) {
    return null;
  }

  const settings = unwrapExpression(candidate.arguments[0] as ts.Expression);
  return ts.isObjectLiteralExpression(settings) ? settings : null;
};

const unresolved = (): IVercelAiSdkRelationship => ({ kind: 'unresolved' });

/**
 * Classifies one directly exported ToolLoopAgent and its effective relationships.
 * @param analysis The indexed source module.
 * @param symbol The exact exported ToolLoopAgent symbol.
 * @returns The absent, unsupported, or supported definition state.
 */
export const getVercelAiSdkToolLoopAgentDefinition = (
  analysis: IVercelAiSdkSourceAnalysis,
  symbol: string,
): IVercelAiSdkToolLoopAgentDefinitionResult => {
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

  const object = getSettingsObject(exported.declaration.initializer, analysis);

  if (object === null) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const relationships = analyzeVercelAiSdkObjectRelationships(object, RELATIONSHIP_NAMES);
  const mutations = analyzeModuleValueMutations(analysis, exported.declaration, new Set());
  const hasPrepareCall = hasVercelAiSdkObjectProperty(object, 'prepareCall');
  const hasPrepareStep = hasVercelAiSdkObjectProperty(object, 'prepareStep');
  const relationship = (name: (typeof RELATIONSHIP_NAMES)[number]): IVercelAiSdkRelationship =>
    mutations.hasUnknownMutation || mutations.mutatedMembers.has(name)
      ? unresolved()
      : relationships[name];
  const definition: IVercelAiSdkToolLoopAgentDefinition = Object.freeze({
    callOptionsSchema: relationship('callOptionsSchema'),
    declaration: exported.declaration,
    id: relationship('id'),
    instructions: hasPrepareCall || hasPrepareStep ? unresolved() : relationship('instructions'),
    object,
    output: hasPrepareCall ? unresolved() : relationship('output'),
    tools: hasPrepareCall ? unresolved() : relationship('tools'),
  });

  return Object.freeze({ definition, kind: 'present-supported' });
};
