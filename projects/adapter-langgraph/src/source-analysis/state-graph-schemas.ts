import ts from 'typescript';

import { unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type {
  ILangGraphInspectionSession,
  ILangGraphSchemaRelationship,
  ILangGraphSchemaSource,
  ILangGraphSourceAnalysis,
  ILangGraphSourceFailure,
} from '../contracts/index.js';
import {
  getLangGraphPropertyName,
  hasLangGraphPrototypeSetter,
  isLangGraphExplicitOmission,
  isLangGraphNullishSchemaValue,
  isLangGraphOpaqueObjectValue,
  isLangGraphObjectFamilyValue,
  resolveLangGraphConstBinding,
  resolveLangGraphSchemaSource,
} from './bindings.js';

const MODERN_INITIALIZER_KEYS = new Set([
  'state',
  'stateSchema',
  'input',
  'output',
  'context',
  'interrupt',
  'writer',
  'nodes',
]);
const OVERLOAD_OPTIONS_KEYS = new Set([
  'input',
  'output',
  'context',
  'interrupt',
  'writer',
  'nodes',
]);
const SCHEMA_KEYS = new Set(['state', 'stateSchema', 'input', 'output']);

type ILangGraphSchemaRoleState =
  | { readonly kind: 'absent' }
  | { readonly kind: 'excluded' }
  | { readonly kind: 'impossible' }
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'supported'; readonly source: ILangGraphSchemaSource };

export type ILangGraphConstructorResult =
  | {
      readonly kind: 'supported';
      readonly inputSchema: ILangGraphSchemaRelationship;
      readonly outputSchema: ILangGraphSchemaRelationship;
    }
  | { readonly kind: 'unsupported' };

const ABSENT_SCHEMA_ROLE = Object.freeze({ kind: 'absent' } as const);
const UNRESOLVED_SCHEMA_RELATIONSHIP = Object.freeze({ kind: 'unresolved' } as const);

const isStaticallyImpossibleValue = (expression: ts.Expression): boolean => {
  const candidate = unwrapExpression(expression);

  return (
    candidate.kind === ts.SyntaxKind.NullKeyword ||
    candidate.kind === ts.SyntaxKind.TrueKeyword ||
    candidate.kind === ts.SyntaxKind.FalseKeyword ||
    ts.isStringLiteral(candidate) ||
    ts.isNoSubstitutionTemplateLiteral(candidate) ||
    ts.isNumericLiteral(candidate) ||
    ts.isBigIntLiteral(candidate) ||
    ts.isRegularExpressionLiteral(candidate) ||
    ts.isArrayLiteralExpression(candidate) ||
    ts.isArrowFunction(candidate) ||
    ts.isFunctionExpression(candidate) ||
    ts.isClassExpression(candidate) ||
    ts.isVoidExpression(candidate)
  );
};

const classifySchemaRole = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphSchemaRoleState> => {
  if (await isLangGraphNullishSchemaValue(session, analysis, expression, onSourceFailure)) {
    return ABSENT_SCHEMA_ROLE;
  }

  const candidate = unwrapExpression(expression);

  if (ts.isObjectLiteralExpression(candidate)) {
    return Object.freeze({ kind: 'excluded' });
  }

  const schemaSource = await resolveLangGraphSchemaSource(
    session,
    analysis,
    candidate,
    onSourceFailure,
  );

  if (schemaSource !== null) {
    return Object.freeze({ kind: 'supported', source: schemaSource });
  }

  if (ts.isConditionalExpression(candidate)) {
    const [whenTrue, whenFalse] = await Promise.all([
      classifySchemaRole(session, analysis, candidate.whenTrue, onSourceFailure),
      classifySchemaRole(session, analysis, candidate.whenFalse, onSourceFailure),
    ]);

    if (whenTrue.kind === 'absent' && whenFalse.kind === 'absent') {
      return ABSENT_SCHEMA_ROLE;
    }

    if (
      whenTrue.kind === 'supported' ||
      whenTrue.kind === 'unresolved' ||
      whenFalse.kind === 'supported' ||
      whenFalse.kind === 'unresolved'
    ) {
      return Object.freeze({ kind: 'unresolved' });
    }

    return whenTrue.kind === 'excluded' || whenFalse.kind === 'excluded'
      ? Object.freeze({ kind: 'excluded' })
      : Object.freeze({ kind: 'impossible' });
  }

  if (isStaticallyImpossibleValue(candidate)) {
    return Object.freeze({ kind: 'impossible' });
  }

  const bound = await resolveLangGraphConstBinding(session, analysis, candidate, onSourceFailure);

  if (bound !== null) {
    if (ts.isObjectLiteralExpression(bound.expression)) {
      return Object.freeze({ kind: 'excluded' });
    }

    return isStaticallyImpossibleValue(bound.expression)
      ? Object.freeze({ kind: 'impossible' })
      : Object.freeze({ kind: 'unresolved' });
  }

  return (await isLangGraphOpaqueObjectValue(session, analysis, candidate, onSourceFailure))
    ? Object.freeze({ kind: 'unresolved' })
    : Object.freeze({ kind: 'excluded' });
};

