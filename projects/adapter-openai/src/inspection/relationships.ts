import ts from 'typescript';

import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference, IToolManifestEntry } from '@moldea.ai/core/format';
import { parseRepositoryPath } from '@moldea.ai/repository';

import { OPENAI_ADAPTER_ID } from '../constants/index.js';
import type {
  IOpenAiClosedRequest,
  IOpenAiInspectionSession,
  IOpenAiResponsesAnalysis,
  IOpenAiSourceAnalysis,
} from '../contracts/index.js';
import {
  getOpenAiCallableExportState,
  getOpenAiClosedArrayIdentifiers,
  getOpenAiClosedObjectProperties,
  getOpenAiConstExport,
  getOpenAiDirectCall,
  getOpenAiStaticString,
  isOpenAiBoundIdentifier,
  isOpenAiModuleBindingVisible,
  isOpenAiNullLiteral,
  isOpenAiStaticLiteralValue,
  isOpenAiStrictLiteral,
  isSafeOpenAiModuleArray,
  resolveOpenAiImportCandidatePaths,
  unwrapOpenAiExpression,
} from '../source-analysis/index.js';
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

type IOpenAiRelationshipResult =
  | { readonly expression: ts.Expression | null; readonly kind: 'absent' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'present' };

const getExpressionRange = (analysis: IOpenAiSourceAnalysis, expression: ts.Expression | null) =>
  expression === null
    ? null
    : analysis.text.locator.locateRange(expression.getStart(), expression.end);

const isResolvableModuleIdentifier = (
  identifier: ts.Identifier,
  analysis: IOpenAiSourceAnalysis,
): boolean =>
  isOpenAiModuleBindingVisible(identifier, analysis) &&
  (analysis.moduleConstDeclarations.has(identifier.text) ||
    analysis.namedImports.has(identifier.text));

const isSupportedRegistrationParameters = (
  expression: ts.Expression,
  analysis: IOpenAiSourceAnalysis,
): boolean => {
  const candidate = unwrapOpenAiExpression(expression);

  return (
    isOpenAiNullLiteral(candidate) ||
    (ts.isObjectLiteralExpression(candidate) && isOpenAiStaticLiteralValue(candidate)) ||
    (ts.isIdentifier(candidate) && isResolvableModuleIdentifier(candidate, analysis))
  );
};

