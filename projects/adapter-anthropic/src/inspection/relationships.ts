import ts from 'typescript';

import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference, IToolManifestEntry } from '@moldea.ai/core/format';
import { parseRepositoryPath } from '@moldea.ai/repository';

import { ANTHROPIC_ADAPTER_ID, ANTHROPIC_TOOL_NAME_MAX_SCALAR_LENGTH } from '../constants/index.js';
import type {
  IAnthropicInspectionSession,
  IAnthropicRequestRelationship,
  IAnthropicMessagesAnalysis,
  IAnthropicSourceAnalysis,
} from '../contracts/index.js';
import {
  getAnthropicCallableExportState,
  getAnthropicClosedArrayIdentifiers,
  getAnthropicClosedObjectProperties,
  getAnthropicConstExport,
  getAnthropicDirectCall,
  getAnthropicStaticString,
  isAnthropicBoundIdentifier,
  isAnthropicModuleBindingVisible,
  isAnthropicNullLiteral,
  isAnthropicStaticLiteralValue,
  isSafeAnthropicModuleArray,
  resolveAnthropicImportCandidatePaths,
  unwrapAnthropicExpression,
} from '../source-analysis/index.js';
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

type IAnthropicRelationshipResult =
  | { readonly expression: ts.Expression | null; readonly kind: 'absent' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'present' };

const getExpressionRange = (
  analysis: IAnthropicSourceAnalysis,
  expression: ts.Expression | null,
) =>
  expression === null
    ? null
    : analysis.text.locator.locateRange(expression.getStart(), expression.end);

const isSupportedRegistrationInputSchema = (
  expression: ts.Expression,
  analysis: IAnthropicSourceAnalysis,
  inputSchemaReference: IRepositoryReference | undefined,
): boolean => {
  const candidate = unwrapAnthropicExpression(expression);

  return (
    (ts.isObjectLiteralExpression(candidate) && isAnthropicStaticLiteralValue(candidate)) ||
    (ts.isIdentifier(candidate) &&
      inputSchemaReference?.symbol !== undefined &&
      isAnthropicBoundIdentifier(candidate, analysis, inputSchemaReference))
  );
};

