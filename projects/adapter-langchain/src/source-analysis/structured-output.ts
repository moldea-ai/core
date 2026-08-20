import ts from 'typescript';

import { isModuleBindingVisible, unwrapExpression } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryReference } from '@moldea.ai/core/format';

import type { ILangChainBindingResult, ILangChainSourceAnalysis } from '../contracts/index.js';
import { classifyLangChainDirectBinding, getLangChainPropertyName } from './bindings.js';

const isExactImportedHelper = (
  expression: ts.Expression,
  names: ReadonlySet<string>,
  analysis: ILangChainSourceAnalysis,
): expression is ts.Identifier =>
  ts.isIdentifier(expression) &&
  names.has(expression.text) &&
  isModuleBindingVisible(expression, analysis);

const classifyProviderStrategyObject = (
  object: ts.ObjectLiteralExpression,
  analysis: ILangChainSourceAnalysis,
  reference: IRepositoryReference & { readonly symbol: string },
): ILangChainBindingResult => {
  const seen = new Set<string>();
  let schema: ts.Expression | null = null;

  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return Object.freeze({ kind: 'unresolved' });
    }

    const name = getLangChainPropertyName(property.name);

    if (name === null || !['schema', 'strict'].includes(name) || seen.has(name)) {
      return Object.freeze({ kind: 'unresolved' });
    }

    seen.add(name);

    if (name === 'schema') {
      schema = unwrapExpression(property.initializer);
    } else {
      const strict = unwrapExpression(property.initializer);

      if (strict.kind !== ts.SyntaxKind.TrueKeyword && strict.kind !== ts.SyntaxKind.FalseKeyword) {
        return Object.freeze({ kind: 'unresolved' });
      }
    }
  }

  return schema === null
    ? Object.freeze({ kind: 'unresolved' })
    : classifyLangChainDirectBinding(schema, analysis, reference);
};

/** Classifies a direct schema or supported one-schema response strategy. */
export const classifyLangChainResponseFormat = (
  expression: ts.Expression,
  analysis: ILangChainSourceAnalysis,
  reference: IRepositoryReference & { readonly symbol: string },
): ILangChainBindingResult & { readonly strategy?: string } => {
  const candidate = unwrapExpression(expression);

  if (ts.isArrayLiteralExpression(candidate)) {
    return Object.freeze({ kind: 'unresolved' });
  }

  if (!ts.isCallExpression(candidate)) {
    return classifyLangChainDirectBinding(candidate, analysis, reference);
  }

  const callee = unwrapExpression(candidate.expression);

  if (
    isExactImportedHelper(callee, analysis.imports.toolStrategyNames, analysis) &&
    (candidate.arguments.length === 1 || candidate.arguments.length === 2)
  ) {
    const firstArgument = unwrapExpression(candidate.arguments[0] as ts.Expression);
    const result = ts.isArrayLiteralExpression(firstArgument)
      ? Object.freeze({ kind: 'unresolved' } as const)
      : classifyLangChainDirectBinding(firstArgument, analysis, reference);
    return Object.freeze({ ...result, strategy: 'tool-strategy' });
  }

  if (
    !isExactImportedHelper(callee, analysis.imports.providerStrategyNames, analysis) ||
    candidate.arguments.length !== 1
  ) {
    return Object.freeze({ kind: 'unresolved' });
  }

  const argument = unwrapExpression(candidate.arguments[0] as ts.Expression);
  const result = ts.isObjectLiteralExpression(argument)
    ? classifyProviderStrategyObject(argument, analysis, reference)
    : classifyLangChainDirectBinding(argument, analysis, reference);
  return Object.freeze({ ...result, strategy: 'provider-strategy' });
};

/** Determines whether a schema binding is obviously an array or prebuilt strategy value. */
export const isLangChainSingleSchemaInitializer = (
  expression: ts.Expression,
  analysis: ILangChainSourceAnalysis,
): boolean => {
  const candidate = unwrapExpression(expression);

  if (ts.isArrayLiteralExpression(candidate)) {
    return false;
  }

  if (!ts.isCallExpression(candidate)) {
    return true;
  }

  const callee = unwrapExpression(candidate.expression);
  return !(
    isExactImportedHelper(callee, analysis.imports.toolStrategyNames, analysis) ||
    isExactImportedHelper(callee, analysis.imports.providerStrategyNames, analysis)
  );
};
