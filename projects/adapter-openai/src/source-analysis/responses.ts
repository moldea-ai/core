import ts from 'typescript';

import type { IOpenAiResponsesAnalysis, IOpenAiSourceAnalysis } from '../contracts/index.js';
import { isOpenAiModuleBindingVisible } from './bindings.js';
import { getOpenAiClosedObjectProperties, unwrapOpenAiExpression } from './expressions.js';

interface IOpenAiAccessSegment {
  readonly isDirect: boolean;
  readonly name: string | null;
  readonly target: ts.Expression;
}

const getAccessSegment = (expression: ts.Expression): IOpenAiAccessSegment | null => {
  const candidate = unwrapOpenAiExpression(expression);

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

const classifyKnownClientResponsesAccess = (
  expression: ts.Expression,
  analysis: IOpenAiSourceAnalysis,
): 'direct' | 'indirect' | null => {
  const responsesAccess = getAccessSegment(expression);

  if (
    responsesAccess === null ||
    (responsesAccess.name !== null && responsesAccess.name !== 'responses')
  ) {
    return null;
  }

  const client = unwrapOpenAiExpression(responsesAccess.target);

  if (
    !ts.isIdentifier(client) ||
    !analysis.clientNames.has(client.text) ||
    !isOpenAiModuleBindingVisible(client, analysis)
  ) {
    return null;
  }

  return responsesAccess.isDirect ? 'direct' : 'indirect';
};

const classifyResponsesCreateAccess = (
  expression: ts.Expression,
  analysis: IOpenAiSourceAnalysis,
): 'direct' | 'indirect' | null => {
  const createAccess = getAccessSegment(expression);

  if (createAccess === null || (createAccess.name !== null && createAccess.name !== 'create')) {
    return null;
  }

  const responsesAccess = getAccessSegment(createAccess.target);

  if (
    responsesAccess === null ||
    (responsesAccess.name !== null && responsesAccess.name !== 'responses')
  ) {
    return null;
  }

  const knownAccess = classifyKnownClientResponsesAccess(createAccess.target, analysis);

  if (knownAccess === null) {
    return 'indirect';
  }

  return createAccess.isDirect && knownAccess === 'direct' ? 'direct' : 'indirect';
};

const classifyResponsesCall = (
  call: ts.CallExpression,
  analysis: IOpenAiSourceAnalysis,
): 'ambiguous' | 'closed' | 'unrelated' => {
  const access = classifyResponsesCreateAccess(call.expression, analysis);

  if (access === null) {
    return 'unrelated';
  }

  if (access === 'indirect' || call.questionDotToken !== undefined) {
    return 'ambiguous';
  }

  if (call.arguments.length !== 1) {
    return 'ambiguous';
  }

  const request = call.arguments[0];

  if (request === undefined || !ts.isObjectLiteralExpression(unwrapOpenAiExpression(request))) {
    return 'ambiguous';
  }

  return getOpenAiClosedObjectProperties(
    unwrapOpenAiExpression(request) as ts.ObjectLiteralExpression,
  ) === null
    ? 'ambiguous'
    : 'closed';
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

const isResponsesAccessCreateTarget = (
  expression: ts.Expression,
  analysis: IOpenAiSourceAnalysis,
): boolean => {
  const candidate = skipTransparentParents(expression);
  const parent = candidate.parent;

  if (!ts.isPropertyAccessExpression(parent) && !ts.isElementAccessExpression(parent)) {
    return false;
  }

  const access = getAccessSegment(parent);

  return (
    access !== null &&
    unwrapOpenAiExpression(access.target) === unwrapOpenAiExpression(expression) &&
    classifyResponsesCreateAccess(parent, analysis) !== null
  );
};

const isKnownClientResponsesTarget = (
  identifier: ts.Identifier,
  analysis: IOpenAiSourceAnalysis,
): boolean => {
  const candidate = skipTransparentParents(identifier);
  const parent = candidate.parent;

  return (
    (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
    parent.expression === candidate &&
    classifyKnownClientResponsesAccess(parent, analysis) !== null
  );
};

const getOpenAiClientValueExpression = (identifier: ts.Identifier): ts.Node => {
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

const isOpenAiClientEscape = (identifier: ts.Identifier): boolean => {
  const expression = getOpenAiClientValueExpression(identifier);
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
 * Finds every closed direct Responses request owned by one runtime-agent body.
 * @param analysis The indexed runtime source.
 * @param body The supported runtime-agent lexical body.
 * @param signal The active inspection signal.
 * @returns Closed requests and whether an unsupported candidate suppresses negative inference.
 * @throws
 * - If response analysis is aborted
 */
export const analyzeOpenAiResponses = (
  analysis: IOpenAiSourceAnalysis,
  body: ts.ConciseBody,
  signal?: AbortSignal,
): IOpenAiResponsesAnalysis => {
  const closedRequests: IOpenAiResponsesAnalysis['closedRequests'][number][] = [];
  let hasAmbiguousCandidate = false;

  if (isNestedLexicalBoundary(body)) {
    return Object.freeze({
      closedRequests: Object.freeze([]),
      hasAmbiguousCandidate: false,
    });
  }

  const visit = (node: ts.Node, isRoot: boolean): void => {
    signal?.throwIfAborted();

    if (!isRoot && isNestedLexicalBoundary(node)) {
      return;
    }

    if (ts.isCallExpression(node)) {
      const classification = classifyResponsesCall(node, analysis);

      if (classification === 'ambiguous') {
        hasAmbiguousCandidate = true;
      } else if (classification === 'closed') {
        const request = unwrapOpenAiExpression(node.arguments[0] as ts.Expression);
        const properties = getOpenAiClosedObjectProperties(request as ts.ObjectLiteralExpression);

        if (properties !== null) {
          closedRequests.push(
            Object.freeze({ object: request as ts.ObjectLiteralExpression, properties }),
          );
        }
      }
    }

    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const access = classifyResponsesCreateAccess(node, analysis);

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

      const responsesAccess = classifyKnownClientResponsesAccess(node, analysis);

      if (
        responsesAccess !== null &&
        (responsesAccess === 'indirect' || !isResponsesAccessCreateTarget(node, analysis))
      ) {
        hasAmbiguousCandidate = true;
      }
    }

    if (
      ts.isIdentifier(node) &&
      analysis.clientNames.has(node.text) &&
      isOpenAiModuleBindingVisible(node, analysis) &&
      !isKnownClientResponsesTarget(node, analysis) &&
      isOpenAiClientEscape(node)
    ) {
      hasAmbiguousCandidate = true;
    }

    ts.forEachChild(node, (child) => visit(child, false));
  };

  visit(body, true);
  signal?.throwIfAborted();

  return Object.freeze({
    closedRequests: Object.freeze(closedRequests),
    hasAmbiguousCandidate,
  });
};

/**
 * Resolves a closed array whose values are direct identifiers.
 * @param expression The inline or module-owned array literal.
 * @returns Its ordered identifiers or `null` when the array is not statically closed.
 */
export const getOpenAiClosedArrayIdentifiers = (
  expression: ts.ArrayLiteralExpression,
): readonly ts.Identifier[] | null => {
  const identifiers: ts.Identifier[] = [];

  for (const element of expression.elements) {
    if (ts.isOmittedExpression(element) || ts.isSpreadElement(element)) {
      return null;
    }

    const candidate = unwrapOpenAiExpression(element);

    if (!ts.isIdentifier(candidate)) {
      return null;
    }

    identifiers.push(candidate);
  }

  return identifiers;
};

// methods that neither mutate nor expose the source array to a callback
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

const isDirectToolsRequestPropertyUse = (
  identifier: ts.Identifier,
  analysis: IOpenAiSourceAnalysis,
): boolean => {
  const expression = skipTransparentParents(identifier);
  const property = expression.parent;
  const isToolsProperty =
    (ts.isShorthandPropertyAssignment(property) && property.name.text === 'tools') ||
    (ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === 'tools') ||
        (ts.isStringLiteral(property.name) && property.name.text === 'tools')) &&
      skipTransparentParents(property.initializer) === expression);

  if (!isToolsProperty || !ts.isObjectLiteralExpression(property.parent)) {
    return false;
  }

  const request = skipTransparentParents(property.parent);
  const call = request.parent;

  if (
    !ts.isCallExpression(call) ||
    call.arguments.length !== 1 ||
    skipTransparentParents(call.arguments[0] as ts.Expression) !== request
  ) {
    return false;
  }

  const createAccess = unwrapOpenAiExpression(call.expression);

  if (
    !ts.isPropertyAccessExpression(createAccess) ||
    createAccess.questionDotToken !== undefined ||
    createAccess.name.text !== 'create'
  ) {
    return false;
  }

  const responsesAccess = unwrapOpenAiExpression(createAccess.expression);

  if (
    !ts.isPropertyAccessExpression(responsesAccess) ||
    responsesAccess.questionDotToken !== undefined ||
    responsesAccess.name.text !== 'responses'
  ) {
    return false;
  }

  const client = unwrapOpenAiExpression(responsesAccess.expression);

  return (
    ts.isIdentifier(client) &&
    analysis.clientNames.has(client.text) &&
    isOpenAiModuleBindingVisible(client, analysis)
  );
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
  analysis: IOpenAiSourceAnalysis,
): boolean => {
  if (isDirectToolsRequestPropertyUse(identifier, analysis)) {
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
 * Determines whether a module-local tool array remains a stable immutable registration list.
 * @param analysis The source owning the module array.
 * @param name The module binding name.
 * @returns Whether no assignment, alias, return, argument passing, or mutation is present.
 */
export const isSafeOpenAiModuleArray = (analysis: IOpenAiSourceAnalysis, name: string): boolean =>
  analysis.safeModuleArrayNames.has(name);

/**
 * Indexes every immutable module-local tool array through one AST traversal.
 * @param analysis The preliminary indexed source.
 * @returns The module array names with no disallowed use.
 */
export const indexSafeOpenAiModuleArrayNames = (
  analysis: IOpenAiSourceAnalysis,
): ReadonlySet<string> => {
  const unsafeNames = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const moduleArray = analysis.moduleArrays.get(node.text);

      if (
        moduleArray !== undefined &&
        node !== moduleArray.declaration.name &&
        !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) &&
        !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
        isOpenAiModuleBindingVisible(node, analysis) &&
        isDisallowedArrayUse(node, analysis)
      ) {
        unsafeNames.add(node.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(analysis.sourceFile);
  return new Set([...analysis.moduleArrays.keys()].filter((name) => !unsafeNames.has(name)));
};
