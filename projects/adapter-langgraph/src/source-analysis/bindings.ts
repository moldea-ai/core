import ts from 'typescript';

import {
  getConstExport,
  getStaticString,
  isModuleBindingVisible,
  isModuleConstValueSafe,
  isModuleValueBindingSafe,
  resolveImportCandidatePaths,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import { parseRepositoryPath } from '@moldea.ai/repository';

import type {
  ILangGraphInspectionSession,
  ILangGraphSchemaSource,
  ILangGraphSourceAnalysis,
  ILangGraphSourceFailure,
} from '../contracts/index.js';

/** Returns an exact supported object-property name. */
export const getLangGraphPropertyName = (name: ts.PropertyName): string | null =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;

/** Determines whether an object uses JavaScript's non-own `__proto__` setter form. */
export const hasLangGraphPrototypeSetter = (object: ts.ObjectLiteralExpression): boolean =>
  object.properties.some(
    (property) =>
      ts.isPropertyAssignment(property) &&
      !ts.isComputedPropertyName(property.name) &&
      getLangGraphPropertyName(property.name) === '__proto__',
  );

/** Checks an exact package-root runtime import at one lexically visible use. */
export const isLangGraphRuntimeImport = (
  identifier: ts.Identifier,
  importedNames: ReadonlySet<string>,
  analysis: ILangGraphSourceAnalysis,
): boolean => importedNames.has(identifier.text) && isModuleBindingVisible(identifier, analysis);

/** Checks whether an explicit type-argument count matches one closed range. */
export const hasLangGraphTypeArgumentCount = (
  call: ts.CallExpression | ts.NewExpression,
  minimum: number,
  maximum = minimum,
): boolean =>
  call.typeArguments === undefined ||
  (call.typeArguments.length >= minimum && call.typeArguments.length <= maximum);

/** Determines whether a property access is direct, non-computed, and non-optional. */
export const getLangGraphMemberName = (
  expression: ts.Expression,
): { readonly name: string; readonly receiver: ts.Expression } | null => {
  const candidate = unwrapExpression(expression);

  if (
    !ts.isPropertyAccessExpression(candidate) ||
    candidate.questionDotToken !== undefined ||
    ts.isPrivateIdentifier(candidate.name)
  ) {
    return null;
  }

  return Object.freeze({ name: candidate.name.text, receiver: candidate.expression });
};

const isZeroNumericLiteral = (expression: ts.Expression): boolean => {
  const candidate = unwrapExpression(expression);

  return ts.isNumericLiteral(candidate) && Number(candidate.text) === 0;
};

const hasBindingName = (bindingName: ts.BindingName, name: string): boolean => {
  if (ts.isIdentifier(bindingName)) {
    return bindingName.text === name;
  }

  return bindingName.elements.some(
    (element) => !ts.isOmittedExpression(element) && hasBindingName(element.name, name),
  );
};

/** Determines whether a source file declares one module-level runtime binding. */
const hasModuleRuntimeBinding = (analysis: ILangGraphSourceAnalysis, name: string): boolean =>
  analysis.sourceFile.statements.some((statement) => {
    if (ts.isImportDeclaration(statement)) {
      const importClause = statement.importClause;

      if (importClause?.isTypeOnly === true) {
        return false;
      }

      if (importClause?.name?.text === name) {
        return true;
      }

      const bindings = importClause?.namedBindings;

      if (bindings === undefined) {
        return false;
      }

      return ts.isNamespaceImport(bindings)
        ? bindings.name.text === name
        : bindings.elements.some((element) => !element.isTypeOnly && element.name.text === name);
    }

    if (ts.isImportEqualsDeclaration(statement)) {
      return statement.isTypeOnly !== true && statement.name.text === name;
    }

    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some((declaration) =>
        hasBindingName(declaration.name, name),
      );
    }

    return (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
      statement.name !== undefined &&
      ts.isIdentifier(statement.name) &&
      statement.name.text === name
    );
  });

