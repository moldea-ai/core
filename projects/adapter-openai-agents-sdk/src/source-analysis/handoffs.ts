import ts from 'typescript';

import {
  getSafeModuleConstLiteral,
  isModuleBindingVisible,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';

import type {
  IOpenAiAgentsSdkHandoffRegistration,
  IOpenAiAgentsSdkRelationship,
  IOpenAiAgentsSdkSourceAnalysis,
} from '../contracts/index.js';
import { getOpenAiAgentsSdkAgentDefinition } from './agent-definitions.js';
import { analyzeOpenAiAgentsSdkMutations } from './mutations.js';

const RECOGNIZED_OVERRIDE_NAMES = ['toolDescriptionOverride', 'toolNameOverride'] as const;
type IOverrideName = (typeof RECOGNIZED_OVERRIDE_NAMES)[number];

const TOLERATED_CONFIG_NAMES = new Set([
  'inputFilter',
  'inputType',
  'isEnabled',
  'onHandoff',
  ...RECOGNIZED_OVERRIDE_NAMES,
]);

const getStaticPropertyName = (name: ts.PropertyName): string | null =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;

const analyzeHandoffConfig = (
  expression: ts.Expression | undefined,
): Record<IOverrideName, IOpenAiAgentsSdkRelationship> => {
  const relationships: Record<IOverrideName, IOpenAiAgentsSdkRelationship> = {
    toolDescriptionOverride: { kind: 'absent' },
    toolNameOverride: { kind: 'absent' },
  };

  if (expression === undefined) {
    return relationships;
  }

  const config = unwrapExpression(expression);

  if (!ts.isObjectLiteralExpression(config)) {
    relationships.toolDescriptionOverride = { kind: 'unresolved' };
    relationships.toolNameOverride = { kind: 'unresolved' };
    return relationships;
  }

  for (const property of config.properties) {
    if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name)) {
      relationships.toolDescriptionOverride = { kind: 'unresolved' };
      relationships.toolNameOverride = { kind: 'unresolved' };
      continue;
    }

    const propertyName = getStaticPropertyName(property.name);

    if (propertyName === null || !TOLERATED_CONFIG_NAMES.has(propertyName)) {
      relationships.toolDescriptionOverride = { kind: 'unresolved' };
      relationships.toolNameOverride = { kind: 'unresolved' };
      continue;
    }

    if (!RECOGNIZED_OVERRIDE_NAMES.includes(propertyName as IOverrideName)) {
      continue;
    }

    const relationshipName = propertyName as IOverrideName;

    if (relationships[relationshipName].kind !== 'absent') {
      relationships[relationshipName] = { kind: 'unresolved' };
    } else if (ts.isPropertyAssignment(property)) {
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

const analyzeHandoffCall = (
  expression: ts.Expression,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
): IOpenAiAgentsSdkHandoffRegistration | null => {
  const candidate = unwrapExpression(expression);

  if (
    !ts.isCallExpression(candidate) ||
    candidate.arguments.length < 1 ||
    candidate.arguments.length > 2
  ) {
    return null;
  }

  const helper = unwrapExpression(candidate.expression);

  if (
    !ts.isIdentifier(helper) ||
    !analysis.imports.handoffNames.has(helper.text) ||
    !isModuleBindingVisible(helper, analysis)
  ) {
    return null;
  }

  const target = unwrapExpression(candidate.arguments[0] as ts.Expression);

  if (!ts.isIdentifier(target) || !isModuleBindingVisible(target, analysis)) {
    return null;
  }

  return Object.freeze({
    expression: candidate,
    kind: 'handoff',
    target,
    ...analyzeHandoffConfig(candidate.arguments[1]),
  });
};

const getClosedHandoffArray = (
  relationship: IOpenAiAgentsSdkRelationship,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  allowedCollectionReferences: ReadonlySet<ts.Identifier>,
): readonly ts.Expression[] | null => {
  if (relationship.kind !== 'present') {
    return null;
  }

  const candidate = unwrapExpression(relationship.expression);
  const moduleArray = ts.isArrayLiteralExpression(candidate)
    ? null
    : getSafeModuleConstLiteral(candidate, analysis, allowedCollectionReferences, 'array');
  const array = ts.isArrayLiteralExpression(candidate) ? candidate : moduleArray?.expression;

  if (
    array === undefined ||
    array.elements.some((element) => ts.isOmittedExpression(element) || ts.isSpreadElement(element))
  ) {
    return null;
  }

  return array.elements.map((element) => unwrapExpression(element));
};

/** Collects direct module-array references from supported Agent handoff relationships. */
export const collectOpenAiAgentsSdkHandoffCollectionReferences = (
  relationships: readonly IOpenAiAgentsSdkRelationship[],
): ReadonlySet<ts.Identifier> =>
  new Set(
    relationships.flatMap((relationship) => {
      if (relationship.kind !== 'present') {
        return [];
      }

      const candidate = unwrapExpression(relationship.expression);
      return ts.isIdentifier(candidate) ? [candidate] : [];
    }),
  );

/**
 * Returns every supported expression in one closed Agent handoff collection.
 * @param relationship The Agent handoffs relationship.
 * @param analysis The source containing the collection.
 * @param allowedCollectionReferences All supported references to shared module arrays.
 * @returns Closed collection elements or `null` when the collection is unresolved.
 */
export const getOpenAiAgentsSdkHandoffElements = (
  relationship: IOpenAiAgentsSdkRelationship,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  allowedCollectionReferences: ReadonlySet<ts.Identifier>,
): readonly ts.Expression[] | null =>
  getClosedHandoffArray(relationship, analysis, allowedCollectionReferences);

/**
 * Classifies one direct Agent or handoff(...) registration element.
 * @param element The closed collection element.
 * @param analysis The source containing the element.
 * @param allowedWrapperReferences All direct supported collection uses of module wrappers.
 * @returns The supported registration or `null` for an unresolved target form.
 */
export const analyzeOpenAiAgentsSdkHandoffElement = (
  element: ts.Expression,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  allowedWrapperReferences: ReadonlySet<ts.Identifier>,
): IOpenAiAgentsSdkHandoffRegistration | null => {
  const directCall = analyzeHandoffCall(element, analysis);

  if (directCall !== null) {
    return directCall;
  }

  const candidate = unwrapExpression(element);

  if (!ts.isIdentifier(candidate) || !isModuleBindingVisible(candidate, analysis)) {
    return null;
  }

  const declaration = analysis.moduleConstDeclarations.get(candidate.text);

  if (declaration?.initializer !== undefined) {
    const wrapper = analyzeHandoffCall(declaration.initializer, analysis);

    if (wrapper !== null) {
      const mutations = analyzeOpenAiAgentsSdkMutations(
        analysis,
        declaration,
        allowedWrapperReferences,
      );

      if (mutations.hasUnknownMutation || mutations.mutatedMembers.has('onInvokeHandoff')) {
        return null;
      }

      const toolDescriptionOverride: IOpenAiAgentsSdkRelationship = mutations.mutatedMembers.has(
        'toolDescription',
      )
        ? { kind: 'unresolved' }
        : wrapper.toolDescriptionOverride;
      const toolNameOverride: IOpenAiAgentsSdkRelationship = mutations.mutatedMembers.has(
        'toolName',
      )
        ? { kind: 'unresolved' }
        : wrapper.toolNameOverride;

      return Object.freeze({
        ...wrapper,
        expression: candidate,
        toolDescriptionOverride,
        toolNameOverride,
      });
    }
  }

  const toolDescriptionOverride: IOpenAiAgentsSdkRelationship = { kind: 'absent' };
  const toolNameOverride: IOpenAiAgentsSdkRelationship = { kind: 'absent' };
  const registration: IOpenAiAgentsSdkHandoffRegistration = Object.freeze({
    expression: candidate,
    kind: 'agent',
    target: candidate,
    toolDescriptionOverride,
    toolNameOverride,
  });

  return registration;
};

/**
 * Collects Agent identifier uses that are mechanically supported handoff targets.
 * @param analysis The source containing Agent definitions and handoff collections.
 * @returns Exact target identifiers allowed by Agent mutation analysis.
 */
export const collectOpenAiAgentsSdkHandoffTargetReferences = (
  analysis: IOpenAiAgentsSdkSourceAnalysis,
): ReadonlySet<ts.Identifier> => {
  const definitions = [...analysis.exports.keys()].flatMap((symbol) => {
    const result = getOpenAiAgentsSdkAgentDefinition(analysis, symbol);
    return result.kind === 'present-supported' && result.definition !== undefined
      ? [result.definition]
      : [];
  });
  const relationships = definitions.map(({ handoffs }) => handoffs);
  const collectionReferences = collectOpenAiAgentsSdkHandoffCollectionReferences(relationships);
  const elements = definitions.flatMap(
    ({ handoffs }) =>
      getOpenAiAgentsSdkHandoffElements(handoffs, analysis, collectionReferences) ?? [],
  );
  const allowedWrapperReferences = new Set(
    elements.filter((element): element is ts.Identifier => ts.isIdentifier(element)),
  );
  const targets = new Set<ts.Identifier>();

  for (const element of elements) {
    const registration = analyzeOpenAiAgentsSdkHandoffElement(
      element,
      analysis,
      allowedWrapperReferences,
    );

    if (registration !== null && ts.isIdentifier(registration.target)) {
      targets.add(registration.target);
    }
  }

  return targets;
};
