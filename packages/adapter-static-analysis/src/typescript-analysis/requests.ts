import ts from 'typescript';

import type {
  IStaticAnalysisRequest,
  IStaticAnalysisRequestConfig,
  IStaticAnalysisRequestRelationship,
  IStaticAnalysisRequests,
  IStaticAnalysisSource,
} from '../types.js';
import { isModuleBindingVisible } from './bindings.js';
import { unwrapExpression } from './expressions.js';

interface IAccessSegment {
  readonly isDirect: boolean;
  readonly name: string | null;
  readonly target: ts.Expression;
}

interface IMutableRelationshipState {
  directPropertyCount: number;
  relationship: IStaticAnalysisRequestRelationship;
}

const getAccessSegment = (expression: ts.Expression): IAccessSegment | null => {
  const candidate = unwrapExpression(expression);

  if (ts.isPropertyAccessExpression(candidate)) {
    return {
      isDirect: candidate.questionDotToken === undefined,
      name: candidate.name.text,
      target: candidate.expression,
    };
  }

  if (ts.isElementAccessExpression(candidate)) {
    const argument = candidate.argumentExpression;
    const name =
      argument !== undefined &&
      (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
        ? argument.text
        : null;

    return { isDirect: false, name, target: candidate.expression };
  }

  return null;
};

const classifyKnownClientResourceAccess = (
  expression: ts.Expression,
  analysis: IStaticAnalysisSource,
  config: IStaticAnalysisRequestConfig,
): 'direct' | 'indirect' | null => {
  const resourceAccess = getAccessSegment(expression);

  if (
    resourceAccess === null ||
    (resourceAccess.name !== null && resourceAccess.name !== config.resourceName)
  ) {
    return null;
  }

  const client = unwrapExpression(resourceAccess.target);

  if (
    !ts.isIdentifier(client) ||
    !analysis.clientNames.has(client.text) ||
    !isModuleBindingVisible(client, analysis)
  ) {
    return null;
  }

  return resourceAccess.isDirect ? 'direct' : 'indirect';
};

const classifyCreateAccess = (
  expression: ts.Expression,
  analysis: IStaticAnalysisSource,
  config: IStaticAnalysisRequestConfig,
): 'direct' | 'indirect' | null => {
  const methodAccess = getAccessSegment(expression);

  if (
    methodAccess === null ||
    (methodAccess.name !== null && methodAccess.name !== config.methodName)
  ) {
    return null;
  }

  const resourceAccess = getAccessSegment(methodAccess.target);

  if (
    resourceAccess === null ||
    (resourceAccess.name !== null && resourceAccess.name !== config.resourceName)
  ) {
    return null;
  }

  const knownAccess = classifyKnownClientResourceAccess(methodAccess.target, analysis, config);

  if (knownAccess === null) {
    return 'indirect';
  }

  return methodAccess.isDirect && knownAccess === 'direct' ? 'direct' : 'indirect';
};

const classifyRequestCall = (
  call: ts.CallExpression,
  analysis: IStaticAnalysisSource,
  config: IStaticAnalysisRequestConfig,
): 'ambiguous' | 'recognized' | 'unrelated' => {
  const access = classifyCreateAccess(call.expression, analysis, config);

  if (access === null) {
    return 'unrelated';
  }

  if (access === 'indirect' || call.questionDotToken !== undefined) {
    return 'ambiguous';
  }

  if (!config.acceptedArgumentCounts.includes(call.arguments.length)) {
    return 'ambiguous';
  }

  const request = call.arguments[0];

  if (request === undefined || !ts.isObjectLiteralExpression(unwrapExpression(request))) {
    return 'ambiguous';
  }

  return 'recognized';
};

const getDirectPropertyName = (name: ts.PropertyName): string | null => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }

  return null;
};

const getPotentialRelationshipNames = (
  name: ts.PropertyName,
  relationshipNames: readonly string[],
): readonly string[] => {
  const directName = getDirectPropertyName(name);

  if (directName !== null) {
    return relationshipNames.includes(directName) ? [directName] : [];
  }

  if (!ts.isComputedPropertyName(name)) {
    return [];
  }

  const expression = unwrapExpression(name.expression);

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return relationshipNames.includes(expression.text) ? [expression.text] : [];
  }

  if (
    ts.isNumericLiteral(expression) ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword ||
    expression.kind === ts.SyntaxKind.NullKeyword
  ) {
    return [];
  }

  return relationshipNames;
};

/**
 * Classifies selected properties on one object literal without interpreting unrelated values.
 * @param object The object literal whose direct properties are inspected.
 * @param relationshipNames The exact properties owned by the caller.
 * @returns Independent closed, absent, or unresolved relationship observations.
 */