const isDirectNullishExpression = (
  expression: ts.Expression,
  analysis: ILangGraphSourceAnalysis,
): boolean => {
  const candidate = unwrapExpression(expression);

  return (
    candidate.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(candidate) &&
      candidate.text === 'undefined' &&
      isModuleBindingVisible(candidate, analysis) &&
      !hasModuleRuntimeBinding(analysis, candidate.text)) ||
    (ts.isVoidExpression(candidate) && isZeroNumericLiteral(candidate.expression))
  );
};

interface ILangGraphResolvedBinding {
  readonly analysis: ILangGraphSourceAnalysis;
  readonly declaration: ts.Node;
  readonly expression: ts.Expression;
  readonly path: ReturnType<typeof parseRepositoryPath>;
  readonly symbol: string;
}

/** Resolves one direct module-local or relative-import immutable constant binding. */
export const resolveLangGraphConstBinding = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphResolvedBinding | null> => {
  const candidate = unwrapExpression(expression);

  if (!ts.isIdentifier(candidate) || !isModuleBindingVisible(candidate, analysis)) {
    return null;
  }

  const localDeclaration = analysis.moduleConstDeclarations.get(candidate.text);

  if (localDeclaration?.initializer !== undefined) {
    return Object.freeze({
      analysis,
      declaration: localDeclaration,
      expression: unwrapExpression(localDeclaration.initializer),
      path: analysis.path,
      symbol: candidate.text,
    });
  }

  const namedImport = analysis.namedImports.get(candidate.text);

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

  const exported = getConstExport(result.analysis, namedImport.importedName);

  if (exported.kind !== 'present-supported' || exported.expression === undefined) {
    return null;
  }

  return Object.freeze({
    analysis: result.analysis,
    declaration: exported.declaration,
    expression: exported.expression,
    path,
    symbol: namedImport.importedName,
  });
};

/** Resolves the exact explicit nullish forms supported in optional positions. */
export const isLangGraphExplicitOmission = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
): Promise<boolean> => {
  if (isDirectNullishExpression(expression, analysis)) {
    const candidate = unwrapExpression(expression);
    return candidate.kind !== ts.SyntaxKind.NullKeyword;
  }

  const binding = await resolveLangGraphConstBinding(session, analysis, expression);
  return (
    binding !== null &&
    binding.path === analysis.path &&
    isDirectNullishExpression(binding.expression, binding.analysis)
  );
};

/** Resolves the exact nullish forms supported for modern schema properties. */
export const isLangGraphNullishSchemaValue = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<boolean> => {
  if (isDirectNullishExpression(expression, analysis)) {
    return true;
  }

  const binding = await resolveLangGraphConstBinding(
    session,
    analysis,
    expression,
    onSourceFailure,
  );
  return binding !== null && isDirectNullishExpression(binding.expression, binding.analysis);
};

const isSupportedOpaqueInitializer = (expression: ts.Expression): boolean => {
  const candidate = unwrapExpression(expression);

  return (
    ts.isCallExpression(candidate) ||
    ts.isNewExpression(candidate) ||
    (ts.isPropertyAccessExpression(candidate) && candidate.questionDotToken === undefined)
  );
};

/** Resolves one schema-position identifier to an immutable opaque runtime value. */
export const resolveLangGraphSchemaSource = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphSchemaSource | null> => {
  const candidate = unwrapExpression(expression);

  if (!ts.isIdentifier(candidate)) {
    return null;
  }

  const binding = await resolveLangGraphConstBinding(session, analysis, candidate, onSourceFailure);

  if (binding === null || !isSupportedOpaqueInitializer(binding.expression)) {
    return null;
  }

  return Object.freeze({
    analysis: binding.analysis,
    expression: candidate,
    path: binding.path,
    symbol: binding.symbol,
  });
};

