import ts from 'typescript';

import {
  analyzeObjectRelationships,
  getClosedObjectProperties,
  isModuleBindingVisible,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';

import type {
  IClaudeAgentSdkMcpServerDefinition,
  IClaudeAgentSdkSourceAnalysis,
} from '../contracts/index.js';
import { getClaudeAgentSdkClosedArray } from './collections.js';

const SUPPORTED_PROPERTIES = new Set(['alwaysLoad', 'instructions', 'name', 'tools', 'version']);

const hasUnknownProperty = (config: ts.ObjectLiteralExpression): boolean => {
  const properties = getClosedObjectProperties(config);
  return (
    properties === null || [...properties.keys()].some((name) => !SUPPORTED_PROPERTIES.has(name))
  );
};

/**
 * Classifies one module-local createSdkMcpServer(...) declaration.
 * @param analysis The indexed server source.
 * @param symbol The exact module-local binding name.
 * @returns The supported server definition or `null`.
 */
export const getClaudeAgentSdkMcpServerDefinition = (
  analysis: IClaudeAgentSdkSourceAnalysis,
  symbol: string,
): IClaudeAgentSdkMcpServerDefinition | null => {
  const declaration = analysis.moduleConstDeclarations.get(symbol);

  if (declaration?.initializer === undefined) {
    return null;
  }

  const initializer = unwrapExpression(declaration.initializer);

  if (!ts.isCallExpression(initializer) || initializer.arguments.length !== 1) {
    return null;
  }

  const helper = unwrapExpression(initializer.expression);

  if (
    !ts.isIdentifier(helper) ||
    !analysis.imports.createSdkMcpServerNames.has(helper.text) ||
    !isModuleBindingVisible(helper, analysis)
  ) {
    return null;
  }

  const config = unwrapExpression(initializer.arguments[0] as ts.Expression);

  if (!ts.isObjectLiteralExpression(config) || hasUnknownProperty(config)) {
    return null;
  }

  const observation = analyzeObjectRelationships(config, ['name', 'tools', 'version']);
  const name = observation.relationships.get('name');
  const tools = observation.relationships.get('tools') ?? { kind: 'unresolved' };
  const version = observation.relationships.get('version') ?? { kind: 'unresolved' };

  if (name?.kind !== 'present' || tools.kind === 'absent') {
    return null;
  }

  return Object.freeze({
    config,
    declaration,
    name: name.expression,
    tools,
    version,
  });
};

/**
 * Collects direct tool identifiers used by supported module-local SDK MCP servers.
 * @param analysis The source containing tool and server declarations.
 * @returns Identifier occurrences that are registrations rather than value escapes.
 */
export const collectClaudeAgentSdkMcpToolReferences = (
  analysis: IClaudeAgentSdkSourceAnalysis,
): ReadonlySet<ts.Identifier> => {
  const definitions = [...analysis.moduleConstDeclarations.keys()].flatMap((symbol) => {
    const definition = getClaudeAgentSdkMcpServerDefinition(analysis, symbol);
    return definition === null ? [] : [definition];
  });
  const collectionReferences = new Set(
    definitions.flatMap(({ tools }) => {
      if (tools.kind !== 'present') {
        return [];
      }

      const candidate = unwrapExpression(tools.expression);
      return ts.isIdentifier(candidate) ? [candidate] : [];
    }),
  );

  return new Set(
    definitions.flatMap(({ tools }) =>
      (getClaudeAgentSdkClosedArray(tools, analysis, collectionReferences) ?? []).filter(
        (element): element is ts.Identifier => ts.isIdentifier(element),
      ),
    ),
  );
};
