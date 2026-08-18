import ts from 'typescript';

import {
  getClosedObjectProperties,
  getSafeModuleConstLiteral,
  isModuleBindingVisible,
  isModuleConstValueSafe,
  isModuleValueBindingSafe,
  resolveBindingReferences,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryReference } from '@moldea.ai/core/format';
import { parseRepositoryPath } from '@moldea.ai/repository';

import { GOOGLE_GENAI_FUNCTION_DECLARATION_LIMIT } from '../constants/index.js';
import type {
  IGoogleGenAiInspectionSession,
  IGoogleGenAiRequestRelationship,
  IGoogleGenAiSourceAnalysis,
} from '../contracts/index.js';
import {
  getGoogleGenAiFunctionDeclarationObjectShape,
  getGoogleGenAiFunctionDeclarationShape,
} from './function-declarations.js';

const ALLOWED_TOOL_PROPERTIES = new Set([
  'codeExecution',
  'computerUse',
  'enterpriseWebSearch',
  'exaAiSearch',
  'fileSearch',
  'functionDeclarations',
  'googleMaps',
  'googleSearch',
  'googleSearchRetrieval',
  'mcpServers',
  'parallelAiSearch',
  'retrieval',
  'urlContext',
]);

export interface IGoogleGenAiCollectionRegistration {
  readonly inputSchema?: IRepositoryReference;
  readonly reference: IRepositoryReference & { readonly symbol: string };
}

export interface IGoogleGenAiToolCollectionAnalysis {
  readonly absentExpression: ts.Expression | null;
  readonly hasAmbiguousCandidate: boolean;
  readonly limitViolationExpressions: readonly ts.ArrayLiteralExpression[];
  readonly presentRegistrationIndexes: ReadonlySet<number>;
}

interface IResolvedArray {
  readonly expression: ts.ArrayLiteralExpression;
  readonly isClosed: boolean;
}

interface IFunctionDeclarationResolution {
  readonly isSupported: boolean;
  readonly matchingRegistrationIndexes: readonly number[];
}

type IRegistrationIndex = ReadonlyMap<string, readonly number[]>;

const getDirectIdentifier = (expression: ts.Expression): ts.Identifier | null => {
  const candidate = unwrapExpression(expression);

  return ts.isIdentifier(candidate) ? candidate : null;
};

const collectDirectIdentifiers = (
  expressions: readonly ts.Expression[],
): ReadonlySet<ts.Identifier> =>
  new Set(
    expressions
      .map((expression) => getDirectIdentifier(expression))
      .filter((identifier): identifier is ts.Identifier => identifier !== null),
  );

const resolveArray = (
  expression: ts.Expression,
  analysis: IGoogleGenAiSourceAnalysis,
  allowedReferences: ReadonlySet<ts.Identifier>,
): IResolvedArray | null => {
  const candidate = unwrapExpression(expression);

  if (ts.isArrayLiteralExpression(candidate)) {
    return Object.freeze({ expression: candidate, isClosed: true });
  }

  const moduleArray = getSafeModuleConstLiteral(candidate, analysis, allowedReferences, 'array');

  return moduleArray === null || !ts.isArrayLiteralExpression(moduleArray.expression)
    ? null
    : Object.freeze({ expression: moduleArray.expression, isClosed: true });
};

const getArrayElements = (
  array: ts.ArrayLiteralExpression,
): {
  readonly expressions: readonly ts.Expression[];
  readonly isClosed: boolean;
} => {
  const expressions: ts.Expression[] = [];
  let isClosed = true;

  for (const element of array.elements) {
    if (ts.isOmittedExpression(element) || ts.isSpreadElement(element)) {
      isClosed = false;
      continue;
    }

    expressions.push(unwrapExpression(element));
  }

  return Object.freeze({ expressions: Object.freeze(expressions), isClosed });
};

