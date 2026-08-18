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
  isStrictLiteral,
  unwrapExpression,
  type IStaticAnalysisSource,
} from '@moldea.ai/adapter-static-analysis';
import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference, IToolManifestEntry } from '@moldea.ai/core/format';
import { parseRepositoryPath } from '@moldea.ai/repository';

import { OPENAI_ADAPTER_ID } from '../constants/index.js';
import type {
  IOpenAiInspectionSession,
  IOpenAiResponsesAnalysis,
  IOpenAiSourceAnalysis,
} from '../contracts/index.js';
import {
  addOpenAiDiagnostic,
  analyzeOpenAiBoundReference,
  compareOpenAiStrings,
  createOpenAiEvidence,
} from './common.js';

interface IOpenAiRegistrationInspection {
  readonly capabilityId: string;
  readonly detectedName: string;
  readonly isNameMatch: boolean;
  readonly reference: IRepositoryReference & { readonly symbol: string };
}

interface IOpenAiRegistrationShape {
  readonly detectedName: string;
  readonly parameters: ts.Expression;
  readonly properties: ReadonlyMap<string, ts.Expression>;
}

type IOpenAiRegistrationShapeResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'present-unsupported' }
  | ({ readonly kind: 'present-supported' } & IOpenAiRegistrationShape);

const getExpressionRange = (analysis: IOpenAiSourceAnalysis, expression: ts.Expression | null) =>
  expression === null
    ? null
    : analysis.text.locator.locateRange(expression.getStart(), expression.end);

const isSupportedRegistrationParameters = (
  expression: ts.Expression,
  analysis: IStaticAnalysisSource,
  inputSchemaReference: IRepositoryReference | undefined,
): boolean => {
  const candidate = unwrapExpression(expression);

  return (
    isNullLiteral(candidate) ||
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
): IOpenAiRegistrationShapeResult => {
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
    'defer_loading',
    'description',
    'name',
    'output_schema',
    'parameters',
    'strict',
    'type',
  ]);

  if ([...properties.keys()].some((propertyName) => !allowedProperties.has(propertyName))) {
    return { kind: 'present-unsupported' };
  }

  const type = properties.get('type');
  const name = properties.get('name');
  const parameters = properties.get('parameters');
  const strict = properties.get('strict');
  const description = properties.get('description');
  const detectedName = getStaticString(name);
  const isSupportedDescription =
    description === undefined ||
    isNullLiteral(description) ||
    getStaticString(description) !== null;

  if (
    getStaticString(type) !== 'function' ||
    detectedName === null ||
    parameters === undefined ||
    !isSupportedRegistrationParameters(parameters, analysis, inputSchemaReference) ||
    strict === undefined ||
    !isStrictLiteral(strict) ||
    !isSupportedDescription
  ) {
    return { kind: 'present-unsupported' };
  }

  return {
    detectedName,
    kind: 'present-supported',
    parameters,
    properties,
  };
};