const toSchemaRelationship = (
  role: ILangGraphSchemaRoleState,
  schemaSource: 'explicit-input' | 'explicit-output' | 'state-fallback',
): ILangGraphSchemaRelationship =>
  role.kind === 'supported'
    ? Object.freeze({ kind: 'present', schemaSource, source: role.source })
    : role.kind === 'unresolved'
      ? UNRESOLVED_SCHEMA_RELATIONSHIP
      : Object.freeze({ kind: 'absent' });

const getEffectiveStateRole = (
  roles: ReadonlyMap<string, ILangGraphSchemaRoleState>,
): ILangGraphSchemaRoleState => {
  for (const name of ['state', 'stateSchema', 'input']) {
    const role = roles.get(name) ?? ABSENT_SCHEMA_ROLE;

    if (role.kind !== 'absent') {
      return role;
    }
  }

  return ABSENT_SCHEMA_ROLE;
};

const inspectModernInitializer = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  object: ts.ObjectLiteralExpression,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphConstructorResult> => {
  const roles = new Map<string, ILangGraphSchemaRoleState>();
  const seenNames = new Set<string>();
  let hasUnscopedSchemaAmbiguity = hasLangGraphPrototypeSetter(object);
  let hasPotentialState = false;

  if (hasUnscopedSchemaAmbiguity) {
    hasPotentialState = true;
  }

  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name)) {
      hasUnscopedSchemaAmbiguity = true;
      hasPotentialState = true;
      continue;
    }

    const name = getLangGraphPropertyName(property.name);

    if (name === '__proto__' && ts.isPropertyAssignment(property)) {
      hasUnscopedSchemaAmbiguity = true;
      hasPotentialState = true;
      continue;
    }

    if (name === null || !MODERN_INITIALIZER_KEYS.has(name)) {
      return Object.freeze({ kind: 'unsupported' });
    }

    if (seenNames.has(name)) {
      if (SCHEMA_KEYS.has(name)) {
        roles.set(name, UNRESOLVED_SCHEMA_RELATIONSHIP);
        hasPotentialState ||= name !== 'output';
      }
      continue;
    }

    seenNames.add(name);

    if (name === 'context' && ts.isPropertyAssignment(property)) {
      const isContextViable =
        (await isLangGraphNullishSchemaValue(
          session,
          analysis,
          property.initializer,
          onSourceFailure,
        )) ||
        (await resolveLangGraphSchemaSource(
          session,
          analysis,
          property.initializer,
          onSourceFailure,
        )) !== null ||
        (await isLangGraphObjectFamilyValue(
          session,
          analysis,
          property.initializer,
          onSourceFailure,
        )) ||
        (await isLangGraphOpaqueObjectValue(
          session,
          analysis,
          property.initializer,
          onSourceFailure,
        ));

      if (!isContextViable) {
        return Object.freeze({ kind: 'unsupported' });
      }

      continue;
    }

    if (!SCHEMA_KEYS.has(name)) {
      continue;
    }

    if (ts.isPropertyAssignment(property)) {
      const role = await classifySchemaRole(
        session,
        analysis,
        property.initializer,
        onSourceFailure,
      );

      if (role.kind === 'excluded' || role.kind === 'impossible') {
        return Object.freeze({ kind: 'unsupported' });
      }

      roles.set(name, role);
      hasPotentialState ||= name !== 'output' && role.kind !== 'absent';
      continue;
    }

    if (ts.isShorthandPropertyAssignment(property)) {
      const role = await classifySchemaRole(session, analysis, property.name, onSourceFailure);

      if (role.kind === 'excluded' || role.kind === 'impossible') {
        return Object.freeze({ kind: 'unsupported' });
      }

      roles.set(name, role.kind === 'absent' ? ABSENT_SCHEMA_ROLE : UNRESOLVED_SCHEMA_RELATIONSHIP);
      hasPotentialState ||= name !== 'output' && role.kind !== 'absent';
      continue;
    }

    if (ts.isGetAccessorDeclaration(property)) {
      roles.set(name, UNRESOLVED_SCHEMA_RELATIONSHIP);
      hasPotentialState ||= name !== 'output';
      continue;
    }

    return Object.freeze({ kind: 'unsupported' });
  }

  if (!hasPotentialState) {
    return Object.freeze({ kind: 'unsupported' });
  }

  if (hasUnscopedSchemaAmbiguity) {
    return Object.freeze({
      inputSchema: UNRESOLVED_SCHEMA_RELATIONSHIP,
      kind: 'supported',
      outputSchema: UNRESOLVED_SCHEMA_RELATIONSHIP,
    });
  }

  const stateRole = getEffectiveStateRole(roles);
  const inputRole = roles.get('input') ?? ABSENT_SCHEMA_ROLE;
  const outputRole = roles.get('output') ?? ABSENT_SCHEMA_ROLE;

  return Object.freeze({
    inputSchema: toSchemaRelationship(
      inputRole.kind === 'absent' ? stateRole : inputRole,
      inputRole.kind === 'absent' ? 'state-fallback' : 'explicit-input',
    ),
    kind: 'supported',
    outputSchema: toSchemaRelationship(
      outputRole.kind === 'absent' ? stateRole : outputRole,
      outputRole.kind === 'absent' ? 'state-fallback' : 'explicit-output',
    ),
  });
};