export const analyzeObjectRelationships = (
  object: ts.ObjectLiteralExpression,
  relationshipNames: readonly string[],
): IStaticAnalysisRequest => {
  const states = new Map<string, IMutableRelationshipState>(
    relationshipNames.map((name) => [
      name,
      { directPropertyCount: 0, relationship: { kind: 'absent' } },
    ]),
  );

  const markUnresolved = (names: readonly string[]): void => {
    for (const name of names) {
      const state = states.get(name);

      if (state !== undefined) {
        state.relationship = { kind: 'unresolved' };
      }
    }
  };

  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      markUnresolved(relationshipNames);
      continue;
    }

    const potentialNames = getPotentialRelationshipNames(property.name, relationshipNames);
    const relationshipExpression = ts.isPropertyAssignment(property)
      ? property.initializer
      : ts.isShorthandPropertyAssignment(property)
        ? property.name
        : null;

    if (relationshipExpression === null) {
      markUnresolved(potentialNames);
      continue;
    }

    const directName = getDirectPropertyName(property.name);

    if (directName === null || !relationshipNames.includes(directName)) {
      markUnresolved(potentialNames);
      continue;
    }

    const state = states.get(directName);

    if (state === undefined) {
      continue;
    }

    state.directPropertyCount += 1;
    state.relationship =
      state.directPropertyCount === 1
        ? { expression: unwrapExpression(relationshipExpression), kind: 'present' }
        : { kind: 'unresolved' };
  }

  return Object.freeze({
    object,
    relationships: new Map(
      [...states].map(([name, state]) => [name, Object.freeze(state.relationship)]),
    ),
  });
};

const isNestedLexicalBoundary = (node: ts.Node): boolean =>
  ts.isFunctionLike(node) || ts.isClassLike(node) || ts.isClassStaticBlockDeclaration(node);

const skipTransparentParents = (node: ts.Node): ts.Node => {
  let current = node;

  while (
    ts.isAsExpression(current.parent) ||
    ts.isParenthesizedExpression(current.parent) ||
    ts.isSatisfiesExpression(current.parent)
  ) {
    current = current.parent;
  }

  return current;
};

const isAssignmentOperator = (kind: ts.SyntaxKind): boolean =>
  kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;

const isResourceAccessCreateTarget = (
  expression: ts.Expression,
  analysis: IStaticAnalysisSource,
  config: IStaticAnalysisRequestConfig,
): boolean => {
  const candidate = skipTransparentParents(expression);
  const parent = candidate.parent;

  if (!ts.isPropertyAccessExpression(parent) && !ts.isElementAccessExpression(parent)) {
    return false;
  }

  const access = getAccessSegment(parent);

  return (
    access !== null &&
    unwrapExpression(access.target) === unwrapExpression(expression) &&
    classifyCreateAccess(parent, analysis, config) !== null
  );
};

