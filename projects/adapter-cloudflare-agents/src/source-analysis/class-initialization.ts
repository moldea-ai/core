import ts from 'typescript';

import { isStaticLiteralValue, unwrapExpression } from '@moldea.ai/adapter-static-analysis';

const hasDecorators = (node: ts.Node): boolean =>
  ts.canHaveDecorators(node) && (ts.getDecorators(node)?.length ?? 0) > 0;

const hasStaticModifier = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword) ??
    false);

const isSimpleParameter = (parameter: ts.ParameterDeclaration): boolean =>
  ts.isIdentifier(parameter.name) &&
  parameter.dotDotDotToken === undefined &&
  parameter.initializer === undefined &&
  parameter.questionToken === undefined &&
  (parameter.modifiers?.length ?? 0) === 0 &&
  !hasDecorators(parameter);

const isPassThroughConstructor = (constructor: ts.ConstructorDeclaration): boolean => {
  if (
    constructor.body === undefined ||
    constructor.parameters.length !== 2 ||
    !constructor.parameters.every(isSimpleParameter) ||
    constructor.body.statements.length !== 1
  ) {
    return false;
  }

  const statement = constructor.body.statements[0];

  if (statement === undefined || !ts.isExpressionStatement(statement)) {
    return false;
  }

  const expression = unwrapExpression(statement.expression);

  return (
    ts.isCallExpression(expression) &&
    expression.expression.kind === ts.SyntaxKind.SuperKeyword &&
    expression.arguments.length === 2 &&
    expression.arguments.every(
      (argument, index) =>
        ts.isIdentifier(unwrapExpression(argument)) &&
        (unwrapExpression(argument) as ts.Identifier).text ===
          (constructor.parameters[index]?.name as ts.Identifier).text,
    )
  );
};

/** Determines whether the class initialization surface is closed and side-effect free. */
export const isCloudflareAgentsClassInitializationSupported = (
  declaration: ts.ClassDeclaration,
): boolean => {
  if (hasDecorators(declaration)) {
    return false;
  }

  let constructorCount = 0;

  for (const member of declaration.members) {
    if (hasDecorators(member)) {
      return false;
    }

    if (ts.isConstructorDeclaration(member)) {
      constructorCount += 1;

      if (constructorCount > 1 || !isPassThroughConstructor(member)) {
        return false;
      }
      continue;
    }

    if (ts.isMethodDeclaration(member)) {
      if (
        member.asteriskToken !== undefined ||
        ts.isComputedPropertyName(member.name) ||
        member.parameters.some((parameter) => hasDecorators(parameter))
      ) {
        return false;
      }
      continue;
    }

    if (ts.isPropertyDeclaration(member)) {
      if (
        ts.isComputedPropertyName(member.name) ||
        hasStaticModifier(member) ||
        member.initializer === undefined ||
        !isStaticLiteralValue(member.initializer)
      ) {
        return false;
      }
      continue;
    }

    return false;
  }

  return true;
};