const getRegistrationShape = (
  analysis: IOpenAiSourceAnalysis,
  symbol: string,
): IOpenAiRegistrationShapeResult => {
  const exported = getOpenAiConstExport(analysis, symbol);

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
  const properties = getOpenAiClosedObjectProperties(object);

  if (properties === null) {
    return { kind: 'present-unsupported' };
  }

  const allowedProperties = new Set(['description', 'name', 'parameters', 'strict', 'type']);

  if ([...properties.keys()].some((propertyName) => !allowedProperties.has(propertyName))) {
    return { kind: 'present-unsupported' };
  }

  const type = properties.get('type');
  const name = properties.get('name');
  const parameters = properties.get('parameters');
  const strict = properties.get('strict');
  const description = properties.get('description');
  const detectedName = getOpenAiStaticString(name);
  const isSupportedDescription =
    description === undefined ||
    isOpenAiNullLiteral(description) ||
    getOpenAiStaticString(description) !== null;

  if (
    getOpenAiStaticString(type) !== 'function' ||
    detectedName === null ||
    parameters === undefined ||
    !isSupportedRegistrationParameters(parameters, analysis) ||
    strict === undefined ||
    !isOpenAiStrictLiteral(strict) ||
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

  const shape = getRegistrationShape(registrationAnalysis, reference.symbol);

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
  parameters: ts.Expression,
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

  const schema = getOpenAiConstExport(schemaAnalysis, reference.symbol);

  if (schema.kind !== 'present-supported') {
    return;
  }

  const candidate = unwrapOpenAiExpression(parameters);

  if (
    ts.isIdentifier(candidate) &&
    isOpenAiBoundIdentifier(candidate, registrationAnalysis, reference)
  ) {
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

  const isProvablyDifferent =
    isOpenAiNullLiteral(candidate) ||
    (ts.isObjectLiteralExpression(candidate) && isOpenAiStaticLiteralValue(candidate)) ||
    (ts.isIdentifier(candidate) && isResolvableModuleIdentifier(candidate, registrationAnalysis));

  if (isProvablyDifferent) {
    addOpenAiDiagnostic(
      diagnostics,
      'OPENAI_TOOL_INPUT_SCHEMA_NOT_WIRED',
      registrationAnalysis.path,
      agent.id,
      getExpressionRange(registrationAnalysis, candidate),
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

  const loader = getOpenAiCallableExportState(loaderAnalysis, reference.symbol);

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

  let absentExpression: ts.Expression | null = null;
  let hasAmbiguousRelationship = responses.hasAmbiguousCandidate;

  for (const request of responses.closedRequests) {
    const instructions = request.properties.get('instructions');

    if (instructions === undefined) {
      continue;
    }

    const call = getOpenAiDirectCall(instructions);

    if (call !== null) {
      const callee = unwrapOpenAiExpression(call.expression);

      if (ts.isIdentifier(callee) && isOpenAiBoundIdentifier(callee, runtimeAnalysis, reference)) {
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
        return;
      }

      if (ts.isIdentifier(callee)) {
        absentExpression ??= instructions;
        continue;
      }
    }

    if (isOpenAiStaticLiteralValue(instructions)) {
      absentExpression ??= instructions;
    } else {
      hasAmbiguousRelationship = true;
    }
  }

  if (!hasAmbiguousRelationship) {
    addOpenAiDiagnostic(
      diagnostics,
      'OPENAI_INSTRUCTION_LOADER_NOT_WIRED',
      runtimeAnalysis.path,
      agent.id,
      getExpressionRange(runtimeAnalysis, absentExpression),
    );
  }
};

const resolveClosedToolIdentifiers = (
  request: IOpenAiClosedRequest,
  runtimeAnalysis: IOpenAiSourceAnalysis,
): readonly ts.Identifier[] | null | undefined => {
  const tools = request.properties.get('tools');

  if (tools === undefined) {
    return [];
  }

  const candidate = unwrapOpenAiExpression(tools);

  if (ts.isArrayLiteralExpression(candidate)) {
    return getOpenAiClosedArrayIdentifiers(candidate);
  }

  if (ts.isIdentifier(candidate) && isOpenAiModuleBindingVisible(candidate, runtimeAnalysis)) {
    const moduleArray = runtimeAnalysis.moduleArrays.get(candidate.text);

    if (moduleArray === undefined || !isSafeOpenAiModuleArray(runtimeAnalysis, candidate.text)) {
      return null;
    }

    return getOpenAiClosedArrayIdentifiers(moduleArray.expression);
  }

  return isOpenAiStaticLiteralValue(candidate) ? [] : undefined;
};

const findMatchingRegistrations = (
  identifier: ts.Identifier,
  runtimeAnalysis: IOpenAiSourceAnalysis,
  registrations: readonly IOpenAiRegistrationInspection[],
): readonly IOpenAiRegistrationInspection[] =>
  registrations.filter((registration) =>
    isOpenAiBoundIdentifier(identifier, runtimeAnalysis, registration.reference),
  );

const resolveAdditionalRegistration = async (
  session: IOpenAiInspectionSession,
  identifier: ts.Identifier,
  runtimeAnalysis: IOpenAiSourceAnalysis,
): Promise<boolean> => {
  if (!isOpenAiModuleBindingVisible(identifier, runtimeAnalysis)) {
    return false;
  }

  let reference: IRepositoryReference & { readonly symbol: string };

  if (runtimeAnalysis.exports.has(identifier.text)) {
    reference = { path: runtimeAnalysis.path, symbol: identifier.text };
  } else {
    const namedImport = runtimeAnalysis.namedImports.get(identifier.text);

    if (namedImport === undefined) {
      return false;
    }

    const candidates = resolveOpenAiImportCandidatePaths(
      runtimeAnalysis.path,
      namedImport.moduleSpecifier,
    ).map(parseRepositoryPath);
    const entries = await Promise.all(candidates.map((path) => session.getEntry(path)));
    session.signal?.throwIfAborted();
    const filePaths = entries
      .filter((entry) => entry?.type === 'file')
      .map((entry) => entry?.path)
      .filter((path) => path !== undefined);

    if (filePaths.length !== 1 || filePaths[0] === undefined) {
      return false;
    }

    reference = { path: filePaths[0], symbol: namedImport.importedName };
  }

  const result =
    reference.path === runtimeAnalysis.path
      ? { analysis: runtimeAnalysis, kind: 'valid' as const }
      : await session.analyzeSource(reference.path);
  session.signal?.throwIfAborted();

  return (
    result.kind === 'valid' &&
    getRegistrationShape(result.analysis, reference.symbol).kind === 'present-supported'
  );
};

const collectAdditionalRegistrations = async (
  session: IOpenAiInspectionSession,
  runtimeAnalysis: IOpenAiSourceAnalysis,
  responses: IOpenAiResponsesAnalysis,
  registrations: readonly IOpenAiRegistrationInspection[],
): Promise<ReadonlySet<ts.Identifier>> => {
  const supportedIdentifiers = new Set<ts.Identifier>();

  for (const request of responses.closedRequests) {
    const identifiers = resolveClosedToolIdentifiers(request, runtimeAnalysis);

    if (identifiers === null || identifiers === undefined) {
      continue;
    }

    for (const identifier of identifiers) {
      if (findMatchingRegistrations(identifier, runtimeAnalysis, registrations).length !== 0) {
        continue;
      }

      if (await resolveAdditionalRegistration(session, identifier, runtimeAnalysis)) {
        supportedIdentifiers.add(identifier);
      }
    }
  }

  return supportedIdentifiers;
};

const classifyToolRelationship = (
  runtimeAnalysis: IOpenAiSourceAnalysis,
  responses: IOpenAiResponsesAnalysis,
  target: IOpenAiRegistrationInspection,
  registrations: readonly IOpenAiRegistrationInspection[],
  additionalRegistrations: ReadonlySet<ts.Identifier>,
): IOpenAiRelationshipResult => {
  let absentExpression: ts.Expression | null = null;
  let hasAmbiguousRelationship = responses.hasAmbiguousCandidate;

  for (const request of responses.closedRequests) {
    const identifiers = resolveClosedToolIdentifiers(request, runtimeAnalysis);

    if (identifiers === null || identifiers === undefined) {
      hasAmbiguousRelationship = true;
      continue;
    }

    let isClosedRegistrationArray = true;
    let containsTarget = false;

    for (const identifier of identifiers) {
      const matches = findMatchingRegistrations(identifier, runtimeAnalysis, registrations);

      if (matches.length === 1) {
        containsTarget ||= matches[0] === target;
      } else if (matches.length !== 0 || !additionalRegistrations.has(identifier)) {
        isClosedRegistrationArray = false;
        break;
      }
    }

    if (!isClosedRegistrationArray) {
      hasAmbiguousRelationship = true;
      continue;
    }

    if (containsTarget) {
      return { kind: 'present' };
    }

    absentExpression ??= request.properties.get('tools') ?? null;
  }

  return hasAmbiguousRelationship
    ? { kind: 'ambiguous' }
    : { expression: absentExpression, kind: 'absent' };
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

  const additionalRegistrations = await collectAdditionalRegistrations(
    session,
    runtimeAnalysis,
    responses,
    registrations,
  );

  for (const registration of registrations) {
    const relationship = classifyToolRelationship(
      runtimeAnalysis,
      responses,
      registration,
      registrations,
      additionalRegistrations,
    );

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
 * @param responses The closed Responses request analysis.
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
