import ts from 'typescript';

import {
  classifyDirectCallRelationship,
  classifySchemaRelationship,
  classifyToolRelationships,
  getCallableExportState,
  getClosedObjectProperties,
  getConstExport,
  getStaticString,
  isBoundIdentifier,
  isNullLiteral,
  isStaticLiteralValue,
  unwrapExpression,
  type IStaticAnalysisSource,
} from '@moldea.ai/adapter-static-analysis';
import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference, IToolManifestEntry } from '@moldea.ai/core/format';
import { parseRepositoryPath } from '@moldea.ai/repository';

import { ANTHROPIC_ADAPTER_ID, ANTHROPIC_TOOL_NAME_PATTERN } from '../constants/index.js';
import type {
  IAnthropicInspectionSession,
  IAnthropicMessagesAnalysis,
  IAnthropicSourceAnalysis,
} from '../contracts/index.js';
import {
  addAnthropicDiagnostic,
  analyzeAnthropicBoundReference,
  compareAnthropicStrings,
  createAnthropicEvidence,
} from './common.js';

interface IAnthropicRegistrationInspection {
  readonly capabilityId: string;
  readonly detectedName: string;
  readonly isNameMatch: boolean;
  readonly isNameValid: boolean;
  readonly reference: IRepositoryReference & { readonly symbol: string };
}

interface IAnthropicRegistrationShape {
  readonly detectedName: string;
  readonly inputSchema: ts.Expression;
  readonly properties: ReadonlyMap<string, ts.Expression>;
}

type IAnthropicRegistrationShapeResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'present-unsupported' }
  | ({ readonly kind: 'present-supported' } & IAnthropicRegistrationShape);

const getExpressionRange = (
  analysis: IAnthropicSourceAnalysis,
  expression: ts.Expression | null,
) =>
  expression === null
    ? null
    : analysis.text.locator.locateRange(expression.getStart(), expression.end);

const isSupportedRegistrationInputSchema = (
  expression: ts.Expression,
  analysis: IStaticAnalysisSource,
  inputSchemaReference: IRepositoryReference | undefined,
): boolean => {
  const candidate = unwrapExpression(expression);

  return (
    (ts.isObjectLiteralExpression(candidate) && isStaticLiteralValue(candidate)) ||
    (ts.isIdentifier(candidate) &&
      inputSchemaReference?.symbol !== undefined &&
      isBoundIdentifier(candidate, analysis, inputSchemaReference))
  );
};

const getRegistrationShape = (
  analysis: IStaticAnalysisSource,
  symbol: string,
  inputSchemaReference?: IRepositoryReference,
): IAnthropicRegistrationShapeResult => {
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

  const object = exported.expression;

  if (object.properties.some((property) => !ts.isPropertyAssignment(property))) {
    return { kind: 'present-unsupported' };
  }

  const properties = getClosedObjectProperties(object);

  if (properties === null) {
    return { kind: 'present-unsupported' };
  }

  const allowedProperties = new Set([
    'allowed_callers',
    'cache_control',
    'defer_loading',
    'description',
    'eager_input_streaming',
    'input_examples',
    'input_schema',
    'name',
    'strict',
    'type',
  ]);

  if ([...properties.keys()].some((propertyName) => !allowedProperties.has(propertyName))) {
    return { kind: 'present-unsupported' };
  }

  const type = properties.get('type');
  const name = properties.get('name');
  const inputSchema = properties.get('input_schema');
  const strict = properties.get('strict');
  const description = properties.get('description');
  const detectedName = getStaticString(name);
  const isSupportedDescription = description === undefined || getStaticString(description) !== null;
  const isSupportedStrict =
    strict === undefined ||
    unwrapExpression(strict).kind === ts.SyntaxKind.TrueKeyword ||
    unwrapExpression(strict).kind === ts.SyntaxKind.FalseKeyword;
  const isSupportedType =
    type === undefined || isNullLiteral(type) || getStaticString(type) === 'custom';

  if (
    !isSupportedType ||
    detectedName === null ||
    inputSchema === undefined ||
    !isSupportedRegistrationInputSchema(inputSchema, analysis, inputSchemaReference) ||
    !isSupportedStrict ||
    !isSupportedDescription
  ) {
    return { kind: 'present-unsupported' };
  }

  return {
    detectedName,
    inputSchema,
    kind: 'present-supported',
    properties,
  };
};

const isValidAnthropicToolName = (name: string): boolean => ANTHROPIC_TOOL_NAME_PATTERN.test(name);

