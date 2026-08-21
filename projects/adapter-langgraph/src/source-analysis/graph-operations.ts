import ts from 'typescript';

import { getClosedObjectProperties, unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import { LANGGRAPH_PATTERN_IDS } from '../constants/index.js';
import type {
  ILangGraphInspectionSession,
  ILangGraphRuntimePattern,
  ILangGraphSourceAnalysis,
  ILangGraphSourceFailure,
  ILangGraphStateGraphOperation,
} from '../contracts/index.js';
import { isLangGraphEvidenceSafeName, isLangGraphMachineString } from '../inspection/common.js';
import {
  getLangGraphMemberName,
  getLangGraphPropertyName,
  hasLangGraphPrototypeSetter,
  hasLangGraphTypeArgumentCount,
  isLangGraphExplicitOmission,
  isLangGraphOpaqueObjectValue,
  isLangGraphObjectFamilyValue,
  isLangGraphRuntimeImport,
  resolveLangGraphAggregateLiteral,
  resolveLangGraphConstBinding,
} from './bindings.js';
import { isLangGraphOpaqueRunnable, resolveLangGraphFunction } from './functions.js';
import { resolveLangGraphStaticString } from './static-strings.js';

type ILangGraphEndpoint =
  | { readonly kind: 'end' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'node'; readonly name: string }
  | { readonly kind: 'opaque' }
  | { readonly kind: 'start' };

type ILangGraphEndpointRole = 'node' | 'source' | 'target';

type ILangGraphRunnable =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'opaque' }
  | {
      readonly kind: 'supported';
      readonly reference: {
        readonly path: ILangGraphSourceAnalysis['path'];
        readonly symbol: string;
      } | null;
    }
  | { readonly kind: 'viable' };

export type ILangGraphOperationsResult =
  | { readonly kind: 'supported'; readonly patterns: readonly ILangGraphRuntimePattern[] }
  | { readonly kind: 'unsupported' };

const isSafeRuntimeName = (name: string): boolean =>
  isLangGraphMachineString(name) && isLangGraphEvidenceSafeName(name);

const createPattern = (
  patternId: ILangGraphRuntimePattern['patternId'],
  graphPath: ILangGraphSourceAnalysis['path'],
  runtimeName: string | null,
  details: ILangGraphRuntimePattern['details'],
  additionalReference?: {
    readonly path: ILangGraphSourceAnalysis['path'];
    readonly symbol: string;
  } | null,
): ILangGraphRuntimePattern =>
  Object.freeze({
    details: Object.freeze({ ...details, patternId }),
    patternId,
    references: Object.freeze([
      Object.freeze({ path: graphPath }),
      ...(additionalReference === undefined || additionalReference === null
        ? []
        : [Object.freeze(additionalReference)]),
    ]),
    runtimeName,
  });

const isOpaqueStringExpression = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<boolean> => {
  const candidate = unwrapExpression(expression);

  if (
    ts.isTemplateExpression(candidate) ||
    ts.isCallExpression(candidate) ||
    (ts.isPropertyAccessExpression(candidate) && candidate.questionDotToken === undefined)
  ) {
    return true;
  }

  const binding = await resolveLangGraphConstBinding(session, analysis, candidate, onSourceFailure);
  const initializer = binding?.expression;

  return (
    initializer !== undefined &&
    (ts.isTemplateExpression(initializer) ||
      ts.isCallExpression(initializer) ||
      (ts.isPropertyAccessExpression(initializer) && initializer.questionDotToken === undefined))
  );
};

const isEndpointViableForRole = (
  endpoint: ILangGraphEndpoint,
  role: ILangGraphEndpointRole,
): boolean =>
  endpoint.kind === 'opaque' ||
  endpoint.kind === 'node' ||
  (role === 'source' && endpoint.kind === 'start') ||
  (role === 'target' && endpoint.kind === 'end');