const getRegistrationShape = (
  analysis: IAnthropicSourceAnalysis,
  symbol: string,
  inputSchemaReference?: IRepositoryReference,
): IAnthropicRegistrationShapeResult => {
  const exported = getAnthropicConstExport(analysis, symbol);

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

  const properties = getAnthropicClosedObjectProperties(object);

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
  const detectedName = getAnthropicStaticString(name);
  const isSupportedDescription =
    description === undefined || getAnthropicStaticString(description) !== null;
  const isSupportedStrict =
    strict === undefined ||
    unwrapAnthropicExpression(strict).kind === ts.SyntaxKind.TrueKeyword ||
    unwrapAnthropicExpression(strict).kind === ts.SyntaxKind.FalseKeyword;
  const isSupportedType =
    type === undefined ||
    isAnthropicNullLiteral(type) ||
    getAnthropicStaticString(type) === 'custom';

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
  const detectedNameLength = [...shape.detectedName].length;
  const isNameValid =
    detectedNameLength > 0 && detectedNameLength <= ANTHROPIC_TOOL_NAME_MAX_SCALAR_LENGTH;

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

  const schema = getAnthropicConstExport(schemaAnalysis, reference.symbol);

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

  const candidate = unwrapAnthropicExpression(inputSchema);

  if (
    ts.isIdentifier(candidate) &&
    isAnthropicBoundIdentifier(candidate, registrationAnalysis, reference)
  ) {
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

  const isProvablyDifferent =
    isAnthropicNullLiteral(candidate) ||
    (ts.isObjectLiteralExpression(candidate) && isAnthropicStaticLiteralValue(candidate));

  if (isProvablyDifferent) {
    addAnthropicDiagnostic(
      diagnostics,
      'ANTHROPIC_TOOL_INPUT_SCHEMA_NOT_WIRED',
      registrationAnalysis.path,
      agent.id,
      getExpressionRange(registrationAnalysis, candidate),
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

  const loader = getAnthropicCallableExportState(loaderAnalysis, reference.symbol);

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

  let absentExpression: ts.Expression | null = null;
  let hasAmbiguousRelationship = messages.hasAmbiguousCandidate;

  for (const request of messages.requests) {
    if (request.system.kind === 'unresolved') {
      hasAmbiguousRelationship = true;
      continue;
    }

    if (request.system.kind === 'absent') {
      continue;
    }

    const system = request.system.expression;

    const call = getAnthropicDirectCall(system);

    if (call !== null) {
      const callee = unwrapAnthropicExpression(call.expression);

      if (
        ts.isIdentifier(callee) &&
        isAnthropicBoundIdentifier(callee, runtimeAnalysis, reference)
      ) {
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
        return;
      }

      if (ts.isIdentifier(callee)) {
        absentExpression ??= system;
        continue;
      }
    }

    if (isAnthropicStaticLiteralValue(system)) {
      absentExpression ??= system;
    } else {
      hasAmbiguousRelationship = true;
    }
  }

  if (!hasAmbiguousRelationship) {
    addAnthropicDiagnostic(
      diagnostics,
      'ANTHROPIC_INSTRUCTION_LOADER_NOT_WIRED',
      runtimeAnalysis.path,
      agent.id,
      getExpressionRange(runtimeAnalysis, absentExpression),
    );
  }
};

const resolveClosedToolIdentifiers = (
  relationship: IAnthropicRequestRelationship,
  runtimeAnalysis: IAnthropicSourceAnalysis,
): readonly ts.Identifier[] | null | undefined => {
  if (relationship.kind === 'absent') {
    return [];
  }

  if (relationship.kind === 'unresolved') {
    return undefined;
  }

  const candidate = unwrapAnthropicExpression(relationship.expression);

  if (ts.isArrayLiteralExpression(candidate)) {
    return getAnthropicClosedArrayIdentifiers(candidate);
  }

  if (ts.isIdentifier(candidate) && isAnthropicModuleBindingVisible(candidate, runtimeAnalysis)) {
    const moduleArray = runtimeAnalysis.moduleArrays.get(candidate.text);

    if (moduleArray === undefined || !isSafeAnthropicModuleArray(runtimeAnalysis, candidate.text)) {
      return null;
    }

    return getAnthropicClosedArrayIdentifiers(moduleArray.expression);
  }

  return isAnthropicStaticLiteralValue(candidate) ? [] : undefined;
};

const findMatchingRegistrations = (
  identifier: ts.Identifier,
  runtimeAnalysis: IAnthropicSourceAnalysis,
  registrations: readonly IAnthropicRegistrationInspection[],
): readonly IAnthropicRegistrationInspection[] =>
  registrations.filter((registration) =>
    isAnthropicBoundIdentifier(identifier, runtimeAnalysis, registration.reference),
  );

const resolveAdditionalRegistration = async (
  session: IAnthropicInspectionSession,
  identifier: ts.Identifier,
  runtimeAnalysis: IAnthropicSourceAnalysis,
): Promise<boolean> => {
  if (!isAnthropicModuleBindingVisible(identifier, runtimeAnalysis)) {
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

    const candidates = resolveAnthropicImportCandidatePaths(
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
  session: IAnthropicInspectionSession,
  runtimeAnalysis: IAnthropicSourceAnalysis,
  messages: IAnthropicMessagesAnalysis,
  registrations: readonly IAnthropicRegistrationInspection[],
): Promise<ReadonlySet<ts.Identifier>> => {
  const supportedIdentifiers = new Set<ts.Identifier>();

  for (const request of messages.requests) {
    const identifiers = resolveClosedToolIdentifiers(request.tools, runtimeAnalysis);

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
  runtimeAnalysis: IAnthropicSourceAnalysis,
  messages: IAnthropicMessagesAnalysis,
  target: IAnthropicRegistrationInspection,
  registrations: readonly IAnthropicRegistrationInspection[],
  additionalRegistrations: ReadonlySet<ts.Identifier>,
): IAnthropicRelationshipResult => {
  let absentExpression: ts.Expression | null = null;
  let hasAmbiguousRelationship = messages.hasAmbiguousCandidate;

  for (const request of messages.requests) {
    const identifiers = resolveClosedToolIdentifiers(request.tools, runtimeAnalysis);

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

    absentExpression ??= request.tools.kind === 'present' ? request.tools.expression : null;
  }

  return hasAmbiguousRelationship
    ? { kind: 'ambiguous' }
    : { expression: absentExpression, kind: 'absent' };
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

  const additionalRegistrations = await collectAdditionalRegistrations(
    session,
    runtimeAnalysis,
    messages,
    registrations,
  );

  for (const registration of registrations) {
    const relationship = classifyToolRelationship(
      runtimeAnalysis,
      messages,
      registration,
      registrations,
      additionalRegistrations,
    );

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
