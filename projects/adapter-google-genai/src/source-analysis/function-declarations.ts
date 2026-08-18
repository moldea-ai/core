import ts from 'typescript';

import {
  getClosedObjectProperties,
  getConstExport,
  getStaticString,
  isBoundIdentifier,
  isStaticLiteralValue,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryReference } from '@moldea.ai/core/format';

import {
  GOOGLE_GENAI_FUNCTION_NAME_LIMIT,
  GOOGLE_GENAI_FUNCTION_NAME_PATTERN,
} from '../constants/index.js';
import type { IGoogleGenAiSourceAnalysis } from '../contracts/index.js';

export interface IGoogleGenAiFunctionDeclarationShape {
  readonly detectedName: string;
  readonly name: ts.Expression;
  readonly object: ts.ObjectLiteralExpression;
  readonly parametersJsonSchema: ts.Expression | null;
  readonly properties: ReadonlyMap<string, ts.Expression>;
}

export type IGoogleGenAiFunctionDeclarationShapeResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'present-unsupported' }
  | ({ readonly kind: 'present-supported' } & IGoogleGenAiFunctionDeclarationShape);

const ALLOWED_FUNCTION_DECLARATION_PROPERTIES = new Set([
  'behavior',
  'description',
  'name',
  'parametersJsonSchema',
  'response',
  'responseJsonSchema',
]);

const isSupportedParametersJsonSchema = (
  expression: ts.Expression,
  analysis: IGoogleGenAiSourceAnalysis,
  inputSchemaReference?: IRepositoryReference,
): boolean => {
  const candidate = unwrapExpression(expression);

  return (
    (ts.isObjectLiteralExpression(candidate) && isStaticLiteralValue(candidate)) ||
    (ts.isIdentifier(candidate) &&
      inputSchemaReference?.symbol !== undefined &&
      isBoundIdentifier(candidate, analysis, inputSchemaReference))
  );
};

/**
 * Validates one closed Google Gen AI function-declaration object.
 * @param analysis The source containing the declaration.
 * @param object The function-declaration object literal.
 * @param inputSchemaReference The optional exact manifest input-schema binding.
 * @returns Its supported static shape or an unsupported observation.
 */
export const getGoogleGenAiFunctionDeclarationObjectShape = (
  analysis: IGoogleGenAiSourceAnalysis,
  object: ts.ObjectLiteralExpression,
  inputSchemaReference?: IRepositoryReference,
): IGoogleGenAiFunctionDeclarationShapeResult => {
  if (object.properties.some((property) => !ts.isPropertyAssignment(property))) {
    return { kind: 'present-unsupported' };
  }

  const properties = getClosedObjectProperties(object);

  if (
    properties === null ||
    [...properties.keys()].some(
      (propertyName) => !ALLOWED_FUNCTION_DECLARATION_PROPERTIES.has(propertyName),
    )
  ) {
    return { kind: 'present-unsupported' };
  }

  const name = properties.get('name');
  const description = properties.get('description');
  const parametersJsonSchema = properties.get('parametersJsonSchema');
  const detectedName = getStaticString(name);

  if (
    name === undefined ||
    detectedName === null ||
    (description !== undefined && getStaticString(description) === null) ||
    (parametersJsonSchema !== undefined &&
      !isSupportedParametersJsonSchema(parametersJsonSchema, analysis, inputSchemaReference))
  ) {
    return { kind: 'present-unsupported' };
  }

  return Object.freeze({
    detectedName,
    kind: 'present-supported',
    name,
    object,
    parametersJsonSchema: parametersJsonSchema ?? null,
    properties,
  });
};

/**
 * Resolves a directly exported constant function declaration.
 * @param analysis The source containing the declared registration.
 * @param symbol The exact exported registration symbol.
 * @param inputSchemaReference The optional exact manifest input-schema binding.
 * @returns The absent, unsupported, or supported registration shape.
 */
export const getGoogleGenAiFunctionDeclarationShape = (
  analysis: IGoogleGenAiSourceAnalysis,
  symbol: string,
  inputSchemaReference?: IRepositoryReference,
): IGoogleGenAiFunctionDeclarationShapeResult => {
  const exported = getConstExport(analysis, symbol);

  if (exported.kind === 'absent') {
    return { kind: 'absent' };
  }

  if (
    exported.kind !== 'present-supported' ||
    exported.expression === undefined ||
    !ts.isObjectLiteralExpression(exported.expression)
  ) {
    return { kind: 'present-unsupported' };
  }

  return getGoogleGenAiFunctionDeclarationObjectShape(
    analysis,
    exported.expression,
    inputSchemaReference,
  );
};

/**
 * Checks the version-matched Google Gen AI SDK function-name declaration limits.
 * @param name The exact statically detected function name.
 * @returns Whether the name satisfies both scalar-length and ASCII-pattern limits.
 */
export const isGoogleGenAiFunctionNameValid = (name: string): boolean => {
  const scalarLength = [...name].length;

  return (
    scalarLength >= 1 &&
    scalarLength <= GOOGLE_GENAI_FUNCTION_NAME_LIMIT &&
    GOOGLE_GENAI_FUNCTION_NAME_PATTERN.test(name)
  );
};