const classifyEndpoint = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  role: ILangGraphEndpointRole,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphEndpoint> => {
  const candidate = unwrapExpression(expression);

  if (ts.isConditionalExpression(candidate)) {
    const [whenTrue, whenFalse] = await Promise.all([
      classifyEndpoint(session, analysis, candidate.whenTrue, role, onSourceFailure),
      classifyEndpoint(session, analysis, candidate.whenFalse, role, onSourceFailure),
    ]);

    return whenTrue.kind !== 'invalid' || whenFalse.kind !== 'invalid'
      ? Object.freeze({ kind: 'opaque' })
      : Object.freeze({ kind: 'invalid' });
  }

  let endpoint: ILangGraphEndpoint | null = null;

  if (ts.isIdentifier(candidate)) {
    if (isLangGraphRuntimeImport(candidate, analysis.imports.startNames, analysis)) {
      endpoint = Object.freeze({ kind: 'start' });
    }

    if (isLangGraphRuntimeImport(candidate, analysis.imports.endNames, analysis)) {
      endpoint = Object.freeze({ kind: 'end' });
    }
  }

  if (endpoint !== null) {
    return isEndpointViableForRole(endpoint, role) ? endpoint : Object.freeze({ kind: 'invalid' });
  }

  const staticString = await resolveLangGraphStaticString(
    session,
    analysis,
    candidate,
    onSourceFailure,
  );

  if (staticString.kind === 'supported') {
    const { value } = staticString.value;

    if (value === '__start__') {
      endpoint = Object.freeze({ kind: 'start' });
    } else if (value === '__end__') {
      endpoint = Object.freeze({ kind: 'end' });
    } else {
      endpoint =
        value.includes('|') || value.includes(':')
          ? Object.freeze({ kind: 'invalid' })
          : Object.freeze({ kind: 'node', name: value });
    }

    return isEndpointViableForRole(endpoint, role) ? endpoint : Object.freeze({ kind: 'invalid' });
  }

  return (await isOpaqueStringExpression(session, analysis, candidate, onSourceFailure))
    ? Object.freeze({ kind: 'opaque' })
    : Object.freeze({ kind: 'invalid' });
};

const classifyRunnable = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  role: 'node' | 'router',
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphRunnable> => {
  const resolvedFunction = await resolveLangGraphFunction(
    session,
    analysis,
    expression,
    'runnable',
    onSourceFailure,
  );

  if (resolvedFunction !== null) {
    return Object.freeze({ kind: 'supported', reference: resolvedFunction.reference });
  }

  const candidate = unwrapExpression(expression);

  if (
    ts.isCallExpression(candidate) ||
    ts.isNewExpression(candidate) ||
    (ts.isPropertyAccessExpression(candidate) && candidate.questionDotToken === undefined)
  ) {
    return Object.freeze({ kind: 'viable' });
  }

  if (ts.isConditionalExpression(candidate)) {
    const [whenTrue, whenFalse] = await Promise.all([
      classifyRunnable(session, analysis, candidate.whenTrue, role, onSourceFailure),
      classifyRunnable(session, analysis, candidate.whenFalse, role, onSourceFailure),
    ]);

    return whenTrue.kind !== 'invalid' || whenFalse.kind !== 'invalid'
      ? Object.freeze({ kind: 'viable' })
      : Object.freeze({ kind: 'invalid' });
  }

  if (role === 'node') {
    const runnableMap = await resolveLangGraphAggregateLiteral(
      session,
      analysis,
      candidate,
      'object',
      onSourceFailure,
    );

    if (runnableMap !== null && runnableMap.expression.properties.length > 0) {
      const properties = getClosedObjectProperties(runnableMap.expression);

      if (properties === null) {
        return Object.freeze({ kind: 'invalid' });
      }

      for (const action of properties.values()) {
        if (
          (await classifyRunnable(session, runnableMap.analysis, action, 'node', onSourceFailure))
            .kind === 'invalid'
        ) {
          return Object.freeze({ kind: 'invalid' });
        }
      }

      return Object.freeze({ kind: 'viable' });
    }
  }

  const binding = await resolveLangGraphConstBinding(
    session,
    analysis,
    expression,
    onSourceFailure,
  );

  return binding !== null && isLangGraphOpaqueRunnable(binding.expression)
    ? Object.freeze({ kind: 'opaque' })
    : Object.freeze({ kind: 'invalid' });
};

const isTargetViableObject = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<boolean> => {
  const candidate = unwrapExpression(expression);

  return (
    (await isLangGraphObjectFamilyValue(session, analysis, candidate, onSourceFailure)) ||
    (await isLangGraphOpaqueObjectValue(session, analysis, candidate, onSourceFailure))
  );
};