const isKnownClientResourceTarget = (
  identifier: ts.Identifier,
  analysis: IStaticAnalysisSource,
  config: IStaticAnalysisRequestConfig,
): boolean => {
  const candidate = skipTransparentParents(identifier);
  const parent = candidate.parent;

  return (
    (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
    parent.expression === candidate &&
    classifyKnownClientResourceAccess(parent, analysis, config) !== null
  );
};

const getClientValueExpression = (identifier: ts.Identifier): ts.Node => {
  let current = skipTransparentParents(identifier);

  while (true) {
    const parent = current.parent;
    const isFlowingConditionalBranch =
      ts.isConditionalExpression(parent) && parent.condition !== current;
    const isFlowingBinaryBranch =
      ts.isBinaryExpression(parent) &&
      (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        parent.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        (parent.operatorToken.kind === ts.SyntaxKind.CommaToken && parent.right === current));
    const isFlowingWrapper =
      (ts.isAwaitExpression(parent) || ts.isNonNullExpression(parent)) &&
      parent.expression === current;

    if (!isFlowingConditionalBranch && !isFlowingBinaryBranch && !isFlowingWrapper) {
      return current;
    }

    current = skipTransparentParents(parent);
  }
};

const isClientEscape = (identifier: ts.Identifier): boolean => {
  const expression = getClientValueExpression(identifier);
  const parent = expression.parent;

  if (
    ts.isVariableDeclaration(parent) &&
    parent.initializer !== undefined &&
    skipTransparentParents(parent.initializer) === expression
  ) {
    return true;
  }

  if (
    ts.isReturnStatement(parent) ||
    ts.isYieldExpression(parent) ||
    (ts.isArrowFunction(parent) && parent.body === expression) ||
    ts.isSpreadElement(parent) ||
    ts.isSpreadAssignment(parent) ||
    ts.isShorthandPropertyAssignment(parent) ||
    ts.isArrayLiteralExpression(parent) ||
    ts.isExportAssignment(parent)
  ) {
    return true;
  }

  if (ts.isPropertyAssignment(parent)) {
    return skipTransparentParents(parent.initializer) === expression;
  }

  if (
    (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
    parent.arguments?.some((argument) => skipTransparentParents(argument) === expression) === true
  ) {
    return true;
  }

  return ts.isBinaryExpression(parent) && isAssignmentOperator(parent.operatorToken.kind);
};

/**
 * Finds direct provider requests owned by one runtime-agent body.
 * @param analysis The indexed runtime source.
 * @param body The supported runtime-agent lexical body.
 * @param config The provider call and relationship contract.
 * @param signal The active inspection signal.
 * @returns Recognized requests and conservative ambiguity state.
 * @throws If request analysis is aborted.
 */
export const analyzeClientRequests = (
  analysis: IStaticAnalysisSource,
  body: ts.ConciseBody,
  config: IStaticAnalysisRequestConfig,
  signal?: AbortSignal,
): IStaticAnalysisRequests => {
  const requests: IStaticAnalysisRequest[] = [];
  let hasAmbiguousCandidate = false;

  if (isNestedLexicalBoundary(body)) {
    return Object.freeze({ hasAmbiguousCandidate: false, requests: Object.freeze([]) });
  }

  const visit = (node: ts.Node, isRoot: boolean): void => {
    signal?.throwIfAborted();

    if (!isRoot && isNestedLexicalBoundary(node)) {
      return;
    }

    if (ts.isCallExpression(node)) {
      const classification = classifyRequestCall(node, analysis, config);

      if (classification === 'ambiguous') {
        hasAmbiguousCandidate = true;
      } else if (classification === 'recognized') {
        const request = unwrapExpression(node.arguments[0] as ts.Expression);
        requests.push(
          analyzeObjectRelationships(
            request as ts.ObjectLiteralExpression,
            config.relationshipNames,
          ),
        );
      }
    }

    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const access = classifyCreateAccess(node, analysis, config);

      if (access !== null) {
        let candidate: ts.Node = node;

        while (
          ts.isAsExpression(candidate.parent) ||
          ts.isParenthesizedExpression(candidate.parent) ||
          ts.isSatisfiesExpression(candidate.parent)
        ) {
          candidate = candidate.parent;
        }

        if (!ts.isCallExpression(candidate.parent) || candidate.parent.expression !== candidate) {
          hasAmbiguousCandidate = true;
        }
      }

      const resourceAccess = classifyKnownClientResourceAccess(node, analysis, config);

      if (
        resourceAccess !== null &&
        (resourceAccess === 'indirect' || !isResourceAccessCreateTarget(node, analysis, config))
      ) {
        hasAmbiguousCandidate = true;
      }
    }

    if (
      ts.isIdentifier(node) &&
      analysis.clientNames.has(node.text) &&
      isModuleBindingVisible(node, analysis) &&
      !isKnownClientResourceTarget(node, analysis, config) &&
      isClientEscape(node)
    ) {
      hasAmbiguousCandidate = true;
    }

    ts.forEachChild(node, (child) => visit(child, false));
  };

  visit(body, true);
  signal?.throwIfAborted();

  return Object.freeze({ hasAmbiguousCandidate, requests: Object.freeze(requests) });
};

/**
 * Resolves a closed array whose values are direct identifiers.
 * @param expression The inline or module-owned array literal.
 * @returns Its ordered identifiers or `null` when the array is not closed.
 */
export const getClosedArrayIdentifiers = (
  expression: ts.ArrayLiteralExpression,
): readonly ts.Identifier[] | null => {
  const identifiers: ts.Identifier[] = [];

  for (const element of expression.elements) {
    if (ts.isOmittedExpression(element) || ts.isSpreadElement(element)) {
      return null;
    }

    const candidate = unwrapExpression(element);

    if (!ts.isIdentifier(candidate)) {
      return null;
    }

    identifiers.push(candidate);
  }

  return identifiers;
};

const SAFE_ARRAY_METHODS = new Set([
  'at',
  'concat',
  'entries',
  'flat',
  'includes',
  'indexOf',
  'join',
  'keys',
  'lastIndexOf',
  'slice',
  'toLocaleString',
  'toReversed',
  'toSorted',
  'toSpliced',
  'toString',
  'values',
  'with',
]);

const isDirectToolRequestPropertyUse = (
  identifier: ts.Identifier,
  analysis: IStaticAnalysisSource,
  config: IStaticAnalysisRequestConfig,
): boolean => {
  if (config.toolRelationshipName === undefined) {
    return false;
  }

  const expression = skipTransparentParents(identifier);
  const property = expression.parent;
  const isToolProperty =
    (ts.isShorthandPropertyAssignment(property) &&
      property.name.text === config.toolRelationshipName) ||
    (ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === config.toolRelationshipName) ||
        (ts.isStringLiteral(property.name) &&
          property.name.text === config.toolRelationshipName)) &&
      skipTransparentParents(property.initializer) === expression);

  if (!isToolProperty || !ts.isObjectLiteralExpression(property.parent)) {
    return false;
  }

  const request = skipTransparentParents(property.parent);
  const call = request.parent;

  if (
    !ts.isCallExpression(call) ||
    !config.acceptedArgumentCounts.includes(call.arguments.length) ||
    skipTransparentParents(call.arguments[0] as ts.Expression) !== request
  ) {
    return false;
  }

  return classifyCreateAccess(call.expression, analysis, config) === 'direct';
};

