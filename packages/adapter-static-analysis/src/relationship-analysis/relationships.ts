import ts from 'typescript';

import type {
  IStaticAnalysisReference,
  IStaticAnalysisRelationshipResult,
  IStaticAnalysisRequestRelationship,
  IStaticAnalysisSource,
  IStaticAnalysisToolRegistration,
  IStaticAnalysisToolRelationship,
  IStaticAnalysisToolRelationshipOptions,
} from '../types.js';
import {
  isBoundIdentifier,
  isModuleBindingVisible,
  resolveBindingReferences,
} from '../typescript-analysis/bindings.js';
import {
  getDirectCall,
  isNullLiteral,
  isStaticLiteralValue,
  unwrapExpression,
} from '../typescript-analysis/expressions.js';
import { getClosedArrayIdentifiers } from '../typescript-analysis/requests.js';

/**
 * Classifies direct calls to one explicit instruction-loader binding.
 * @param analysis The runtime source containing request relationships.
 * @param relationships The provider request properties to inspect.
 * @param hasAmbiguousCandidate Whether request discovery found an unresolved provider call.
 * @param reference The declared instruction-loader reference.
 * @returns The provider-neutral relationship classification.
 */
export const classifyDirectCallRelationship = (
  analysis: IStaticAnalysisSource,
  relationships: readonly IStaticAnalysisRequestRelationship[],
  hasAmbiguousCandidate: boolean,
  reference: IStaticAnalysisReference,
): IStaticAnalysisRelationshipResult => {
  let absentExpression: ts.Expression | null = null;
  let hasAmbiguousRelationship = hasAmbiguousCandidate;

  for (const relationship of relationships) {
    if (relationship.kind === 'unresolved') {
      hasAmbiguousRelationship = true;
      continue;
    }

    if (relationship.kind === 'absent') {
      continue;
    }

    const expression = relationship.expression;
    const call = getDirectCall(expression);

    if (call !== null) {
      const callee = unwrapExpression(call.expression);

      if (ts.isIdentifier(callee) && isBoundIdentifier(callee, analysis, reference)) {
        return { kind: 'present' };
      }

      if (ts.isIdentifier(callee)) {
        absentExpression ??= expression;
        continue;
      }
    }

    if (isStaticLiteralValue(expression)) {
      absentExpression ??= expression;
    } else {
      hasAmbiguousRelationship = true;
    }
  }

  return hasAmbiguousRelationship
    ? { kind: 'ambiguous' }
    : { expression: absentExpression, kind: 'absent' };
};

/**
 * Classifies one registration schema expression against an explicit schema binding.
 * @param analysis The registration source containing the schema expression.
 * @param expression The registration schema expression.
 * @param reference The declared schema reference.
 * @returns The provider-neutral relationship classification.
 */
export const classifySchemaRelationship = (
  analysis: IStaticAnalysisSource,
  expression: ts.Expression,
  reference: IStaticAnalysisReference,
): IStaticAnalysisRelationshipResult => {
  const candidate = unwrapExpression(expression);

  if (ts.isIdentifier(candidate) && isBoundIdentifier(candidate, analysis, reference)) {
    return { kind: 'present' };
  }

  return isNullLiteral(candidate) ||
    (ts.isObjectLiteralExpression(candidate) && isStaticLiteralValue(candidate))
    ? { expression: candidate, kind: 'absent' }
    : { kind: 'ambiguous' };
};

const resolveClosedToolIdentifiers = (
  relationship: IStaticAnalysisRequestRelationship,
  analysis: IStaticAnalysisSource,
): readonly ts.Identifier[] | null | undefined => {
  if (relationship.kind === 'absent') {
    return [];
  }

  if (relationship.kind === 'unresolved') {
    return undefined;
  }

  const candidate = unwrapExpression(relationship.expression);

  if (ts.isArrayLiteralExpression(candidate)) {
    return getClosedArrayIdentifiers(candidate);
  }

  if (ts.isIdentifier(candidate) && isModuleBindingVisible(candidate, analysis)) {
    const moduleArray = analysis.moduleArrays.get(candidate.text);

    if (moduleArray === undefined || !analysis.safeModuleArrayNames.has(candidate.text)) {
      return null;
    }

    return getClosedArrayIdentifiers(moduleArray.expression);
  }

  return isStaticLiteralValue(candidate) ? [] : undefined;
};

const addRegistrationIndex = (
  index: Map<string, Map<string, number[]>>,
  registration: IStaticAnalysisToolRegistration<unknown>,
  registrationIndex: number,
): void => {
  let symbols = index.get(registration.reference.path);

  if (symbols === undefined) {
    symbols = new Map<string, number[]>();
    index.set(registration.reference.path, symbols);
  }

  const registrations = symbols.get(registration.reference.symbol);

  if (registrations === undefined) {
    symbols.set(registration.reference.symbol, [registrationIndex]);
  } else {
    registrations.push(registrationIndex);
  }
};