const inspectAddNode = async (
  session: ILangGraphInspectionSession,
  operation: ILangGraphStateGraphOperation,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphOperationsResult> => {
  const { analysis, call } = operation;

  if (call.arguments.length === 1) {
    const collection = unwrapExpression(call.arguments[0] as ts.Expression);
    const object = await resolveLangGraphAggregateLiteral(
      session,
      analysis,
      collection,
      'object',
      onSourceFailure,
    );
    const array = await resolveLangGraphAggregateLiteral(
      session,
      analysis,
      collection,
      'array',
      onSourceFailure,
    );

    if (object !== null) {
      if (!hasLangGraphTypeArgumentCount(call, 2) || object.expression.properties.length === 0) {
        return Object.freeze({ kind: 'unsupported' });
      } else {
        const properties = getClosedObjectProperties(object.expression);

        if (properties === null) {
          return Object.freeze({ kind: 'unsupported' });
        }

        for (const [name, action] of properties) {
          if (
            name === '__start__' ||
            name === '__end__' ||
            name.includes('|') ||
            name.includes(':') ||
            (await classifyRunnable(session, object.analysis, action, 'node', onSourceFailure))
              .kind === 'invalid'
          ) {
            return Object.freeze({ kind: 'unsupported' });
          }
        }

        return Object.freeze({ kind: 'supported', patterns: Object.freeze([]) });
      }
    }

    if (array !== null) {
      if (!hasLangGraphTypeArgumentCount(call, 1, 3) || array.expression.elements.length === 0) {
        return Object.freeze({ kind: 'unsupported' });
      }

      for (const element of array.expression.elements) {
        if (ts.isOmittedExpression(element) || ts.isSpreadElement(element)) {
          return Object.freeze({ kind: 'unsupported' });
        }

        const tuple = unwrapExpression(element);

        if (
          !ts.isArrayLiteralExpression(tuple) ||
          tuple.elements.length < 2 ||
          tuple.elements.length > 3 ||
          tuple.elements.some(ts.isOmittedExpression)
        ) {
          return Object.freeze({ kind: 'unsupported' });
        }

        const name = await classifyEndpoint(
          session,
          array.analysis,
          tuple.elements[0] as ts.Expression,
          'node',
          onSourceFailure,
        );
        const runnable = await classifyRunnable(
          session,
          array.analysis,
          tuple.elements[1] as ts.Expression,
          'node',
          onSourceFailure,
        );

        if (name.kind !== 'node' || runnable.kind === 'invalid') {
          return Object.freeze({ kind: 'unsupported' });
        }

        if (
          tuple.elements.length === 3 &&
          !(await isLangGraphExplicitOmission(
            session,
            array.analysis,
            tuple.elements[2] as ts.Expression,
          )) &&
          !(await isTargetViableObject(
            session,
            array.analysis,
            tuple.elements[2] as ts.Expression,
            onSourceFailure,
          ))
        ) {
          return Object.freeze({ kind: 'unsupported' });
        }
      }

      return Object.freeze({ kind: 'supported', patterns: Object.freeze([]) });
    }

    return (await isLangGraphOpaqueObjectValue(session, analysis, collection, onSourceFailure)) &&
      hasLangGraphTypeArgumentCount(call, 1, 3)
      ? Object.freeze({ kind: 'supported', patterns: Object.freeze([]) })
      : Object.freeze({ kind: 'unsupported' });
  }

  if (
    call.arguments.length < 2 ||
    call.arguments.length > 3 ||
    !hasLangGraphTypeArgumentCount(call, 1, 3)
  ) {
    return Object.freeze({ kind: 'unsupported' });
  }

  const name = await classifyEndpoint(
    session,
    analysis,
    call.arguments[0] as ts.Expression,
    'node',
    onSourceFailure,
  );
  const runnable = await classifyRunnable(
    session,
    analysis,
    call.arguments[1] as ts.Expression,
    'node',
    onSourceFailure,
  );

  if (
    name.kind === 'invalid' ||
    name.kind === 'start' ||
    name.kind === 'end' ||
    runnable.kind === 'invalid'
  ) {
    return Object.freeze({ kind: 'unsupported' });
  }

  if (
    call.arguments.length === 3 &&
    !(await isLangGraphExplicitOmission(session, analysis, call.arguments[2] as ts.Expression)) &&
    !(await isTargetViableObject(
      session,
      analysis,
      call.arguments[2] as ts.Expression,
      onSourceFailure,
    ))
  ) {
    return Object.freeze({ kind: 'unsupported' });
  }

  if (name.kind !== 'node' || runnable.kind === 'viable') {
    return Object.freeze({ kind: 'supported', patterns: Object.freeze([]) });
  }

  const runtimeName = isSafeRuntimeName(name.name) ? name.name : null;

  return Object.freeze({
    kind: 'supported',
    patterns: Object.freeze([
      createPattern(
        LANGGRAPH_PATTERN_IDS.StateGraphNode,
        analysis.path,
        runtimeName,
        { graphOperation: 'addNode' },
        runnable.kind === 'supported' ? runnable.reference : null,
      ),
    ]),
  });
};

const inspectAddEdge = async (
  session: ILangGraphInspectionSession,
  operation: ILangGraphStateGraphOperation,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphOperationsResult> => {
  const { analysis, call } = operation;

  if (call.arguments.length !== 2 || call.typeArguments !== undefined) {
    return Object.freeze({ kind: 'unsupported' });
  }

  const sourceExpression = unwrapExpression(call.arguments[0] as ts.Expression);
  const target = await classifyEndpoint(
    session,
    analysis,
    call.arguments[1] as ts.Expression,
    'target',
    onSourceFailure,
  );

  const sourceArray = await resolveLangGraphAggregateLiteral(
    session,
    analysis,
    sourceExpression,
    'array',
    onSourceFailure,
  );

  if (sourceArray !== null) {
    if (
      sourceArray.expression.elements.length === 0 ||
      (target.kind !== 'node' && target.kind !== 'opaque') ||
      sourceArray.expression.elements.some(
        (element) => ts.isOmittedExpression(element) || ts.isSpreadElement(element),
      )
    ) {
      return Object.freeze({ kind: 'unsupported' });
    }

    let hasOpaqueEndpoint = target.kind === 'opaque';

    for (const element of sourceArray.expression.elements) {
      const endpoint = await classifyEndpoint(
        session,
        sourceArray.analysis,
        element,
        'node',
        onSourceFailure,
      );

      if (endpoint.kind !== 'node' && endpoint.kind !== 'opaque') {
        return Object.freeze({ kind: 'unsupported' });
      }

      hasOpaqueEndpoint ||= endpoint.kind === 'opaque';
    }

    if (hasOpaqueEndpoint) {
      return Object.freeze({ kind: 'supported', patterns: Object.freeze([]) });
    }

    return Object.freeze({
      kind: 'supported',
      patterns: Object.freeze([
        createPattern(LANGGRAPH_PATTERN_IDS.StateGraphEdge, analysis.path, null, {
          edgeKind: 'waiting',
          graphOperation: 'addEdge',
          ...(target.kind === 'node' && isLangGraphEvidenceSafeName(target.name)
            ? { targetName: target.name }
            : {}),
        }),
      ]),
    });
  }

  const source = await classifyEndpoint(
    session,
    analysis,
    sourceExpression,
    'source',
    onSourceFailure,
  );

  if (
    source.kind === 'invalid' ||
    source.kind === 'end' ||
    target.kind === 'invalid' ||
    target.kind === 'start' ||
    (source.kind === 'start' && target.kind === 'end')
  ) {
    return Object.freeze({ kind: 'unsupported' });
  }

  if (source.kind === 'opaque' || target.kind === 'opaque') {
    return Object.freeze({ kind: 'supported', patterns: Object.freeze([]) });
  }

  const sourceName = source.kind === 'start' ? '__start__' : source.name;
  const targetName = target.kind === 'end' ? '__end__' : target.name;

  return Object.freeze({
    kind: 'supported',
    patterns: Object.freeze([
      createPattern(LANGGRAPH_PATTERN_IDS.StateGraphEdge, analysis.path, null, {
        edgeKind: 'direct',
        graphOperation: 'addEdge',
        ...(isLangGraphEvidenceSafeName(sourceName) ? { sourceName } : {}),
        ...(isLangGraphEvidenceSafeName(targetName) ? { targetName } : {}),
      }),
    ]),
  });
};

const isTargetViablePathMap = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<boolean> => {
  if (await isLangGraphExplicitOmission(session, analysis, expression)) {
    return true;
  }

  const candidate = unwrapExpression(expression);

  if (ts.isConditionalExpression(candidate)) {
    const whenTrue = await isTargetViablePathMap(
      session,
      analysis,
      candidate.whenTrue,
      onSourceFailure,
    );
    const whenFalse = await isTargetViablePathMap(
      session,
      analysis,
      candidate.whenFalse,
      onSourceFailure,
    );

    return whenTrue || whenFalse;
  }

  const array = await resolveLangGraphAggregateLiteral(
    session,
    analysis,
    candidate,
    'array',
    onSourceFailure,
  );

  if (array !== null) {
    for (const element of array.expression.elements) {
      if (ts.isOmittedExpression(element) || ts.isSpreadElement(element)) {
        continue;
      }

      const endpoint = await classifyEndpoint(
        session,
        array.analysis,
        element,
        'target',
        onSourceFailure,
      );

      if (endpoint.kind === 'invalid' || endpoint.kind === 'start') {
        return false;
      }
    }

    return true;
  }

  const object = await resolveLangGraphAggregateLiteral(
    session,
    analysis,
    candidate,
    'object',
    onSourceFailure,
  );

  if (object !== null) {
    for (const property of object.expression.properties) {
      if (ts.isShorthandPropertyAssignment(property)) {
        const endpoint = await classifyEndpoint(
          session,
          object.analysis,
          property.name,
          'target',
          onSourceFailure,
        );

        if (endpoint.kind === 'invalid') {
          return false;
        }

        continue;
      }

      if (!ts.isPropertyAssignment(property)) {
        if (
          ts.isMethodDeclaration(property) ||
          (ts.isAccessor(property) && !ts.isGetAccessorDeclaration(property))
        ) {
          return false;
        }

        continue;
      }

      if (ts.isComputedPropertyName(property.name)) {
        continue;
      }

      if (getLangGraphPropertyName(property.name) === '__proto__') {
        continue;
      }

      const endpoint = await classifyEndpoint(
        session,
        object.analysis,
        property.initializer,
        'target',
        onSourceFailure,
      );

      if (endpoint.kind === 'invalid' || endpoint.kind === 'start') {
        return false;
      }
    }

    return true;
  }

  const binding = await resolveLangGraphConstBinding(session, analysis, candidate, onSourceFailure);

  if (binding !== null && binding.expression !== candidate) {
    return isTargetViablePathMap(session, binding.analysis, binding.expression, onSourceFailure);
  }

  return isLangGraphOpaqueObjectValue(session, analysis, candidate, onSourceFailure);
};

const inspectConditionalEdge = async (
  session: ILangGraphInspectionSession,
  operation: ILangGraphStateGraphOperation,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphOperationsResult> => {
  const { analysis, call } = operation;

  if (call.typeArguments !== undefined || call.arguments.length < 1 || call.arguments.length > 3) {
    return Object.freeze({ kind: 'unsupported' });
  }

  let sourceExpression: ts.Expression;
  let routerExpression: ts.Expression;
  let pathMapExpression: ts.Expression | undefined;

  if (call.arguments.length === 1) {
    const object = unwrapExpression(call.arguments[0] as ts.Expression);

    if (!ts.isObjectLiteralExpression(object) || hasLangGraphPrototypeSetter(object)) {
      return Object.freeze({ kind: 'unsupported' });
    }

    const properties = getClosedObjectProperties(object);

    if (
      properties === null ||
      [...properties.keys()].some((name) => !['source', 'path', 'pathMap'].includes(name)) ||
      !properties.has('source') ||
      !properties.has('path')
    ) {
      return Object.freeze({ kind: 'unsupported' });
    }

    sourceExpression = properties.get('source') as ts.Expression;
    routerExpression = properties.get('path') as ts.Expression;
    pathMapExpression = properties.get('pathMap');
  } else {
    sourceExpression = call.arguments[0] as ts.Expression;
    routerExpression = call.arguments[1] as ts.Expression;
    pathMapExpression = call.arguments[2];
  }

  const source = await classifyEndpoint(
    session,
    analysis,
    sourceExpression,
    'source',
    onSourceFailure,
  );
  const router = await classifyRunnable(
    session,
    analysis,
    routerExpression,
    'router',
    onSourceFailure,
  );

  if (
    source.kind === 'invalid' ||
    source.kind === 'end' ||
    router.kind === 'invalid' ||
    (pathMapExpression !== undefined &&
      !(await isTargetViablePathMap(session, analysis, pathMapExpression, onSourceFailure)))
  ) {
    return Object.freeze({ kind: 'unsupported' });
  }

  if (source.kind === 'opaque' || router.kind === 'viable') {
    return Object.freeze({ kind: 'supported', patterns: Object.freeze([]) });
  }

  const sourceName = source.kind === 'start' ? '__start__' : source.name;

  return Object.freeze({
    kind: 'supported',
    patterns: Object.freeze([
      createPattern(
        LANGGRAPH_PATTERN_IDS.StateGraphConditionalEdge,
        analysis.path,
        null,
        {
          graphOperation: 'addConditionalEdges',
          ...(isLangGraphEvidenceSafeName(sourceName) ? { sourceName } : {}),
        },
        router.kind === 'supported' ? router.reference : null,
      ),
    ]),
  });
};

const inspectUninterpretedOperation = async (
  session: ILangGraphInspectionSession,
  operation: ILangGraphStateGraphOperation,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphOperationsResult> => {
  const { analysis, call, methodName } = operation;

  if (call.arguments.length !== 1) {
    return Object.freeze({ kind: 'unsupported' });
  }

  const argument = call.arguments[0] as ts.Expression;

  if (methodName === 'setNodeDefaults') {
    return call.typeArguments === undefined &&
      (await isTargetViableObject(session, analysis, argument, onSourceFailure))
      ? Object.freeze({ kind: 'supported', patterns: Object.freeze([]) })
      : Object.freeze({ kind: 'unsupported' });
  }

  if (methodName === 'setEntryPoint' || methodName === 'setFinishPoint') {
    if (call.typeArguments !== undefined) {
      return Object.freeze({ kind: 'unsupported' });
    }

    const endpoint = await classifyEndpoint(session, analysis, argument, 'node', onSourceFailure);
    return endpoint.kind === 'node' || endpoint.kind === 'opaque'
      ? Object.freeze({ kind: 'supported', patterns: Object.freeze([]) })
      : Object.freeze({ kind: 'unsupported' });
  }

  const syntheticOperation = Object.freeze({ ...operation, methodName: 'addNode' });
  return inspectAddNode(session, syntheticOperation, onSourceFailure);
};

/** Validates graph operations and returns only supported positive runtime patterns. */
export const inspectLangGraphOperations = async (
  session: ILangGraphInspectionSession,
  operations: readonly ILangGraphStateGraphOperation[],
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphOperationsResult> => {
  const patterns: ILangGraphRuntimePattern[] = [];

  for (const operation of operations) {
    session.signal?.throwIfAborted();
    let result: ILangGraphOperationsResult;

    if (operation.methodName === 'addNode') {
      result = await inspectAddNode(session, operation, onSourceFailure);
    } else if (operation.methodName === 'addEdge') {
      result = await inspectAddEdge(session, operation, onSourceFailure);
    } else if (operation.methodName === 'addConditionalEdges') {
      result = await inspectConditionalEdge(session, operation, onSourceFailure);
    } else {
      result = await inspectUninterpretedOperation(session, operation, onSourceFailure);
    }

    if (result.kind === 'unsupported') {
      return result;
    }

    patterns.push(...result.patterns);
  }

  return Object.freeze({ kind: 'supported', patterns: Object.freeze(patterns) });
};

/** Extracts one exact direct graph-builder call. */
export const getLangGraphBuilderCall = (
  call: ts.CallExpression,
): { readonly methodName: string; readonly receiver: ts.Expression } | null => {
  if (call.questionDotToken !== undefined) {
    return null;
  }

  const member = getLangGraphMemberName(call.expression);

  return member === null
    ? null
    : Object.freeze({ methodName: member.name, receiver: member.receiver });
};