const resolveToolContainer = (
  expression: ts.Expression,
  analysis: IGoogleGenAiSourceAnalysis,
  allowedReferences: ReadonlySet<ts.Identifier>,
): ts.ObjectLiteralExpression | null => {
  const candidate = unwrapExpression(expression);

  if (ts.isObjectLiteralExpression(candidate)) {
    return candidate;
  }

  const moduleObject = getSafeModuleConstLiteral(candidate, analysis, allowedReferences, 'object');

  return moduleObject !== null && ts.isObjectLiteralExpression(moduleObject.expression)
    ? moduleObject.expression
    : null;
};

const createReferenceKey = (path: string, symbol: string): string => JSON.stringify([path, symbol]);

/** Indexes registration positions once for direct binding-reference lookup. */
const indexRegistrations = (
  registrations: readonly IGoogleGenAiCollectionRegistration[],
): IRegistrationIndex => {
  const registrationIndex = new Map<string, number[]>();

  registrations.forEach(({ reference }, index) => {
    const key = createReferenceKey(reference.path, reference.symbol);
    const indexes = registrationIndex.get(key) ?? [];
    indexes.push(index);
    registrationIndex.set(key, indexes);
  });

  return new Map(
    [...registrationIndex].map(([key, indexes]) => [key, Object.freeze(indexes)] as const),
  );
};

const getRegistrationIndexes = (
  identifier: ts.Identifier,
  analysis: IGoogleGenAiSourceAnalysis,
  registrationIndex: IRegistrationIndex,
): readonly number[] => {
  const references = resolveBindingReferences(identifier, analysis);
  const matches = new Set<number>();

  for (const reference of references) {
    const indexes = registrationIndex.get(createReferenceKey(reference.path, reference.symbol));

    for (const index of indexes ?? []) {
      matches.add(index);
    }
  }

  return [...matches];
};

const getExistingImportedReference = async (
  identifier: ts.Identifier,
  analysis: IGoogleGenAiSourceAnalysis,
  session: IGoogleGenAiInspectionSession,
): Promise<{ readonly path: string; readonly symbol: string } | null> => {
  const references = resolveBindingReferences(identifier, analysis).filter(
    ({ path }) => path !== analysis.path,
  );
  const entries = await Promise.all(
    references.map(async (reference) => ({
      entry: await session.getEntry(parseRepositoryPath(reference.path)),
      reference,
    })),
  );
  session.signal?.throwIfAborted();
  const files = entries.filter(({ entry }) => entry?.type === 'file');

  return files.length === 1 ? (files[0]?.reference ?? null) : null;
};

const resolveLocalFunctionDeclaration = (
  identifier: ts.Identifier,
  analysis: IGoogleGenAiSourceAnalysis,
  allowedReferences: ReadonlySet<ts.Identifier>,
  inputSchema?: IRepositoryReference,
): boolean => {
  if (!isModuleBindingVisible(identifier, analysis)) {
    return false;
  }

  const declaration = analysis.moduleConstDeclarations.get(identifier.text);
  const initializer =
    declaration?.initializer === undefined ? null : unwrapExpression(declaration.initializer);

  return (
    declaration !== undefined &&
    initializer !== null &&
    ts.isObjectLiteralExpression(initializer) &&
    isModuleConstValueSafe(analysis, declaration, allowedReferences, 'object') &&
    getGoogleGenAiFunctionDeclarationObjectShape(analysis, initializer, inputSchema).kind ===
      'present-supported'
  );
};

