import ts from 'typescript';

import {
  analyzeModuleValueMutations,
  getClosedObjectProperties,
  getConstExport,
  isModuleBindingVisible,
  isModuleValueBindingSafe,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';

import { LANGGRAPH_PATTERN_IDS } from '../constants/index.js';
import type {
  ILangGraphAgentDefinitionResult,
  ILangGraphInspectionSession,
  ILangGraphRelationship,
  ILangGraphRuntimePattern,
  ILangGraphSourceAnalysis,
  ILangGraphSourceFailure,
} from '../contracts/index.js';
import { isLangGraphEvidenceSafeName, isLangGraphMachineString } from '../inspection/common.js';
import {
  getLangGraphMemberName,
  getLangGraphPropertyName,
  hasLangGraphPrototypeSetter,
  hasLangGraphTypeArgumentCount,
  isLangGraphRuntimeImport,
  resolveLangGraphConstBinding,
} from './bindings.js';
import { resolveLangGraphFunction, visitLangGraphFunctionBody } from './functions.js';
import { resolveLangGraphStaticString } from './static-strings.js';

const ENTRYPOINT_OPTION_KEYS = new Set(['name', 'checkpointer', 'store', 'cache', 'timeout']);
const TASK_OPTION_KEYS = new Set(['name', 'retry', 'cachePolicy', 'timeout']);
const SAFE_ENTRYPOINT_METHODS = new Set([
  'invoke',
  'stream',
  'streamEvents',
  'getState',
  'getStateHistory',
]);

interface ILangGraphTaskDefinition {
  readonly analysis: ILangGraphSourceAnalysis;
  readonly declaration: ts.VariableDeclaration;
  readonly name: string;
  readonly path: ILangGraphSourceAnalysis['path'];
  readonly symbol: string;
}

const isSafeRuntimeName = (name: string): boolean =>
  isLangGraphMachineString(name) && isLangGraphEvidenceSafeName(name);

const createPattern = (
  patternId: ILangGraphRuntimePattern['patternId'],
  entrypointPath: ILangGraphSourceAnalysis['path'],
  runtimeName: string | null,
  details: ILangGraphRuntimePattern['details'],
  task?: ILangGraphTaskDefinition,
): ILangGraphRuntimePattern =>
  Object.freeze({
    details: Object.freeze({ ...details, patternId }),
    patternId,
    references: Object.freeze([
      Object.freeze({ path: entrypointPath }),
      ...(task === undefined || task.path === entrypointPath
        ? []
        : [Object.freeze({ path: task.path, symbol: task.symbol })]),
    ]),
    runtimeName,
  });

const getClosedNamedOptions = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  keys: ReadonlySet<string>,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<{ readonly name: string; readonly relationship: ILangGraphRelationship } | null> => {
  const candidate = unwrapExpression(expression);

  if (!ts.isObjectLiteralExpression(candidate) || hasLangGraphPrototypeSetter(candidate)) {
    return null;
  }

  const seenNames = new Set<string>();
  let nameExpression: ts.Expression | null = null;

  for (const property of candidate.properties) {
    if (
      ts.isSpreadAssignment(property) ||
      ts.isComputedPropertyName(property.name) ||
      (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property))
    ) {
      return null;
    }

    const name = getLangGraphPropertyName(property.name);

    if (name === null || !keys.has(name) || seenNames.has(name)) {
      return null;
    }

    seenNames.add(name);

    if (name === 'name') {
      if (!ts.isPropertyAssignment(property)) {
        return null;
      }

      nameExpression = property.initializer;
    }
  }

  if (nameExpression === null) {
    return null;
  }

  const staticName = await resolveLangGraphStaticString(
    session,
    analysis,
    nameExpression,
    onSourceFailure,
  );

  return staticName.kind === 'supported'
    ? Object.freeze({
        name: staticName.value.value,
        relationship: Object.freeze({ analysis, expression: nameExpression, kind: 'present' }),
      })
    : null;
};

const getNameArgument = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
  keys: ReadonlySet<string>,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<{ readonly name: string; readonly relationship: ILangGraphRelationship } | null> => {
  const staticName = await resolveLangGraphStaticString(
    session,
    analysis,
    expression,
    onSourceFailure,
  );

  if (staticName.kind === 'supported') {
    return Object.freeze({
      name: staticName.value.value,
      relationship: Object.freeze({ analysis, expression, kind: 'present' }),
    });
  }

  return getClosedNamedOptions(session, analysis, expression, keys, onSourceFailure);
};

