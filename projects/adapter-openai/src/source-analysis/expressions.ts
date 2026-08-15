import ts from 'typescript';

/**
 * Removes only the transparent expression wrappers covered by the OpenAI adapter contract.
 * @param expression The expression to normalize.
 * @returns The underlying expression used by static matching.
 */
export const unwrapOpenAiExpression = (expression: ts.Expression): ts.Expression => {
  let current = expression;

  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return current;
};

/**
 * Resolves one direct call with an optional outer `await` wrapper.
 * @param expression The candidate call expression.
 * @returns The direct call or `null` when the form is unsupported.
 */
export const getOpenAiDirectCall = (expression: ts.Expression): ts.CallExpression | null => {
  const unwrapped = unwrapOpenAiExpression(expression);
  const candidate = ts.isAwaitExpression(unwrapped)
    ? unwrapOpenAiExpression(unwrapped.expression)
    : unwrapped;

  return ts.isCallExpression(candidate) ? candidate : null;
};

const getStaticPropertyName = (name: ts.PropertyName): string | null => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }

  return null;
};

/**
 * Indexes a fully closed object literal with exact identifier or string-literal keys.
 * @param objectLiteral The candidate closed object.
 * @returns Exact property expressions or `null` when any member is dynamic or duplicated.
 */
export const getOpenAiClosedObjectProperties = (
  objectLiteral: ts.ObjectLiteralExpression,
): ReadonlyMap<string, ts.Expression> | null => {
  const properties = new Map<string, ts.Expression>();

  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      return null;
    }

    const propertyName = getStaticPropertyName(property.name);

    if (propertyName === null || properties.has(propertyName)) {
      return null;
    }

    properties.set(
      propertyName,
      unwrapOpenAiExpression(
        ts.isPropertyAssignment(property) ? property.initializer : property.name,
      ),
    );
  }

  return properties;
};

/**
 * Reads an exact static string literal from one expression.
 * @param expression The candidate string expression.
 * @returns Its exact value or `null` when dynamic.
 */
export const getOpenAiStaticString = (
  expression: ts.Expression | null | undefined,
): string | null => {
  if (expression === null || expression === undefined) {
    return null;
  }

  const candidate = unwrapOpenAiExpression(expression);

  return ts.isStringLiteral(candidate) || ts.isNoSubstitutionTemplateLiteral(candidate)
    ? candidate.text
    : null;
};

/**
 * Determines whether an expression is the `null` literal.
 * @param expression The candidate expression.
 * @returns Whether the expression is statically `null`.
 */
export const isOpenAiNullLiteral = (expression: ts.Expression): boolean =>
  unwrapOpenAiExpression(expression).kind === ts.SyntaxKind.NullKeyword;

/**
 * Determines whether an expression is a supported literal boolean or `null`.
 * @param expression The candidate strict-mode expression.
 * @returns Whether the expression is closed and literal.
 */
export const isOpenAiStrictLiteral = (expression: ts.Expression): boolean => {
  const candidate = unwrapOpenAiExpression(expression);

  return (
    candidate.kind === ts.SyntaxKind.TrueKeyword ||
    candidate.kind === ts.SyntaxKind.FalseKeyword ||
    candidate.kind === ts.SyntaxKind.NullKeyword
  );
};

/**
 * Determines whether a JSON-like expression is fully static.
 * @param expression The candidate schema or literal value.
 * @returns Whether every nested value is statically represented.
 */
export const isOpenAiStaticLiteralValue = (expression: ts.Expression): boolean => {
  const candidate = unwrapOpenAiExpression(expression);

  if (
    ts.isStringLiteral(candidate) ||
    ts.isNoSubstitutionTemplateLiteral(candidate) ||
    ts.isNumericLiteral(candidate) ||
    candidate.kind === ts.SyntaxKind.TrueKeyword ||
    candidate.kind === ts.SyntaxKind.FalseKeyword ||
    candidate.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }

  if (
    ts.isPrefixUnaryExpression(candidate) &&
    (candidate.operator === ts.SyntaxKind.PlusToken ||
      candidate.operator === ts.SyntaxKind.MinusToken) &&
    ts.isNumericLiteral(candidate.operand)
  ) {
    return true;
  }

  if (ts.isArrayLiteralExpression(candidate)) {
    return candidate.elements.every(
      (element) =>
        !ts.isOmittedExpression(element) &&
        !ts.isSpreadElement(element) &&
        isOpenAiStaticLiteralValue(element),
    );
  }

  if (!ts.isObjectLiteralExpression(candidate)) {
    return false;
  }

  const properties = getOpenAiClosedObjectProperties(candidate);

  return (
    properties !== null &&
    [...properties.values()].every((property) => isOpenAiStaticLiteralValue(property))
  );
};