const resolveFunctionDeclaration = async (
  expression: ts.Expression,
  analysis: IGoogleGenAiSourceAnalysis,
  allowedReferences: ReadonlySet<ts.Identifier>,
  registrations: readonly IGoogleGenAiCollectionRegistration[],
  registrationIndex: IRegistrationIndex,
  session: IGoogleGenAiInspectionSession,
): Promise<IFunctionDeclarationResolution> => {
  const candidate = unwrapExpression(expression);

  if (ts.isObjectLiteralExpression(candidate)) {
    return Object.freeze({
      isSupported:
        getGoogleGenAiFunctionDeclarationObjectShape(analysis, candidate).kind ===
        'present-supported',
      matchingRegistrationIndexes: Object.freeze([]),
    });
  }

  if (!ts.isIdentifier(candidate)) {
    return Object.freeze({ isSupported: false, matchingRegistrationIndexes: Object.freeze([]) });
  }

  if (!isModuleValueBindingSafe(analysis, candidate.text, null, allowedReferences, 'object')) {
    return Object.freeze({
      isSupported: false,
      matchingRegistrationIndexes: Object.freeze([]),
    });
  }

  const matchingRegistrationIndexes = getRegistrationIndexes(
    candidate,
    analysis,
    registrationIndex,
  );
  const matchingRegistration =
    matchingRegistrationIndexes.length === 1
      ? registrations[matchingRegistrationIndexes[0] as number]
      : undefined;
  const localDeclaration = analysis.moduleConstDeclarations.get(candidate.text);

  if (localDeclaration !== undefined) {
    return Object.freeze({
      isSupported: resolveLocalFunctionDeclaration(
        candidate,
        analysis,
        allowedReferences,
        matchingRegistration?.inputSchema,
      ),
      matchingRegistrationIndexes: Object.freeze(matchingRegistrationIndexes),
    });
  }

  const importedReference = await getExistingImportedReference(candidate, analysis, session);

  if (importedReference === null) {
    return Object.freeze({
      isSupported: false,
      matchingRegistrationIndexes: Object.freeze(matchingRegistrationIndexes),
    });
  }

  const importedResult = await session.analyzeSource(parseRepositoryPath(importedReference.path));
  session.signal?.throwIfAborted();

  if (importedResult.kind !== 'valid') {
    return Object.freeze({
      isSupported: false,
      matchingRegistrationIndexes: Object.freeze(matchingRegistrationIndexes),
    });
  }

  const shape = getGoogleGenAiFunctionDeclarationShape(
    importedResult.analysis,
    importedReference.symbol,
    matchingRegistration?.inputSchema,
  );
  const declaration = importedResult.analysis.moduleConstDeclarations.get(importedReference.symbol);
  const isSafe =
    declaration !== undefined &&
    isModuleConstValueSafe(importedResult.analysis, declaration, new Set(), 'object');

  return Object.freeze({
    isSupported: shape.kind === 'present-supported' && isSafe,
    matchingRegistrationIndexes: Object.freeze(matchingRegistrationIndexes),
  });
};

/**
 * Resolves nested tools and function declarations for supported generate-content requests.
 * @param analysis The indexed runtime-agent source.
 * @param relationships The independently classified `config.tools` relationships.
 * @param registrations Declared manifest registrations in deterministic capability order.
 * @param session The operation-local repository and source-analysis session.
 * @param hasAmbiguousRequest Whether runtime request discovery found an unresolved candidate.
 * @returns Positive registrations, conservative ambiguity, and proved limit violations.
 */