/** Classifies one direct or immutable-bound opaque object-or-schema value. */
export const isLangGraphOpaqueObjectValue = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<boolean> => {
  const candidate = unwrapExpression(expression);

  if (isSupportedOpaqueInitializer(candidate)) {
    return true;
  }

  if (ts.isConditionalExpression(candidate)) {
    const whenTrue = await isLangGraphOpaqueObjectValue(
      session,
      analysis,
      candidate.whenTrue,
      onSourceFailure,
    );
    const whenFalse = await isLangGraphOpaqueObjectValue(
      session,
      analysis,
      candidate.whenFalse,
      onSourceFailure,
    );

    return whenTrue || whenFalse;
  }

  const binding = await resolveLangGraphConstBinding(session, analysis, candidate, onSourceFailure);
  return binding !== null && isSupportedOpaqueInitializer(binding.expression);
};

/** Classifies one direct or directly bound immutable object-family value. */
export const isLangGraphObjectFamilyValue = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<boolean> => {
  const candidate = unwrapExpression(expression);

  if (ts.isObjectLiteralExpression(candidate)) {
    return true;
  }

  if (ts.isConditionalExpression(candidate)) {
    const whenTrue = await isLangGraphObjectFamilyValue(
      session,
      analysis,
      candidate.whenTrue,
      onSourceFailure,
    );
    const whenFalse = await isLangGraphObjectFamilyValue(
      session,
      analysis,
      candidate.whenFalse,
      onSourceFailure,
    );

    return whenTrue || whenFalse;
  }

  const binding = await resolveLangGraphConstBinding(session, analysis, candidate, onSourceFailure);

  return binding !== null && ts.isObjectLiteralExpression(binding.expression);
};

interface ILangGraphResolvedAggregate<
  TExpression extends ts.ObjectLiteralExpression | ts.ArrayLiteralExpression,
> {
  readonly analysis: ILangGraphSourceAnalysis;
  readonly expression: TExpression;
}

/** Resolves one member-sensitive local or imported aggregate literal binding. */
export async function resolveLangGraphAggregateLiteral(
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  kind: 'array',
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphResolvedAggregate<ts.ArrayLiteralExpression> | null>;
export async function resolveLangGraphAggregateLiteral(
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  kind: 'object',
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphResolvedAggregate<ts.ObjectLiteralExpression> | null>;
export async function resolveLangGraphAggregateLiteral(
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  kind: 'array' | 'object',
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphResolvedAggregate<
  ts.ArrayLiteralExpression | ts.ObjectLiteralExpression
> | null> {
  const candidate = unwrapExpression(expression);
  const isExpectedLiteral = (
    value: ts.Expression,
  ): value is ts.ArrayLiteralExpression | ts.ObjectLiteralExpression =>
    kind === 'array' ? ts.isArrayLiteralExpression(value) : ts.isObjectLiteralExpression(value);

  if (isExpectedLiteral(candidate)) {
    return Object.freeze({ analysis, expression: candidate });
  }

  if (!ts.isIdentifier(candidate) || !isModuleBindingVisible(candidate, analysis)) {
    return null;
  }

  const binding = await resolveLangGraphConstBinding(session, analysis, candidate, onSourceFailure);

  if (
    binding === null ||
    !ts.isVariableDeclaration(binding.declaration) ||
    !ts.isIdentifier(binding.declaration.name) ||
    !isExpectedLiteral(binding.expression)
  ) {
    return null;
  }

  const isConsumerUseSafe = isModuleValueBindingSafe(
    analysis,
    candidate.text,
    analysis === binding.analysis ? binding.declaration.name : null,
    new Set([candidate]),
    kind,
  );
  const isDeclarationSafe = isModuleConstValueSafe(
    binding.analysis,
    binding.declaration,
    analysis === binding.analysis ? new Set([candidate]) : new Set(),
    kind,
  );

  return isConsumerUseSafe && isDeclarationSafe
    ? Object.freeze({ analysis: binding.analysis, expression: binding.expression })
    : null;
}

/** Classifies a static literal directly available without repository traversal. */
export const getLangGraphDirectStaticString = (expression: ts.Expression): string | null =>
  getStaticString(unwrapExpression(expression));