const inspectRegistration = async (
  session: IOpenAiInspectionSession,
  agent: IIndexedAgent,
  capabilityId: string,
  tool: IToolManifestEntry,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<IOpenAiRegistrationInspection | null> => {
  const reference = tool.registration;

  if (reference?.symbol === undefined) {
    return null;
  }

  const registrationAnalysis = await analyzeOpenAiBoundReference(
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
    addOpenAiDiagnostic(
      diagnostics,
      'OPENAI_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
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

  if (!isNameMatch) {
    addOpenAiDiagnostic(
      diagnostics,
      'OPENAI_TOOL_NAME_MISMATCH',
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
      shape.parameters,
      evidence,
      diagnostics,
    );
  }

  return Object.freeze({
    capabilityId,
    detectedName: shape.detectedName,
    isNameMatch,
    reference: Object.freeze({ path: reference.path, symbol: reference.symbol }),
  });
};

const inspectInputSchema = async (
  session: IOpenAiInspectionSession,
  agent: IIndexedAgent,
  capabilityId: string,
  reference: IRepositoryReference,
  registrationAnalysis: IOpenAiSourceAnalysis,
  parameters: ts.Expression | null,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  if (reference.symbol === undefined) {
    return;
  }

  const schemaAnalysis = await analyzeOpenAiBoundReference(
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
    addOpenAiDiagnostic(
      diagnostics,
      'OPENAI_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
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

  if (parameters === null) {
    return;
  }

  const relationship = classifySchemaRelationship(registrationAnalysis, parameters, reference);

  if (relationship.kind === 'present') {
    evidence.push(
      createOpenAiEvidence({
        agentId: agent.id,
        capabilityId,
        capabilityKind: 'tool',
        details: { requestProperty: 'parameters', schemaRole: 'input' },
        kind: 'schema',
        references: [
          { path: registrationAnalysis.path },
          { path: reference.path, symbol: reference.symbol },
        ],
        runtimeName: reference.symbol,
        source: OPENAI_ADAPTER_ID,
      }),
    );
    return;
  }

  if (relationship.kind === 'absent') {
    addOpenAiDiagnostic(
      diagnostics,
      'OPENAI_TOOL_INPUT_SCHEMA_NOT_WIRED',
      registrationAnalysis.path,
      agent.id,
      getExpressionRange(registrationAnalysis, relationship.expression),
      capabilityId,
    );
  }
};

const inspectInstructionLoader = async (
  session: IOpenAiInspectionSession,
  agent: IIndexedAgent,
  runtimeAnalysis: IOpenAiSourceAnalysis,
  responses: IOpenAiResponsesAnalysis,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const reference = agent.declaration.bindings?.instructionLoader;

  if (reference?.symbol === undefined) {
    return;
  }

  const loaderAnalysis = await analyzeOpenAiBoundReference(
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
    addOpenAiDiagnostic(
      diagnostics,
      'OPENAI_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
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
    responses.requests.map((request) => request.instructions),
    responses.hasAmbiguousCandidate,
    reference,
  );

  if (relationship.kind === 'present') {
    evidence.push(
      createOpenAiEvidence({
        agentId: agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: { requestProperty: 'instructions' },
        kind: 'instruction-loader',
        references: [
          { path: runtimeAnalysis.path },
          { path: reference.path, symbol: reference.symbol },
        ],
        runtimeName: reference.symbol,
        source: OPENAI_ADAPTER_ID,
      }),
    );
  } else if (relationship.kind === 'absent') {
    addOpenAiDiagnostic(
      diagnostics,
      'OPENAI_INSTRUCTION_LOADER_NOT_WIRED',
      runtimeAnalysis.path,
      agent.id,
      getExpressionRange(runtimeAnalysis, relationship.expression),
    );
  }
};

const inspectToolRelationships = async (
  session: IOpenAiInspectionSession,
  agent: IIndexedAgent,
  runtimeAnalysis: IOpenAiSourceAnalysis,
  responses: IOpenAiResponsesAnalysis,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const registrations: IOpenAiRegistrationInspection[] = [];

  for (const capabilityId of Object.keys(agent.declaration.tools ?? {}).sort(
    compareOpenAiStrings,
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
    hasAmbiguousCandidate: responses.hasAmbiguousCandidate,
    isSupportedAdditionalRegistration: (analysis, symbol) =>
      getRegistrationShape(analysis, symbol).kind === 'present-supported',
    registrations: registrations.map((registration) => ({
      reference: registration.reference,
      registration,
    })),
    relationships: responses.requests.map((request) => request.tools),
    ...(session.signal === undefined ? {} : { signal: session.signal }),
  });

  for (const { registration, relationship } of relationships) {
    if (relationship.kind === 'absent') {
      addOpenAiDiagnostic(
        diagnostics,
        'OPENAI_TOOL_REGISTRATION_NOT_WIRED',
        runtimeAnalysis.path,
        agent.id,
        getExpressionRange(runtimeAnalysis, relationship.expression),
        registration.capabilityId,
      );
      continue;
    }

    if (relationship.kind === 'present' && registration.isNameMatch) {
      evidence.push(
        createOpenAiEvidence({
          agentId: agent.id,
          capabilityId: registration.capabilityId,
          capabilityKind: 'tool',
          details: { toolType: 'function' },
          kind: 'tool-registration',
          references: [
            { path: runtimeAnalysis.path },
            { path: registration.reference.path, symbol: registration.reference.symbol },
          ],
          runtimeName: registration.detectedName,
          source: OPENAI_ADAPTER_ID,
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
 * @param responses The relationship-specific Responses request analysis.
 * @param evidence The operation evidence collection.
 * @param diagnostics The operation diagnostic collection.
 */
export const inspectOpenAiRelationships = async (
  session: IOpenAiInspectionSession,
  agent: IIndexedAgent,
  runtimeAnalysis: IOpenAiSourceAnalysis,
  responses: IOpenAiResponsesAnalysis,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  await inspectInstructionLoader(session, agent, runtimeAnalysis, responses, evidence, diagnostics);
  await inspectToolRelationships(session, agent, runtimeAnalysis, responses, evidence, diagnostics);
};