const getMatchingRegistrationIndexes = (
  identifier: ts.Identifier,
  analysis: IStaticAnalysisSource,
  index: ReadonlyMap<string, ReadonlyMap<string, readonly number[]>>,
): readonly number[] => {
  const matches = new Set<number>();

  for (const reference of resolveBindingReferences(identifier, analysis)) {
    for (const registrationIndex of index.get(reference.path)?.get(reference.symbol) ?? []) {
      matches.add(registrationIndex);
    }
  }

  return [...matches];
};

const createBindingCacheKey = (
  identifier: ts.Identifier,
  analysis: IStaticAnalysisSource,
): string => JSON.stringify(resolveBindingReferences(identifier, analysis));

const resolveAdditionalRegistration = async <TRegistration>(
  identifier: ts.Identifier,
  options: IStaticAnalysisToolRelationshipOptions<TRegistration>,
): Promise<boolean> => {
  const references = resolveBindingReferences(identifier, options.analysis);

  if (references.length === 0) {
    return false;
  }

  const localReference = references.find(({ path }) => path === options.analysis.path);

  if (localReference !== undefined) {
    return options.isSupportedAdditionalRegistration(options.analysis, localReference.symbol);
  }

  const entries = await Promise.all(
    references.map(async (reference) => ({
      entry: await options.getEntry(reference.path),
      reference,
    })),
  );
  options.signal?.throwIfAborted();
  const files = entries.filter(({ entry }) => entry?.type === 'file' && entry.path !== undefined);

  if (files.length !== 1 || files[0]?.entry?.path === undefined) {
    return false;
  }

  const reference = files[0].reference;
  const result = await options.analyzeSource(files[0].entry.path);
  options.signal?.throwIfAborted();

  return (
    result.kind === 'valid' &&
    options.isSupportedAdditionalRegistration(result.analysis, reference.symbol)
  );
};

/**
 * Classifies all declared tool registrations in one pass over closed request arrays.
 * @param options Indexed source, declared registrations, and provider validation callbacks.
 * @returns Relationship results in declared registration order.
 * @throws If relationship analysis is aborted or a provider callback rejects.
 */
export const classifyToolRelationships = async <TRegistration>(
  options: IStaticAnalysisToolRelationshipOptions<TRegistration>,
): Promise<readonly IStaticAnalysisToolRelationship<TRegistration>[]> => {
  if (options.registrations.length === 0) {
    return [];
  }

  const registrationIndex = new Map<string, Map<string, number[]>>();

  options.registrations.forEach((registration, index) =>
    addRegistrationIndex(registrationIndex, registration, index),
  );

  const additionalRegistrationCache = new Map<string, Promise<boolean>>();
  const presentRegistrationIndexes = new Set<number>();
  let absentExpression: ts.Expression | null = null;
  let hasAmbiguousRelationship = options.hasAmbiguousCandidate;

  for (const relationship of options.relationships) {
    options.signal?.throwIfAborted();
    const identifiers = resolveClosedToolIdentifiers(relationship, options.analysis);

    if (identifiers === null || identifiers === undefined) {
      hasAmbiguousRelationship = true;
      continue;
    }

    const requestRegistrationIndexes = new Set<number>();
    let isClosedRegistrationArray = true;

    for (const identifier of identifiers) {
      const matches = getMatchingRegistrationIndexes(
        identifier,
        options.analysis,
        registrationIndex,
      );

      if (matches.length === 1) {
        requestRegistrationIndexes.add(matches[0] as number);
        continue;
      }

      if (matches.length > 1) {
        isClosedRegistrationArray = false;
        break;
      }

      const cacheKey = createBindingCacheKey(identifier, options.analysis);
      let isSupported = additionalRegistrationCache.get(cacheKey);

      if (isSupported === undefined) {
        isSupported = resolveAdditionalRegistration(identifier, options);
        additionalRegistrationCache.set(cacheKey, isSupported);
      }

      if (!(await isSupported)) {
        isClosedRegistrationArray = false;
        break;
      }
    }

    if (!isClosedRegistrationArray) {
      hasAmbiguousRelationship = true;
      continue;
    }

    for (const registrationIndex of requestRegistrationIndexes) {
      presentRegistrationIndexes.add(registrationIndex);
    }

    absentExpression ??= relationship.kind === 'present' ? relationship.expression : null;
  }

  return options.registrations.map(({ registration }, index) =>
    Object.freeze({
      registration,
      relationship: presentRegistrationIndexes.has(index)
        ? Object.freeze({ kind: 'present' as const })
        : hasAmbiguousRelationship
          ? Object.freeze({ kind: 'ambiguous' as const })
          : Object.freeze({ expression: absentExpression, kind: 'absent' as const }),
    }),
  );
};
