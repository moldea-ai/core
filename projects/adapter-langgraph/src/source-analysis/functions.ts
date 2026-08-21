import ts from 'typescript';

import {
  getConstExport,
  isModuleBindingVisible,
  resolveImportCandidatePaths,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import { parseRepositoryPath } from '@moldea.ai/repository';

import type {
  ILangGraphInspectionSession,
  ILangGraphSourceAnalysis,
  ILangGraphSourceFailure,
} from '../contracts/index.js';

export interface ILangGraphResolvedFunction {
  readonly analysis: ILangGraphSourceAnalysis;
  readonly expression: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression;
  readonly reference: {
    readonly path: ReturnType<typeof parseRepositoryPath>;
    readonly symbol: string;
  } | null;
}

const isAssignmentOperator = (kind: ts.SyntaxKind): boolean =>
  kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;

const isFunctionDeclarationReassigned = (
  analysis: ILangGraphSourceAnalysis,
  declaration: ts.FunctionDeclaration,
): boolean => {
  if (declaration.name === undefined) {
    return true;
  }

  return (analysis.identifierUses.get(declaration.name.text) ?? []).some((identifier) => {
    if (identifier === declaration.name || !isModuleBindingVisible(identifier, analysis)) {
      return false;
    }

    let current: ts.Expression = identifier;

    while (
      ts.isAsExpression(current.parent) ||
      ts.isParenthesizedExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent)
    ) {
      current = current.parent;
    }

    const parent = current.parent;
    return (
      (ts.isBinaryExpression(parent) &&
        parent.left === current &&
        isAssignmentOperator(parent.operatorToken.kind)) ||
      ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
        parent.operand === current &&
        (parent.operator === ts.SyntaxKind.PlusPlusToken ||
          parent.operator === ts.SyntaxKind.MinusMinusToken)) ||
      (ts.isDeleteExpression(parent) && parent.expression === current) ||
      ((ts.isForInStatement(parent) || ts.isForOfStatement(parent)) &&
        parent.initializer === current)
    );
  });
};

const isSupportedFunctionShape = (
  expression: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression,
  parameterPolicy: 'runnable' | 'workflow',
): boolean => {
  if (expression.asteriskToken !== undefined) {
    return false;
  }

  if (parameterPolicy === 'runnable') {
    return true;
  }

  if (expression.parameters.length > 2) {
    return false;
  }

  return expression.parameters.every((parameter, index) => {
    const isOptional = parameter.questionToken !== undefined;

    return (
      ts.isIdentifier(parameter.name) &&
      parameter.dotDotDotToken === undefined &&
      parameter.initializer === undefined &&
      (!isOptional || index === 1)
    );
  });
};

const findLocalFunction = (
  analysis: ILangGraphSourceAnalysis,
  name: string,
): ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression | null => {
  for (const statement of analysis.sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return statement.body === undefined ? null : statement;
    }
  }

  const declaration = analysis.moduleConstDeclarations.get(name);
  const initializer =
    declaration?.initializer === undefined ? null : unwrapExpression(declaration.initializer);

  return initializer !== null &&
    (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
    ? initializer
    : null;
};

const resolveImportedFunction = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  localName: string,
  parameterPolicy: 'runnable' | 'workflow',
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphResolvedFunction | null> => {
  const namedImport = analysis.namedImports.get(localName);

  if (namedImport === undefined) {
    return null;
  }

  const matchingPaths = [];

  for (const candidatePath of resolveImportCandidatePaths(
    analysis.path,
    namedImport.moduleSpecifier,
  )) {
    const path = parseRepositoryPath(candidatePath);
    const entry = await session.getEntry(path);

    if (entry?.type === 'file') {
      matchingPaths.push(path);
    }
  }

  if (matchingPaths.length !== 1) {
    return null;
  }

  const path = matchingPaths[0] as ReturnType<typeof parseRepositoryPath>;
  const result = await session.analyzeSource(path);

  if (result.kind !== 'valid') {
    onSourceFailure?.(Object.freeze({ ...result, path }));
    return null;
  }

  const exported = result.analysis.exports.get(namedImport.importedName);
  let expression: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression | null = null;

  if (
    exported?.kind === 'present-supported' &&
    ts.isFunctionDeclaration(exported.declaration) &&
    exported.declaration.body !== undefined
  ) {
    expression = exported.declaration;
  } else {
    const constExport = getConstExport(result.analysis, namedImport.importedName);

    if (
      constExport.kind === 'present-supported' &&
      constExport.expression !== undefined &&
      (ts.isArrowFunction(constExport.expression) ||
        ts.isFunctionExpression(constExport.expression))
    ) {
      expression = constExport.expression;
    }
  }

  if (
    expression === null ||
    !isSupportedFunctionShape(expression, parameterPolicy) ||
    (ts.isFunctionDeclaration(expression) &&
      isFunctionDeclarationReassigned(result.analysis, expression))
  ) {
    return null;
  }

  return Object.freeze({
    analysis: result.analysis,
    expression,
    reference: Object.freeze({ path, symbol: namedImport.importedName }),
  });
};

/** Resolves one supported inline, module-local, or relative-import function source. */
export const resolveLangGraphFunction = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  parameterPolicy: 'runnable' | 'workflow',
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphResolvedFunction | null> => {
  const candidate = unwrapExpression(expression);

  if (ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate)) {
    return isSupportedFunctionShape(candidate, parameterPolicy)
      ? Object.freeze({ analysis, expression: candidate, reference: null })
      : null;
  }

  if (!ts.isIdentifier(candidate) || !isModuleBindingVisible(candidate, analysis)) {
    return null;
  }

  const localFunction = findLocalFunction(analysis, candidate.text);

  if (localFunction !== null) {
    return isSupportedFunctionShape(localFunction, parameterPolicy) &&
      (!ts.isFunctionDeclaration(localFunction) ||
        !isFunctionDeclarationReassigned(analysis, localFunction))
      ? Object.freeze({
          analysis,
          expression: localFunction,
          reference: Object.freeze({ path: analysis.path, symbol: candidate.text }),
        })
      : null;
  }

  return resolveImportedFunction(
    session,
    analysis,
    candidate.text,
    parameterPolicy,
    onSourceFailure,
  );
};

/** Determines whether an expression is an allowed opaque runnable source. */
export const isLangGraphOpaqueRunnable = (expression: ts.Expression): boolean => {
  const candidate = unwrapExpression(expression);

  return (
    ts.isCallExpression(candidate) ||
    ts.isNewExpression(candidate) ||
    (ts.isPropertyAccessExpression(candidate) && candidate.questionDotToken === undefined)
  );
};

/** Visits only one function's lexical body while skipping nested execution scopes. */
export const visitLangGraphFunctionBody = (
  expression: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression,
  visitor: (node: ts.Node) => void,
): void => {
  const body = expression.body;

  if (body === undefined) {
    return;
  }

  const visit = (node: ts.Node): void => {
    visitor(node);

    ts.forEachChild(node, (child) => {
      if (
        child !== body &&
        (ts.isFunctionLike(child) ||
          ts.isClassDeclaration(child) ||
          ts.isClassExpression(child) ||
          ts.isClassStaticBlockDeclaration(child))
      ) {
        return;
      }

      visit(child);
    });
  };

  visit(body);
};
