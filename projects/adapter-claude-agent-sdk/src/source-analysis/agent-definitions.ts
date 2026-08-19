import ts from 'typescript';

import { analyzeObjectRelationships, unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type {
  IClaudeAgentSdkAgentDefinition,
  IClaudeAgentSdkAgentDefinitionResult,
  IClaudeAgentSdkRelationship,
  IClaudeAgentSdkSourceAnalysis,
} from '../contracts/index.js';
import { getClaudeAgentSdkClosedMapEntries } from './collections.js';
import { analyzeClaudeAgentSdkMutations } from './mutations.js';
import { getClaudeAgentSdkQueryWrapper } from './query-wrappers.js';
import { collectClaudeAgentSdkRelationshipIdentifiers } from './tool-availability.js';

const RELATIONSHIP_NAMES = [
  'description',
  'disallowedTools',
  'mcpServers',
  'prompt',
  'tools',
] as const;

const KNOWN_PROPERTIES = new Set([
  ...RELATIONSHIP_NAMES,
  'background',
  'criticalSystemReminder_EXPERIMENTAL',
  'effort',
  'initialPrompt',
  'maxTurns',
  'memory',
  'model',
  'observer',
  'observerMessage',
  'permissionMode',
  'skills',
]);

type IRelationshipName = (typeof RELATIONSHIP_NAMES)[number];

/**
 * Collects every supported direct agents-map use of definitions in one source module.
 * @param analysis The definition source analysis.
 * @returns Identifier occurrences that are registrations rather than mutable escapes.
 */
export const collectClaudeAgentSdkAgentDefinitionReferences = (
  analysis: IClaudeAgentSdkSourceAnalysis,
): ReadonlySet<ts.Identifier> => {
  const agentRelationships = [...analysis.exports.keys()].flatMap((symbol) => {
    const result = getClaudeAgentSdkQueryWrapper(analysis, symbol);

    return result.kind === 'present-supported'
      ? result.wrapper.contexts.map(({ agents }) => agents)
      : [];
  });
  const collectionReferences = collectClaudeAgentSdkRelationshipIdentifiers(agentRelationships);

  return new Set(
    agentRelationships.flatMap((relationship) =>
      (getClaudeAgentSdkClosedMapEntries(relationship, analysis, collectionReferences) ?? [])
        .map(({ value }) => unwrapExpression(value))
        .filter((value): value is ts.Identifier => ts.isIdentifier(value)),
    ),
  );
};

const getDirectPropertyName = (property: ts.ObjectLiteralElementLike): string | null =>
  'name' in property &&
  property.name !== undefined &&
  (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    ? property.name.text
    : null;

const hasUnknownProperty = (config: ts.ObjectLiteralExpression): boolean =>
  config.properties.some((property) => {
    if (ts.isSpreadAssignment(property)) {
      return false;
    }

    const name = getDirectPropertyName(property);
    return name !== null && !KNOWN_PROPERTIES.has(name);
  });

/**
 * Classifies one directly exported immutable AgentDefinition object.
 * @param analysis The indexed source module.
 * @param symbol The exact exported definition symbol.
 * @returns The absent, unsupported, or supported definition state.
 */
export const getClaudeAgentSdkAgentDefinition = (
  analysis: IClaudeAgentSdkSourceAnalysis,
  symbol: string,
): IClaudeAgentSdkAgentDefinitionResult => {
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

  const config = unwrapExpression(exported.declaration.initializer);

  if (!ts.isObjectLiteralExpression(config) || hasUnknownProperty(config)) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const observation = analyzeObjectRelationships(config, RELATIONSHIP_NAMES);
  const relationship = (name: IRelationshipName): IClaudeAgentSdkRelationship =>
    observation.relationships.get(name) ?? { kind: 'unresolved' };
  const definition: IClaudeAgentSdkAgentDefinition = Object.freeze({
    config,
    declaration: exported.declaration,
    description: relationship('description'),
    disallowedTools: relationship('disallowedTools'),
    mcpServers: relationship('mcpServers'),
    prompt: relationship('prompt'),
    tools: relationship('tools'),
  });

  return Object.freeze({ definition, kind: 'present-supported' });
};

/**
 * Applies relationship-specific post-declaration mutation uncertainty.
 * @param analysis The definition source analysis.
 * @param definition The supported initial definition.
 * @param allowedReferences Direct uses in supported agents maps.
 * @returns The definition with only affected relationships unresolved.
 */
export const applyClaudeAgentSdkAgentMutations = (
  analysis: IClaudeAgentSdkSourceAnalysis,
  definition: IClaudeAgentSdkAgentDefinition,
  allowedReferences: ReadonlySet<ts.Identifier>,
): IClaudeAgentSdkAgentDefinition => {
  const mutations = analyzeClaudeAgentSdkMutations(
    analysis,
    definition.declaration,
    allowedReferences,
  );

  if (!mutations.hasUnknownMutation && mutations.mutatedMembers.size === 0) {
    return definition;
  }

  const relationship = (name: IRelationshipName): IClaudeAgentSdkRelationship =>
    mutations.hasUnknownMutation || mutations.mutatedMembers.has(name)
      ? { kind: 'unresolved' }
      : definition[name];

  return Object.freeze({
    ...definition,
    description: relationship('description'),
    disallowedTools: relationship('disallowedTools'),
    mcpServers: relationship('mcpServers'),
    prompt: relationship('prompt'),
    tools: relationship('tools'),
  });
};