const inspectRegistration = async (
  session: IAnthropicInspectionSession,
  agent: IIndexedAgent,
  capabilityId: string,
  tool: IToolManifestEntry,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<IAnthropicRegistrationInspection | null> => {
  const reference = tool.registration;

  if (reference?.symbol === undefined) {
    return null;
  }

  const registrationAnalysis = await analyzeAnthropicBoundReference(
    session,
    reference,
    diagnostics,
    agent.id,
    capabilityId,
  );

  if (registrationAnalysis === null) {
    return null;
  }

  const shape = getRegistrationShape(registrationAnalysis, reference.symbol, tool.inputSchema);

  if (shape.kind === 'absent') {
    addAnthropicDiagnostic(
      diagnostics,
      'ANTHROPIC_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
      reference.path,
      agent.id,
      null,
      capabilityId,
    );
    return null;
  }

  if (shape.kind === 'present-unsupported') {
    if (tool.inputSchema !== undefined) {
      await inspectInputSchema(
        session,
        agent,
        capabilityId,
        tool.inputSchema,
        registrationAnalysis,
        null,
        evidence,
        diagnostics,
      );
    }

    return null;
  }

  const name = shape.properties.get('name');
  const isNameMatch = shape.detectedName === tool.name;
  const isNameValid = isValidAnthropicToolName(shape.detectedName);

  if (!isNameValid) {
    addAnthropicDiagnostic(
      diagnostics,
      'ANTHROPIC_TOOL_NAME_INVALID',
      registrationAnalysis.path,
      agent.id,
      getExpressionRange(registrationAnalysis, name ?? null),
      capabilityId,
    );
  }

  if (!isNameMatch) {
    addAnthropicDiagnostic(
      diagnostics,
      'ANTHROPIC_TOOL_NAME_MISMATCH',
      registrationAnalysis.path,
      agent.id,
      getExpressionRange(registrationAnalysis, name ?? null),
      capabilityId,
    );
  }

  if (tool.inputSchema !== undefined) {
    await inspectInputSchema(
      session,
      agent,
      capabilityId,
      tool.inputSchema,
      registrationAnalysis,
      shape.inputSchema,
      evidence,
      diagnostics,
    );
  }

  return Object.freeze({
    capabilityId,
    detectedName: shape.detectedName,
    isNameMatch,
    isNameValid,
    reference: Object.freeze({ path: reference.path, symbol: reference.symbol }),
  });
};

const inspectInputSchema = async (
  session: IAnthropicInspectionSession,
  agent: IIndexedAgent,
  capabilityId: string,
  reference: IRepositoryReference,
  registrationAnalysis: IAnthropicSourceAnalysis,
  inputSchema: ts.Expression | null,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  if (reference.symbol === undefined) {
    return;
  }

  const schemaAnalysis = await analyzeAnthropicBoundReference(
    session,
    reference,
    diagnostics,
    agent.id,
    capabilityId,
  );

  if (schemaAnalysis === null) {
    return;
  }

  const schema = getConstExport(schemaAnalysis, reference.symbol);

  if (schema.kind === 'absent') {
    addAnthropicDiagnostic(
      diagnostics,
      'ANTHROPIC_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
      reference.path,
      agent.id,
      null,
      capabilityId,
    );
    return;
  }

  if (schema.kind !== 'present-supported') {
    return;
  }

  if (inputSchema === null) {
    return;
  }

  const relationship = classifySchemaRelationship(registrationAnalysis, inputSchema, reference);

  if (relationship.kind === 'present') {
    evidence.push(
      createAnthropicEvidence({
        agentId: agent.id,
        capabilityId,
        capabilityKind: 'tool',
        details: { requestProperty: 'input_schema', schemaRole: 'input' },
        kind: 'schema',
        references: [
          { path: registrationAnalysis.path },
          { path: reference.path, symbol: reference.symbol },
        ],
        runtimeName: reference.symbol,
        source: ANTHROPIC_ADAPTER_ID,
      }),
    );
    return;
  }

  if (relationship.kind === 'absent') {
    addAnthropicDiagnostic(
      diagnostics,
      'ANTHROPIC_TOOL_INPUT_SCHEMA_NOT_WIRED',
      registrationAnalysis.path,
      agent.id,
      getExpressionRange(registrationAnalysis, relationship.expression),
      capabilityId,
    );
  }
};

const inspectInstructionLoader = async (
  session: IAnthropicInspectionSession,
  agent: IIndexedAgent,
  runtimeAnalysis: IAnthropicSourceAnalysis,
  messages: IAnthropicMessagesAnalysis,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const reference = agent.declaration.bindings?.instructionLoader;

  if (reference?.symbol === undefined) {
    return;
  }

  const loaderAnalysis = await analyzeAnthropicBoundReference(
    session,
    reference,
    diagnostics,
    agent.id,
  );

  if (loaderAnalysis === null) {
    return;
  }

  const loader = getCallableExportState(loaderAnalysis, reference.symbol);

  if (loader.kind === 'absent') {
    addAnthropicDiagnostic(
      diagnostics,
      'ANTHROPIC_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
      reference.path,
      agent.id,
    );
    return;
  }

  if (loader.kind === 'present-unsupported') {
    return;
  }

  const relationship = classifyDirectCallRelationship(
    runtimeAnalysis,
    messages.requests.map((request) => request.system),
    messages.hasAmbiguousCandidate,
    reference,
  );

  if (relationship.kind === 'present') {
    evidence.push(
      createAnthropicEvidence({
        agentId: agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: { requestProperty: 'system' },
        kind: 'instruction-loader',
        references: [
          { path: runtimeAnalysis.path },
          { path: reference.path, symbol: reference.symbol },
        ],
        runtimeName: reference.symbol,
        source: ANTHROPIC_ADAPTER_ID,
      }),
    );
  } else if (relationship.kind === 'absent') {
    addAnthropicDiagnostic(
      diagnostics,
      'ANTHROPIC_INSTRUCTION_LOADER_NOT_WIRED',
      runtimeAnalysis.path,
      agent.id,
      getExpressionRange(runtimeAnalysis, relationship.expression),
    );
  }
};

const inspectToolRelationships = async (
  session: IAnthropicInspectionSession,
  agent: IIndexedAgent,
  runtimeAnalysis: IAnthropicSourceAnalysis,
  messages: IAnthropicMessagesAnalysis,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const registrations: IAnthropicRegistrationInspection[] = [];

  for (const capabilityId of Object.keys(agent.declaration.tools ?? {}).sort(
    compareAnthropicStrings,
  )) {
    const tool = agent.declaration.tools?.[capabilityId];

    if (tool === undefined) {
      continue;
    }

    const registration = await inspectRegistration(
      session,
      agent,
      capabilityId,
      tool,
      evidence,
      diagnostics,
    );

    if (registration !== null) {
      registrations.push(registration);
    }
  }

  const relationships = await classifyToolRelationships({
    analysis: runtimeAnalysis,
    analyzeSource: (path) => session.analyzeSource(parseRepositoryPath(path)),
    getEntry: (path) => session.getEntry(parseRepositoryPath(path)),
    hasAmbiguousCandidate: messages.hasAmbiguousCandidate,
    isSupportedAdditionalRegistration: (analysis, symbol) => {
      const shape = getRegistrationShape(analysis, symbol);

      return shape.kind === 'present-supported' && isValidAnthropicToolName(shape.detectedName);
    },
    registrations: registrations.map((registration) => ({
      reference: registration.reference,
      registration,
    })),
    relationships: messages.requests.map((request) => request.tools),
    ...(session.signal === undefined ? {} : { signal: session.signal }),
  });

  for (const { registration, relationship } of relationships) {
    if (relationship.kind === 'absent') {
      addAnthropicDiagnostic(
        diagnostics,
        'ANTHROPIC_TOOL_REGISTRATION_NOT_WIRED',
        runtimeAnalysis.path,
        agent.id,
        getExpressionRange(runtimeAnalysis, relationship.expression),
        registration.capabilityId,
      );
      continue;
    }

    if (relationship.kind === 'present' && registration.isNameMatch && registration.isNameValid) {
      evidence.push(
        createAnthropicEvidence({
          agentId: agent.id,
          capabilityId: registration.capabilityId,
          capabilityKind: 'tool',
          details: { toolType: 'client' },
          kind: 'tool-registration',
          references: [
            { path: runtimeAnalysis.path },
            { path: registration.reference.path, symbol: registration.reference.symbol },
          ],
          runtimeName: registration.detectedName,
          source: ANTHROPIC_ADAPTER_ID,
        }),
      );
    }
  }
};

/**
 * Inspects loader, tool-registration, and input-schema relationships for recognized requests.
 * @param session The operation-local inspection session.
 * @param agent The indexed agent declaration.
 * @param runtimeAnalysis The indexed runtime-agent source.
 * @param messages The relationship-specific Messages request analysis.
 * @param evidence The operation evidence collection.
 * @param diagnostics The operation diagnostic collection.
 */
export const inspectAnthropicRelationships = async (
  session: IAnthropicInspectionSession,
  agent: IIndexedAgent,
  runtimeAnalysis: IAnthropicSourceAnalysis,
  messages: IAnthropicMessagesAnalysis,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  await inspectInstructionLoader(session, agent, runtimeAnalysis, messages, evidence, diagnostics);
  await inspectToolRelationships(session, agent, runtimeAnalysis, messages, evidence, diagnostics);
};
