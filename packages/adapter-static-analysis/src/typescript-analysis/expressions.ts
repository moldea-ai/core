import ts from 'typescript';

/**
 * Removes the transparent expression wrappers supported by runtime adapters.
 * @param expression The expression to normalize.
 * @returns The underlying expression used by static matching.
 */
export const unwrapExpression = (expression: ts.Expression): ts.Expression => {
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
export const getDirectCall = (expression: ts.Expression): ts.CallExpression | null => {
  const unwrapped = unwrapExpression(expression);
  const candidate = ts.isAwaitExpression(unwrapped)
    ? unwrapExpression(unwrapped.expression)
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
 * Indexes a closed object literal with exact identifier or string-literal keys.
 * @param objectLiteral The candidate closed object.
 * @returns Exact property expressions or `null` for dynamic or duplicate members.
 */
export const getClosedObjectProperties = (
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
      unwrapExpression(ts.isPropertyAssignment(property) ? property.initializer : property.name),
    );
  }

  return properties;
};

/**
 * Reads an exact static string literal from one expression.
 * @param expression The candidate string expression.
 * @returns Its exact value or `null` when dynamic.
 */
export const getStaticString = (expression: ts.Expression | null | undefined): string | null => {
  if (expression === null || expression === undefined) {
    return null;
  }

  const candidate = unwrapExpression(expression);

  return ts.isStringLiteral(candidate) || ts.isNoSubstitutionTemplateLiteral(candidate)
    ? candidate.text
    : null;
};

/**
 * Determines whether an expression is the `null` literal.
 * @param expression The candidate expression.
 * @returns Whether the expression is statically `null`.
 */
export const isNullLiteral = (expression: ts.Expression): boolean =>
  unwrapExpression(expression).kind === ts.SyntaxKind.NullKeyword;

/**
 * Determines whether an expression is a literal boolean or `null`.
 * @param expression The candidate strict-mode expression.
 * @returns Whether the expression is closed and literal.
 */
export const isStrictLiteral = (expression: ts.Expression): boolean => {
  const candidate = unwrapExpression(expression);

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
export const isStaticLiteralValue = (expression: ts.Expression): boolean => {
  const candidate = unwrapExpression(expression);

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
        isStaticLiteralValue(element),
    );
  }

  if (!ts.isObjectLiteralExpression(candidate)) {
    return false;
  }

  const properties = getClosedObjectProperties(candidate);

  return (
    properties !== null &&
    [...properties.values()].every((property) => isStaticLiteralValue(property))
  );
};