const isTargetViableOverloadOptions = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<boolean> => {
  if (await isLangGraphExplicitOmission(session, analysis, expression)) {
    return true;
  }

  const candidate = unwrapExpression(expression);

  if (!ts.isObjectLiteralExpression(candidate)) {
    return (
      (await isLangGraphObjectFamilyValue(session, analysis, candidate, onSourceFailure)) ||
      (await isLangGraphOpaqueObjectValue(session, analysis, candidate, onSourceFailure))
    );
  }

  const seenNames = new Set<string>();

  for (const property of candidate.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      ts.isComputedPropertyName(property.name) ||
      hasLangGraphPrototypeSetter(candidate)
    ) {
      return false;
    }

    const name = getLangGraphPropertyName(property.name);

    if (name === null || !OVERLOAD_OPTIONS_KEYS.has(name) || seenNames.has(name)) {
      return false;
    }

    seenNames.add(name);

    if (name === 'input' || name === 'output') {
      const role = await classifySchemaRole(
        session,
        analysis,
        property.initializer,
        onSourceFailure,
      );

      if (role.kind === 'excluded' || role.kind === 'impossible') {
        return false;
      }
    } else if (
      name === 'context' &&
      !(await isLangGraphNullishSchemaValue(
        session,
        analysis,
        property.initializer,
        onSourceFailure,
      )) &&
      (await resolveLangGraphSchemaSource(
        session,
        analysis,
        property.initializer,
        onSourceFailure,
      )) === null &&
      !(await isLangGraphObjectFamilyValue(
        session,
        analysis,
        property.initializer,
        onSourceFailure,
      )) &&
      !(await isLangGraphOpaqueObjectValue(
        session,
        analysis,
        property.initializer,
        onSourceFailure,
      ))
    ) {
      return false;
    }
  }

  return true;
};

/** Classifies one version-matched StateGraph constructor and its effective schemas. */
export const inspectLangGraphConstructor = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  constructor: ts.NewExpression,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphConstructorResult> => {
  if (
    constructor.arguments === undefined ||
    constructor.arguments.length < 1 ||
    constructor.arguments.length > 2
  ) {
    return Object.freeze({ kind: 'unsupported' });
  }

  const firstArgument = unwrapExpression(constructor.arguments[0] as ts.Expression);

  if (ts.isObjectLiteralExpression(firstArgument)) {
    return constructor.arguments.length === 1
      ? inspectModernInitializer(session, analysis, firstArgument, onSourceFailure)
      : Object.freeze({ kind: 'unsupported' });
  }

  if (
    isStaticallyImpossibleValue(firstArgument) ||
    !(await isLangGraphOpaqueObjectValue(session, analysis, firstArgument, onSourceFailure))
  ) {
    return Object.freeze({ kind: 'unsupported' });
  }

  if (
    constructor.arguments.length === 2 &&
    !(await isTargetViableOverloadOptions(
      session,
      analysis,
      constructor.arguments[1] as ts.Expression,
      onSourceFailure,
    ))
  ) {
    return Object.freeze({ kind: 'unsupported' });
  }

  return Object.freeze({
    inputSchema: Object.freeze({ kind: 'absent' }),
    kind: 'supported',
    outputSchema: Object.freeze({ kind: 'absent' }),
  });
};
