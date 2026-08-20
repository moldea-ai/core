import ts from 'typescript';

import {
  analyzeModuleValueMutations,
  isModuleBindingVisible,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import type { IStaticAnalysisMutationAnalysis } from '@moldea.ai/adapter-static-analysis';

import type {
  ILangChainFunctionTool,
  ILangChainFunctionToolResult,
  ILangChainFunctionToolShape,
  ILangChainRelationship,
  ILangChainRequiredRelationship,
  ILangChainSourceAnalysis,
} from '../contracts/index.js';
import { getLangChainPropertyName, hasLangChainPrototypeSetter } from './bindings.js';

const FUNCTION_TOOL_FIELD_NAMES = new Set([
  'name',
  'description',
  'schema',
  'responseFormat',
  'returnDirect',
  'defaultConfig',
  'verboseParsingErrors',
  'verbose',
  'callbacks',
  'tags',
  'metadata',
  'extras',
]);

const getFunctionToolCall = (
  initializer: ts.Expression,
  analysis: ILangChainSourceAnalysis,
): { readonly call: ts.CallExpression; readonly helperSource: string } | null => {
  const candidate = unwrapExpression(initializer);

  if (!ts.isCallExpression(candidate) || candidate.arguments.length !== 2) {
    return null;
  }

  const callee = unwrapExpression(candidate.expression);

  if (!ts.isIdentifier(callee) || !isModuleBindingVisible(callee, analysis)) {
    return null;
  }

  const helperSource = analysis.imports.toolNames.get(callee.text);
  return helperSource === undefined ? null : Object.freeze({ call: candidate, helperSource });
};

const getFunctionToolFields = (
  call: ts.CallExpression,
): {
  readonly description: ILangChainRelationship;
  readonly fields: ts.ObjectLiteralExpression;
  readonly name: ts.Expression;
  readonly schema: ILangChainRelationship;
} | null => {
  const fields = unwrapExpression(call.arguments[1] as ts.Expression);

  if (!ts.isObjectLiteralExpression(fields) || hasLangChainPrototypeSetter(fields)) {
    return null;
  }

  const seen = new Set<string>();
  let description: ILangChainRelationship = { expression: null, kind: 'absent' };
  let name: ts.Expression | null = null;
  let schema: ILangChainRelationship = { expression: null, kind: 'absent' };

  for (const property of fields.properties) {
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return null;
    }

    const propertyName = getLangChainPropertyName(property.name);

    if (
      propertyName === null ||
      !FUNCTION_TOOL_FIELD_NAMES.has(propertyName) ||
      seen.has(propertyName)
    ) {
      return null;
    }

    seen.add(propertyName);

    if (propertyName === 'name') {
      name = unwrapExpression(property.initializer);
    } else if (propertyName === 'description') {
      description = { expression: unwrapExpression(property.initializer), kind: 'present' };
    } else if (propertyName === 'schema') {
      schema = { expression: unwrapExpression(property.initializer), kind: 'present' };
    }
  }

  return name === null ? null : Object.freeze({ description, fields, name, schema });
};

const createFunctionToolShape = (
  functionToolCall: NonNullable<ReturnType<typeof getFunctionToolCall>>,
  functionToolFields: NonNullable<ReturnType<typeof getFunctionToolFields>>,
  mutations?: IStaticAnalysisMutationAnalysis,
): ILangChainFunctionToolShape => {
  const hasUnknownMutation = mutations?.hasUnknownMutation === true;
  const isImplementationUnresolved =
    hasUnknownMutation ||
    mutations?.mutatedMembers.has('func') === true ||
    mutations?.mutatedMembers.has('invoke') === true;
  const isNameUnresolved = hasUnknownMutation || mutations?.mutatedMembers.has('name') === true;
  const implementationKind: ILangChainRequiredRelationship['kind'] = isImplementationUnresolved
    ? 'unresolved'
    : 'present';
  const nameKind: ILangChainRequiredRelationship['kind'] = isNameUnresolved
    ? 'unresolved'
    : 'present';
  const schema =
    hasUnknownMutation || mutations?.mutatedMembers.has('schema') === true
      ? ({ kind: 'unresolved' } as const)
      : functionToolFields.schema;

  return Object.freeze({
    description: functionToolFields.description,
    fields: functionToolFields.fields,
    helperSource: functionToolCall.helperSource,
    implementation: {
      expression: unwrapExpression(functionToolCall.call.arguments[0] as ts.Expression),
      kind: implementationKind,
    },
    name: {
      expression: functionToolFields.name,
      kind: nameKind,
    },
    schema,
  });
};

/** Classifies one directly exported normal two-argument LangChain function tool. */
export const getLangChainFunctionTool = (
  analysis: ILangChainSourceAnalysis,
  symbol: string,
  allowedReferences: ReadonlySet<ts.Identifier> = new Set(),
): ILangChainFunctionToolResult => {
  const exported = analysis.exports.get(symbol);

  if (exported === undefined) {
    return Object.freeze({ kind: 'absent' });
  }

  if (
    exported.kind !== 'present-supported' ||
    !ts.isVariableDeclaration(exported.declaration) ||
    exported.declaration.initializer === undefined
  ) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const functionToolCall = getFunctionToolCall(exported.declaration.initializer, analysis);
  const functionToolFields =
    functionToolCall === null ? null : getFunctionToolFields(functionToolCall.call);

  if (functionToolCall === null || functionToolFields === null) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const mutations = analyzeModuleValueMutations(analysis, exported.declaration, allowedReferences);

  const tool: ILangChainFunctionTool = Object.freeze({
    declaration: exported.declaration,
    ...createFunctionToolShape(functionToolCall, functionToolFields, mutations),
  });

  return Object.freeze({ kind: 'present-supported', tool });
};

/** Classifies one inline normal function-tool declaration. */
export const getInlineLangChainFunctionTool = (
  expression: ts.Expression,
  analysis: ILangChainSourceAnalysis,
): ILangChainFunctionToolShape | null => {
  const functionToolCall = getFunctionToolCall(expression, analysis);
  const functionToolFields =
    functionToolCall === null ? null : getFunctionToolFields(functionToolCall.call);

  return functionToolCall === null || functionToolFields === null
    ? null
    : createFunctionToolShape(functionToolCall, functionToolFields);
};