const hasSafeReturnedValue = (
  analysis: ILangGraphSourceAnalysis,
  declaration: ts.VariableDeclaration,
  allowedReferences: ReadonlySet<ts.Identifier> = new Set(),
): boolean => {
  const mutations = analyzeModuleValueMutations(
    analysis,
    declaration,
    allowedReferences,
    SAFE_ENTRYPOINT_METHODS,
  );

  return !mutations.hasUnknownMutation && mutations.mutatedMembers.size === 0;
};

const getDirectCallReferences = (
  analysis: ILangGraphSourceAnalysis,
  bindingName: string,
): ReadonlySet<ts.Identifier> =>
  new Set(
    (analysis.identifierUses.get(bindingName) ?? []).filter((identifier) => {
      const parent = identifier.parent;
      return ts.isCallExpression(parent) && parent.expression === identifier;
    }),
  );

const getTaskDefinition = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  identifier: ts.Identifier,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphTaskDefinition | null> => {
  const binding = await resolveLangGraphConstBinding(
    session,
    analysis,
    identifier,
    onSourceFailure,
  );

  if (
    binding === null ||
    !ts.isVariableDeclaration(binding.declaration) ||
    !ts.isIdentifier(binding.declaration.name) ||
    !isModuleValueBindingSafe(
      analysis,
      identifier.text,
      binding.analysis === analysis ? binding.declaration.name : null,
      getDirectCallReferences(analysis, identifier.text),
      'object',
    ) ||
    !hasSafeReturnedValue(
      binding.analysis,
      binding.declaration,
      getDirectCallReferences(binding.analysis, binding.symbol),
    )
  ) {
    return null;
  }

  const call = unwrapExpression(binding.expression);

  if (
    !ts.isCallExpression(call) ||
    call.questionDotToken !== undefined ||
    call.arguments.length !== 2 ||
    !hasLangGraphTypeArgumentCount(call, 2)
  ) {
    return null;
  }

  const callee = unwrapExpression(call.expression);

  if (
    !ts.isIdentifier(callee) ||
    !isLangGraphRuntimeImport(callee, binding.analysis.imports.taskNames, binding.analysis)
  ) {
    return null;
  }

  const name = await getNameArgument(
    session,
    binding.analysis,
    call.arguments[0] as ts.Expression,
    TASK_OPTION_KEYS,
    onSourceFailure,
  );
  const taskFunction = await resolveLangGraphFunction(
    session,
    binding.analysis,
    call.arguments[1] as ts.Expression,
    'runnable',
    onSourceFailure,
  );

  if (name === null || taskFunction === null) {
    return null;
  }

  return Object.freeze({
    analysis: binding.analysis,
    declaration: binding.declaration,
    name: name.name,
    path: binding.path,
    symbol: binding.symbol,
  });
};

