import ts from 'typescript';

import {
  analyzeObjectRelationships,
  getRuntimeExport,
  isModuleBindingVisible,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';

import type {
  IClaudeAgentSdkQueryContext,
  IClaudeAgentSdkQueryWrapper,
  IClaudeAgentSdkRelationship,
  IClaudeAgentSdkSourceAnalysis,
} from '../contracts/index.js';

const OPTION_RELATIONSHIP_NAMES = [
  'agent',
  'agents',
  'disallowedTools',
  'mcpServers',
  'outputFormat',
  'systemPrompt',
  'toolAliases',
  'tools',
] as const;

type IOptionRelationshipName = (typeof OPTION_RELATIONSHIP_NAMES)[number];

export type IClaudeAgentSdkQueryWrapperResult =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' }
  | { readonly kind: 'present-supported'; readonly wrapper: IClaudeAgentSdkQueryWrapper };

const createRelationships = (
  relationship: IClaudeAgentSdkRelationship,
): ReadonlyMap<IOptionRelationshipName, IClaudeAgentSdkRelationship> =>
  new Map(OPTION_RELATIONSHIP_NAMES.map((name) => [name, relationship]));

const getQueryContext = (call: ts.CallExpression): IClaudeAgentSdkQueryContext | null => {
  if (call.arguments.length !== 1) {
    return null;
  }

  const input = unwrapExpression(call.arguments[0] as ts.Expression);

  if (!ts.isObjectLiteralExpression(input)) {
    return null;
  }

  const inputObservation = analyzeObjectRelationships(input, ['options']);
  const optionsRelationship = inputObservation.relationships.get('options');
  let relationships: ReadonlyMap<IOptionRelationshipName, IClaudeAgentSdkRelationship>;

  if (optionsRelationship?.kind === 'absent') {
    relationships = createRelationships({ kind: 'absent' });
  } else if (optionsRelationship?.kind !== 'present') {
    relationships = createRelationships({ kind: 'unresolved' });
  } else {
    const options = unwrapExpression(optionsRelationship.expression);

    relationships = ts.isObjectLiteralExpression(options)
      ? (analyzeObjectRelationships(options, OPTION_RELATIONSHIP_NAMES)
          .relationships as ReadonlyMap<IOptionRelationshipName, IClaudeAgentSdkRelationship>)
      : createRelationships({ kind: 'unresolved' });
  }

  const relationship = (name: IOptionRelationshipName): IClaudeAgentSdkRelationship =>
    relationships.get(name) ?? { kind: 'unresolved' };

  return Object.freeze({
    agents: relationship('agents'),
    agentSelection: relationship('agent'),
    call,
    disallowedTools: relationship('disallowedTools'),
    mcpServers: relationship('mcpServers'),
    outputFormat: relationship('outputFormat'),
    systemPrompt: relationship('systemPrompt'),
    toolAliases: relationship('toolAliases'),
    tools: relationship('tools'),
  });
};

const isNestedBoundary = (node: ts.Node): boolean =>
  ts.isFunctionLike(node) || ts.isClassLike(node) || ts.isClassStaticBlockDeclaration(node);

/**
 * Classifies one directly exported query wrapper and its complete direct-call set.
 * @param analysis The indexed runtime source.
 * @param symbol The exact bound runtime-agent symbol.
 * @returns The absent, unsupported, or supported query-wrapper state.
 */
export const getClaudeAgentSdkQueryWrapper = (
  analysis: IClaudeAgentSdkSourceAnalysis,
  symbol: string,
): IClaudeAgentSdkQueryWrapperResult => {
  const runtimeExport = getRuntimeExport(analysis, symbol);

  if (runtimeExport.kind === 'absent') {
    return Object.freeze({ kind: 'absent' });
  }

  if (runtimeExport.kind !== 'present-supported' || runtimeExport.body === undefined) {
    return Object.freeze({ declaration: runtimeExport.declaration, kind: 'present-unsupported' });
  }

  const contexts: IClaudeAgentSdkQueryContext[] = [];
  let hasAmbiguousCandidate = false;

  const visit = (node: ts.Node, isNested: boolean): void => {
    if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);

      if (
        ts.isIdentifier(callee) &&
        analysis.imports.queryNames.has(callee.text) &&
        isModuleBindingVisible(callee, analysis)
      ) {
        if (isNested || node.questionDotToken !== undefined) {
          hasAmbiguousCandidate = true;
        } else {
          const context = getQueryContext(node);

          if (context === null) {
            hasAmbiguousCandidate = true;
          } else {
            contexts.push(context);
          }
        }
      }
    }

    const childIsNested = isNested || (node !== runtimeExport.body && isNestedBoundary(node));

    node.forEachChild((child) => visit(child, childIsNested));
  };

  visit(runtimeExport.body, false);

  if (contexts.length === 0) {
    return Object.freeze({ declaration: runtimeExport.declaration, kind: 'present-unsupported' });
  }

  return Object.freeze({
    kind: 'present-supported',
    wrapper: Object.freeze({
      contexts: Object.freeze(contexts),
      declaration: runtimeExport.declaration,
      hasAmbiguousCandidate,
    }),
  });
};