const isArrayMemberAssignmentTarget = (member: ts.Expression): boolean => {
  let current = skipTransparentParents(member);

  while (true) {
    const parent = current.parent;

    if (ts.isBinaryExpression(parent) && isAssignmentOperator(parent.operatorToken.kind)) {
      return parent.left === current;
    }

    if (
      (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
      parent.operand === current &&
      (parent.operator === ts.SyntaxKind.PlusPlusToken ||
        parent.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      return true;
    }

    if (ts.isDeleteExpression(parent) && parent.expression === current) {
      return true;
    }

    if (
      (ts.isForInStatement(parent) || ts.isForOfStatement(parent)) &&
      parent.initializer === current
    ) {
      return true;
    }

    if (
      ts.isPropertyAssignment(parent) ||
      ts.isSpreadAssignment(parent) ||
      ts.isSpreadElement(parent) ||
      ts.isArrayLiteralExpression(parent) ||
      ts.isObjectLiteralExpression(parent)
    ) {
      current = skipTransparentParents(parent);
      continue;
    }

    return false;
  }
};

const isDisallowedArrayMemberUse = (
  member: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): boolean => {
  if (isArrayMemberAssignmentTarget(member)) {
    return true;
  }

  const candidate = skipTransparentParents(member);
  const parent = candidate.parent;

  if (!ts.isCallExpression(parent) || parent.expression !== candidate) {
    return false;
  }

  if (ts.isPropertyAccessExpression(member)) {
    return !SAFE_ARRAY_METHODS.has(member.name.text);
  }

  const argument = member.argumentExpression;
  const methodName =
    argument !== undefined &&
    (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
      ? argument.text
      : null;

  return methodName === null || !SAFE_ARRAY_METHODS.has(methodName);
};

const isDisallowedArrayUse = (
  identifier: ts.Identifier,
  analysis: IStaticAnalysisSource,
  config: IStaticAnalysisRequestConfig,
): boolean => {
  if (isDirectToolRequestPropertyUse(identifier, analysis, config)) {
    return false;
  }

  const expression = skipTransparentParents(identifier);
  const parent = expression.parent;

  if (ts.isPropertyAccessExpression(parent) && parent.expression === expression) {
    return isDisallowedArrayMemberUse(parent);
  }

  if (ts.isElementAccessExpression(parent) && parent.expression === expression) {
    return isDisallowedArrayMemberUse(parent);
  }

  return true;
};

/**
 * Indexes immutable module-local arrays through one AST traversal.
 * @param analysis The preliminary indexed source.
 * @param config The provider call and tool relationship contract.
 * @returns Module array names with no disallowed use.
 */
export const indexSafeModuleArrayNames = (
  analysis: IStaticAnalysisSource,
  config: IStaticAnalysisRequestConfig,
): ReadonlySet<string> => {
  if (config.toolRelationshipName === undefined) {
    return new Set();
  }

  const unsafeNames = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const moduleArray = analysis.moduleArrays.get(node.text);

      if (
        moduleArray !== undefined &&
        node !== moduleArray.declaration.name &&
        !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) &&
        !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
        isModuleBindingVisible(node, analysis) &&
        isDisallowedArrayUse(node, analysis, config)
      ) {
        unsafeNames.add(node.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(analysis.sourceFile);
  return new Set([...analysis.moduleArrays.keys()].filter((name) => !unsafeNames.has(name)));
};