const inspectFunctionalPatterns = async (
  session: ILangGraphInspectionSession,
  entrypointAnalysis: ILangGraphSourceAnalysis,
  functionAnalysis: ILangGraphSourceAnalysis,
  functionExpression: Parameters<typeof visitLangGraphFunctionBody>[0],
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<readonly ILangGraphRuntimePattern[]> => {
  const callExpressions: ts.CallExpression[] = [];

  visitLangGraphFunctionBody(functionExpression, (node) => {
    if (ts.isCallExpression(node)) {
      callExpressions.push(node);
    }
  });

  const patterns: ILangGraphRuntimePattern[] = [];

  for (const call of callExpressions) {
    session.signal?.throwIfAborted();

    if (call.questionDotToken !== undefined) {
      continue;
    }

    const callee = unwrapExpression(call.expression);

    if (ts.isIdentifier(callee) && isModuleBindingVisible(callee, functionAnalysis)) {
      if (
        isLangGraphRuntimeImport(
          callee,
          functionAnalysis.imports.interruptNames,
          functionAnalysis,
        ) &&
        call.arguments.length === 1 &&
        hasLangGraphTypeArgumentCount(call, 1, 2)
      ) {
        patterns.push(
          createPattern(LANGGRAPH_PATTERN_IDS.FunctionalInterrupt, entrypointAnalysis.path, null, {
            apiKind: 'functional',
          }),
        );
        continue;
      }

      if (
        isLangGraphRuntimeImport(
          callee,
          functionAnalysis.imports.getPreviousStateNames,
          functionAnalysis,
        ) &&
        call.arguments.length === 0 &&
        hasLangGraphTypeArgumentCount(call, 1)
      ) {
        patterns.push(
          createPattern(
            LANGGRAPH_PATTERN_IDS.FunctionalPreviousState,
            entrypointAnalysis.path,
            null,
            { apiKind: 'functional' },
          ),
        );
        continue;
      }

      if (call.typeArguments === undefined) {
        const task = await getTaskDefinition(session, functionAnalysis, callee, onSourceFailure);

        if (task !== null) {
          const runtimeName = isSafeRuntimeName(task.name) ? task.name : null;
          patterns.push(
            createPattern(
              LANGGRAPH_PATTERN_IDS.FunctionalTask,
              entrypointAnalysis.path,
              runtimeName,
              {
                apiKind: 'functional',
                taskForm: task.path === functionAnalysis.path ? 'module-local' : 'relative-import',
                ...(isLangGraphEvidenceSafeName(task.name) ? { taskName: task.name } : {}),
              },
              task,
            ),
          );
        }
      }

      continue;
    }

    const member = getLangGraphMemberName(call.expression);
    const receiver = member === null ? null : unwrapExpression(member.receiver);

    if (
      member?.name !== 'final' ||
      receiver === null ||
      !ts.isIdentifier(receiver) ||
      !isLangGraphRuntimeImport(
        receiver,
        functionAnalysis.imports.entrypointNames,
        functionAnalysis,
      ) ||
      call.arguments.length !== 1 ||
      !hasLangGraphTypeArgumentCount(call, 2)
    ) {
      continue;
    }

    const options = unwrapExpression(call.arguments[0] as ts.Expression);

    if (!ts.isObjectLiteralExpression(options) || hasLangGraphPrototypeSetter(options)) {
      continue;
    }

    const properties = getClosedObjectProperties(options);

    if (
      properties !== null &&
      [...properties.keys()].every((name) => name === 'value' || name === 'save')
    ) {
      patterns.push(
        createPattern(LANGGRAPH_PATTERN_IDS.FunctionalFinalState, entrypointAnalysis.path, null, {
          apiKind: 'functional',
        }),
      );
    }
  }

  return Object.freeze(patterns);
};

/** Classifies one directly exported Functional API entrypoint definition. */
export const getLangGraphFunctionalDefinition = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  symbol: string,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphAgentDefinitionResult> => {
  const exported = getConstExport(analysis, symbol);

  if (exported.kind === 'absent') {
    return Object.freeze({ kind: 'absent' });
  }

  if (
    exported.kind !== 'present-supported' ||
    exported.expression === undefined ||
    !ts.isVariableDeclaration(exported.declaration) ||
    !hasSafeReturnedValue(analysis, exported.declaration)
  ) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const call = unwrapExpression(exported.expression);

  if (
    !ts.isCallExpression(call) ||
    call.questionDotToken !== undefined ||
    call.arguments.length !== 2 ||
    !hasLangGraphTypeArgumentCount(call, 2)
  ) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const callee = unwrapExpression(call.expression);

  if (
    !ts.isIdentifier(callee) ||
    !isLangGraphRuntimeImport(callee, analysis.imports.entrypointNames, analysis)
  ) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const name = await getNameArgument(
    session,
    analysis,
    call.arguments[0] as ts.Expression,
    ENTRYPOINT_OPTION_KEYS,
    onSourceFailure,
  );
  const workflowFunction = await resolveLangGraphFunction(
    session,
    analysis,
    call.arguments[1] as ts.Expression,
    'workflow',
    onSourceFailure,
  );

  if (name === null || workflowFunction === null) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const patterns = await inspectFunctionalPatterns(
    session,
    analysis,
    workflowFunction.analysis,
    workflowFunction.expression,
    onSourceFailure,
  );

  return Object.freeze({
    definition: Object.freeze({
      analysis,
      declaration: exported.declaration,
      entrypointCall: call,
      functionAnalysis: workflowFunction.analysis,
      functionExpression: workflowFunction.expression,
      name: name.relationship,
      patterns,
    }),
    kind: 'present-supported',
    targetId: 'typescript-functional-api-1-4',
  });
};
