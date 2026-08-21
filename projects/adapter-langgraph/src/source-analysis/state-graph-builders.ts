import ts from 'typescript';

import {
  analyzeModuleValueMutations,
  getConstExport,
  isModuleBindingVisible,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';

import type {
  ILangGraphAgentDefinitionResult,
  ILangGraphInspectionSession,
  ILangGraphRelationship,
  ILangGraphSourceAnalysis,
  ILangGraphSourceFailure,
  ILangGraphStateGraphOperation,
} from '../contracts/index.js';
import { getLangGraphBuilderCall, inspectLangGraphOperations } from './graph-operations.js';
import {
  getLangGraphMemberName,
  getLangGraphPropertyName,
  hasLangGraphPrototypeSetter,
  hasLangGraphTypeArgumentCount,
  isLangGraphExplicitOmission,
  isLangGraphOpaqueObjectValue,
  isLangGraphObjectFamilyValue,
  isLangGraphRuntimeImport,
} from './bindings.js';
import { inspectLangGraphConstructor } from './state-graph-schemas.js';

const COMPILE_OPTION_KEYS = new Set([
  'name',
  'description',
  'checkpointer',
  'store',
  'cache',
  'interruptBefore',
  'interruptAfter',
  'transformers',
]);
const GRAPH_OPERATION_NAMES = new Set([
  'addNode',
  'addEdge',
  'addConditionalEdges',
  'addSequence',
  'setNodeDefaults',
  'setEntryPoint',
  'setFinishPoint',
]);
const SAFE_COMPILED_GRAPH_METHODS = new Set([
  'invoke',
  'stream',
  'streamEvents',
  'getState',
  'getStateHistory',
  'getGraph',
  'getSubgraphs',
]);

interface ILangGraphBuilderCandidate {
  readonly builderForm: 'inline-fluent' | 'module-local';
  readonly constructor: ts.NewExpression;
  readonly operations: readonly ILangGraphStateGraphOperation[];
}

interface ILangGraphBuilderOperationChain {
  readonly operations: readonly ILangGraphStateGraphOperation[];
  readonly root: ts.Expression;
}

const ABSENT_RELATIONSHIP = Object.freeze({ expression: null, kind: 'absent' } as const);
const UNRESOLVED_RELATIONSHIP = Object.freeze({ kind: 'unresolved' } as const);

const getCompileName = async (
  session: ILangGraphInspectionSession,
  analysis: ILangGraphSourceAnalysis,
  call: ts.CallExpression,
  onSourceFailure?: (failure: ILangGraphSourceFailure) => void,
): Promise<ILangGraphRelationship | null> => {
  if (call.arguments.length === 0) {
    return ABSENT_RELATIONSHIP;
  }

  const argument = call.arguments[0] as ts.Expression;

  if (await isLangGraphExplicitOmission(session, analysis, argument)) {
    return ABSENT_RELATIONSHIP;
  }

  const candidate = unwrapExpression(argument);

  if (!ts.isObjectLiteralExpression(candidate)) {
    return (await isLangGraphObjectFamilyValue(session, analysis, candidate, onSourceFailure)) ||
      (await isLangGraphOpaqueObjectValue(session, analysis, candidate, onSourceFailure))
      ? UNRESOLVED_RELATIONSHIP
      : null;
  }

  if (hasLangGraphPrototypeSetter(candidate)) {
    return UNRESOLVED_RELATIONSHIP;
  }

  const seenNames = new Set<string>();
  let relationship: ILangGraphRelationship = ABSENT_RELATIONSHIP;
  let hasUnknownShape = false;

  for (const property of candidate.properties) {
    if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name)) {
      hasUnknownShape = true;
      continue;
    }

    const name = getLangGraphPropertyName(property.name);

    if (name === null || seenNames.has(name)) {
      hasUnknownShape = true;
      continue;
    }

    seenNames.add(name);

    if (!COMPILE_OPTION_KEYS.has(name)) {
      hasUnknownShape = true;
      continue;
    }

    if (name !== 'name') {
      continue;
    }

    relationship = ts.isPropertyAssignment(property)
      ? Object.freeze({ analysis, expression: property.initializer, kind: 'present' })
      : UNRESOLVED_RELATIONSHIP;
  }

  return hasUnknownShape ? UNRESOLVED_RELATIONSHIP : relationship;
};

const isStateGraphConstructor = (
  expression: ts.Expression,
  analysis: ILangGraphSourceAnalysis,
): expression is ts.NewExpression => {
  const candidate = unwrapExpression(expression);

  if (!ts.isNewExpression(candidate)) {
    return false;
  }

  const constructor = unwrapExpression(candidate.expression);

  return (
    ts.isIdentifier(constructor) &&
    isLangGraphRuntimeImport(constructor, analysis.imports.stateGraphNames, analysis) &&
    hasLangGraphTypeArgumentCount(candidate, 1, 10)
  );
};

const getBuilderOperationChain = (
  analysis: ILangGraphSourceAnalysis,
  expression: ts.Expression,
): ILangGraphBuilderOperationChain | null => {
  const operations: ILangGraphStateGraphOperation[] = [];
  let current = unwrapExpression(expression);

  while (ts.isCallExpression(current)) {
    const member = getLangGraphBuilderCall(current);

    if (member === null) {
      return null;
    }

    operations.push(Object.freeze({ analysis, call: current, methodName: member.methodName }));
    current = unwrapExpression(member.receiver);
  }

  return Object.freeze({ operations: Object.freeze(operations.reverse()), root: current });
};

const hasSupportedBuilderOperations = (chain: ILangGraphBuilderOperationChain): boolean =>
  chain.operations.every(({ methodName }) => GRAPH_OPERATION_NAMES.has(methodName));