export const analyzeGoogleGenAiToolCollections = async (
  analysis: IGoogleGenAiSourceAnalysis,
  relationships: readonly IGoogleGenAiRequestRelationship[],
  registrations: readonly IGoogleGenAiCollectionRegistration[],
  session: IGoogleGenAiInspectionSession,
  hasAmbiguousRequest: boolean,
): Promise<IGoogleGenAiToolCollectionAnalysis> => {
  const toolExpressions = relationships
    .filter(
      (
        relationship,
      ): relationship is IGoogleGenAiRequestRelationship & {
        readonly expression: ts.Expression;
        readonly kind: 'present';
      } => relationship.kind === 'present',
    )
    .map(({ expression }) => expression);
  const allowedToolArrayReferences = collectDirectIdentifiers(toolExpressions);
  const toolArrays: IResolvedArray[] = [];
  let hasAmbiguousCandidate =
    hasAmbiguousRequest || relationships.some(({ kind }) => kind === 'unresolved');
  let absentExpression: ts.Expression | null = null;

  for (const expression of toolExpressions) {
    session.signal?.throwIfAborted();
    const array = resolveArray(expression, analysis, allowedToolArrayReferences);

    if (array === null) {
      hasAmbiguousCandidate = true;
      continue;
    }

    toolArrays.push(array);
    absentExpression ??= expression;
  }

  const toolContainerExpressions: ts.Expression[] = [];

  for (const { expression } of toolArrays) {
    const elements = getArrayElements(expression);
    hasAmbiguousCandidate ||= !elements.isClosed;
    toolContainerExpressions.push(...elements.expressions);
  }

  const allowedToolContainerReferences = collectDirectIdentifiers(toolContainerExpressions);
  const functionArrayExpressions: ts.Expression[] = [];

  for (const expression of toolContainerExpressions) {
    session.signal?.throwIfAborted();
    const container = resolveToolContainer(expression, analysis, allowedToolContainerReferences);

    if (container === null) {
      hasAmbiguousCandidate = true;
      continue;
    }

    const properties = getClosedObjectProperties(container);

    if (
      properties === null ||
      [...properties.keys()].some((propertyName) => !ALLOWED_TOOL_PROPERTIES.has(propertyName))
    ) {
      hasAmbiguousCandidate = true;
      continue;
    }

    const functionDeclarations = properties.get('functionDeclarations');

    if (functionDeclarations !== undefined) {
      functionArrayExpressions.push(functionDeclarations);
    }
  }

  const allowedFunctionArrayReferences = collectDirectIdentifiers(functionArrayExpressions);
  const functionArrays: IResolvedArray[] = [];
  const resolvedFunctionArrays = new Set<ts.ArrayLiteralExpression>();

  for (const expression of functionArrayExpressions) {
    session.signal?.throwIfAborted();
    const array = resolveArray(expression, analysis, allowedFunctionArrayReferences);

    if (array === null) {
      hasAmbiguousCandidate = true;
      continue;
    }

    if (!resolvedFunctionArrays.has(array.expression)) {
      resolvedFunctionArrays.add(array.expression);
      functionArrays.push(array);
    }
  }

  const functionElements = functionArrays.map(({ expression }) => ({
    array: expression,
    elements: getArrayElements(expression),
  }));
  const allowedFunctionDeclarationReferences = collectDirectIdentifiers(
    functionElements.flatMap(({ elements }) => elements.expressions),
  );
  const presentRegistrationIndexes = new Set<number>();
  const limitViolationExpressions: ts.ArrayLiteralExpression[] = [];
  const countedArrays = new Set<ts.ArrayLiteralExpression>();
  const resolutionCache = new Map<string, Promise<IFunctionDeclarationResolution>>();
  const registrationIndex = indexRegistrations(registrations);

  for (const { array, elements } of functionElements) {
    session.signal?.throwIfAborted();
    let isClosed = elements.isClosed;

    for (const expression of elements.expressions) {
      const identifier = getDirectIdentifier(expression);
      const cacheKey =
        identifier === null
          ? null
          : JSON.stringify({
              name: identifier.text,
              references: resolveBindingReferences(identifier, analysis),
            });
      let resolutionPromise = cacheKey === null ? undefined : resolutionCache.get(cacheKey);

      if (resolutionPromise === undefined) {
        resolutionPromise = resolveFunctionDeclaration(
          expression,
          analysis,
          allowedFunctionDeclarationReferences,
          registrations,
          registrationIndex,
          session,
        );

        if (cacheKey !== null) {
          resolutionCache.set(cacheKey, resolutionPromise);
        }
      }

      const resolution = await resolutionPromise;
      session.signal?.throwIfAborted();

      if (!resolution.isSupported || resolution.matchingRegistrationIndexes.length > 1) {
        isClosed = false;
        continue;
      }

      if (resolution.matchingRegistrationIndexes.length === 1) {
        presentRegistrationIndexes.add(resolution.matchingRegistrationIndexes[0] as number);
      }
    }

    if (!isClosed) {
      hasAmbiguousCandidate = true;
    } else if (
      elements.expressions.length > GOOGLE_GENAI_FUNCTION_DECLARATION_LIMIT &&
      !countedArrays.has(array)
    ) {
      countedArrays.add(array);
      limitViolationExpressions.push(array);
    }
  }

  return Object.freeze({
    absentExpression,
    hasAmbiguousCandidate,
    limitViolationExpressions: Object.freeze(limitViolationExpressions),
    presentRegistrationIndexes,
  });
};