const getInlineBuilder = (
  analysis: ILangGraphSourceAnalysis,
  compileReceiver: ts.Expression,
): ILangGraphBuilderCandidate | null => {
  const chain = getBuilderOperationChain(analysis, compileReceiver);

  if (
    chain === null ||
    !hasSupportedBuilderOperations(chain) ||
    !isStateGraphConstructor(chain.root, analysis)
  ) {
    return null;
  }

  return Object.freeze({
    builderForm: 'inline-fluent',
    constructor: chain.root,
    operations: chain.operations,
  });
};

const isIgnoredBuilderIdentifier = (
  identifier: ts.Identifier,
  declarationName: ts.Identifier,
): boolean =>
  identifier === declarationName ||
  (ts.isPropertyAccessExpression(identifier.parent) && identifier.parent.name === identifier) ||
  (ts.isPropertyAssignment(identifier.parent) && identifier.parent.name === identifier);

const getModuleLocalBuilder = (
  analysis: ILangGraphSourceAnalysis,
  compileReceiver: ts.Expression,
  compileCall: ts.CallExpression,
): ILangGraphBuilderCandidate | null => {
  const compileChain = getBuilderOperationChain(analysis, compileReceiver);
  const candidate = compileChain?.root;

  if (
    compileChain === null ||
    candidate === undefined ||
    !ts.isIdentifier(candidate) ||
    !isModuleBindingVisible(candidate, analysis) ||
    !hasSupportedBuilderOperations(compileChain)
  ) {
    return null;
  }

  const declaration = analysis.moduleConstDeclarations.get(candidate.text);
  const initializerChain =
    declaration?.initializer === undefined
      ? null
      : getBuilderOperationChain(analysis, declaration.initializer);

  if (
    declaration === undefined ||
    !ts.isIdentifier(declaration.name) ||
    initializerChain === null ||
    !hasSupportedBuilderOperations(initializerChain) ||
    !isStateGraphConstructor(initializerChain.root, analysis) ||
    declaration.getStart() >= compileCall.getStart()
  ) {
    return null;
  }

  const operations: ILangGraphStateGraphOperation[] = [
    ...initializerChain.operations,
    ...compileChain.operations,
  ];
  const allowedUses = new Set<ts.Identifier>([candidate]);

  for (const statement of analysis.sourceFile.statements) {
    if (!ts.isExpressionStatement(statement)) {
      continue;
    }

    const expression = unwrapExpression(statement.expression);

    if (!ts.isCallExpression(expression)) {
      continue;
    }

    const chain = getBuilderOperationChain(analysis, expression);

    if (chain === null) {
      continue;
    }

    const root = chain.root;

    if (
      !ts.isIdentifier(root) ||
      root.text !== candidate.text ||
      !isModuleBindingVisible(root, analysis)
    ) {
      continue;
    }

    if (
      !hasSupportedBuilderOperations(chain) ||
      expression.getStart() < declaration.getStart() ||
      expression.getStart() > compileCall.getStart()
    ) {
      return null;
    }

    allowedUses.add(root);
    operations.push(...chain.operations);
  }

  for (const identifier of analysis.identifierUses.get(candidate.text) ?? []) {
    if (
      isIgnoredBuilderIdentifier(identifier, declaration.name) ||
      !isModuleBindingVisible(identifier, analysis) ||
      allowedUses.has(identifier)
    ) {
      continue;
    }

    return null;
  }

  operations.sort((left, right) => left.call.getStart() - right.call.getStart());

  return Object.freeze({
    builderForm: 'module-local',
    constructor: initializerChain.root,
    operations: Object.freeze(operations),
  });
};

const hasSafeCompiledGraphValue = (
  analysis: ILangGraphSourceAnalysis,
  declaration: ts.VariableDeclaration,
): boolean => {
  const mutations = analyzeModuleValueMutations(
    analysis,
    declaration,
    new Set(),
    SAFE_COMPILED_GRAPH_METHODS,
  );

  return !mutations.hasUnknownMutation && mutations.mutatedMembers.size === 0;
};

/** Classifies one directly exported compiled StateGraph definition. */
export const getLangGraphStateGraphDefinition = async (
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
    !hasSafeCompiledGraphValue(analysis, exported.declaration)
  ) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const compileCall = unwrapExpression(exported.expression);

  if (
    !ts.isCallExpression(compileCall) ||
    compileCall.questionDotToken !== undefined ||
    compileCall.arguments.length > 1 ||
    !hasLangGraphTypeArgumentCount(compileCall, 1)
  ) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const compileMember = getLangGraphMemberName(compileCall.expression);

  if (compileMember?.name !== 'compile') {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const builder =
    getInlineBuilder(analysis, compileMember.receiver) ??
    getModuleLocalBuilder(analysis, compileMember.receiver, compileCall);

  if (builder === null) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const constructor = await inspectLangGraphConstructor(
    session,
    analysis,
    builder.constructor,
    onSourceFailure,
  );
  const operations = await inspectLangGraphOperations(session, builder.operations, onSourceFailure);
  const name = await getCompileName(session, analysis, compileCall, onSourceFailure);

  if (constructor.kind === 'unsupported' || operations.kind === 'unsupported' || name === null) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  return Object.freeze({
    definition: Object.freeze({
      analysis,
      builderForm: builder.builderForm,
      compileCall,
      declaration: exported.declaration,
      inputSchema: constructor.inputSchema,
      name,
      operations: builder.operations,
      outputSchema: constructor.outputSchema,
      patterns: operations.patterns,
    }),
    kind: 'present-supported',
    targetId: 'typescript-state-graph-1-4',
  });
};
