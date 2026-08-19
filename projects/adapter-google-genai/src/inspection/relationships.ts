import type ts from 'typescript';

import {
  classifyDirectCallRelationship,
  classifySchemaRelationship,
  getCallableExportState,
  getConstExport,
  isModuleConstValueSafe,
} from '@moldea.ai/adapter-static-analysis';
import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference, IToolManifestEntry } from '@moldea.ai/core/format';

import { GOOGLE_GENAI_ADAPTER_ID } from '../constants/index.js';
import type {
  IGoogleGenAiGenerateContentAnalysis,
  IGoogleGenAiInspectionSession,
  IGoogleGenAiSourceAnalysis,
} from '../contracts/index.js';
import {
  analyzeGoogleGenAiToolCollections,
  getGoogleGenAiFunctionDeclarationShape,
  isGoogleGenAiFunctionNameValid,
  type IGoogleGenAiCollectionRegistration,
  type IGoogleGenAiFunctionDeclarationShape,
} from '../source-analysis/index.js';
import {
  addGoogleGenAiDiagnostic,
  analyzeGoogleGenAiBoundReference,
  compareGoogleGenAiStrings,
  createGoogleGenAiEvidence,
} from './common.js';

interface IGoogleGenAiRegistrationInspection {
  readonly analysis: IGoogleGenAiSourceAnalysis;
  readonly capabilityId: string;
  readonly detectedName: string;
  readonly inputSchema?: IRepositoryReference;
  readonly isNameMatch: boolean;
  readonly isNameValid: boolean;
  readonly reference: IRepositoryReference & { readonly symbol: string };
  readonly shape: IGoogleGenAiFunctionDeclarationShape;
}

const getExpressionRange = (
  analysis: IGoogleGenAiSourceAnalysis,
  expression: ts.Expression | null,
) =>
  expression === null
    ? null
    : analysis.text.locator.locateRange(expression.getStart(), expression.end);

const inspectInputSchema = async (
  session: IGoogleGenAiInspectionSession,
  agent: IIndexedAgent,
  capabilityId: string,
  reference: IRepositoryReference,
  registrationAnalysis: IGoogleGenAiSourceAnalysis,
  parametersJsonSchema: ts.Expression | null | undefined,
  hasAmbiguousCandidate: boolean,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  if (reference.symbol === undefined) {
    return;
  }

  const schemaAnalysis = await analyzeGoogleGenAiBoundReference(
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
    addGoogleGenAiDiagnostic(
      diagnostics,
      'GOOGLE_GENAI_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
      reference.path,
      agent.id,
      null,
      capabilityId,
    );
    return;
  }

  if (schema.kind !== 'present-supported' || parametersJsonSchema === null) {
    if (
      schema.kind === 'present-supported' &&
      parametersJsonSchema === null &&
      !hasAmbiguousCandidate
    ) {
      addGoogleGenAiDiagnostic(
        diagnostics,
        'GOOGLE_GENAI_TOOL_INPUT_SCHEMA_NOT_WIRED',
        registrationAnalysis.path,
        agent.id,
        null,
        capabilityId,
      );
    }

    return;
  }

  if (parametersJsonSchema === undefined) {
    return;
  }

  const relationship = classifySchemaRelationship(
    registrationAnalysis,
    parametersJsonSchema,
    reference,
  );

  if (relationship.kind === 'present') {
    evidence.push(
      createGoogleGenAiEvidence({
        agentId: agent.id,
        capabilityId,
        capabilityKind: 'tool',
        details: { requestProperty: 'parametersJsonSchema', schemaRole: 'input' },
        kind: 'schema',
        references: [
          { path: registrationAnalysis.path },
          { path: reference.path, symbol: reference.symbol },
        ],
        runtimeName: reference.symbol,
        source: GOOGLE_GENAI_ADAPTER_ID,
      }),
    );
  } else if (relationship.kind === 'absent' && !hasAmbiguousCandidate) {
    addGoogleGenAiDiagnostic(
      diagnostics,
      'GOOGLE_GENAI_TOOL_INPUT_SCHEMA_NOT_WIRED',
      registrationAnalysis.path,
      agent.id,
      getExpressionRange(registrationAnalysis, relationship.expression),
      capabilityId,
    );
  }
};

const inspectRegistration = async (
  session: IGoogleGenAiInspectionSession,
  agent: IIndexedAgent,
  capabilityId: string,
  tool: IToolManifestEntry,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<IGoogleGenAiRegistrationInspection | null> => {
  const reference = tool.registration;

  if (reference?.symbol === undefined) {
    return null;
  }

  const registrationAnalysis = await analyzeGoogleGenAiBoundReference(
    session,
    reference,
    diagnostics,
    agent.id,
    capabilityId,
  );

  if (registrationAnalysis === null) {
    return null;
  }

  const shape = getGoogleGenAiFunctionDeclarationShape(
    registrationAnalysis,
    reference.symbol,
    tool.inputSchema,
  );

  if (shape.kind === 'absent') {
    addGoogleGenAiDiagnostic(
      diagnostics,
      'GOOGLE_GENAI_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
      reference.path,
      agent.id,
      null,
      capabilityId,
    );
    return null;
  }

  const declaration = registrationAnalysis.moduleConstDeclarations.get(reference.symbol);

  if (
    declaration === undefined ||
    !isModuleConstValueSafe(registrationAnalysis, declaration, new Set(), 'object')
  ) {
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
        undefined,
        true,
        evidence,
        diagnostics,
      );
    }

    return null;
  }

  const isNameMatch = shape.detectedName === tool.name;
  const isNameValid = isGoogleGenAiFunctionNameValid(shape.detectedName);

  if (!isNameMatch) {
    addGoogleGenAiDiagnostic(
      diagnostics,
      'GOOGLE_GENAI_TOOL_NAME_MISMATCH',
      registrationAnalysis.path,
      agent.id,
      getExpressionRange(registrationAnalysis, shape.name),
      capabilityId,
    );
  }

  if (!isNameValid) {
    addGoogleGenAiDiagnostic(
      diagnostics,
      'GOOGLE_GENAI_TOOL_NAME_INVALID',
      registrationAnalysis.path,
      agent.id,
      getExpressionRange(registrationAnalysis, shape.name),
      capabilityId,
    );
  }

  return Object.freeze({
    analysis: registrationAnalysis,
    capabilityId,
    detectedName: shape.detectedName,
    ...(tool.inputSchema === undefined ? {} : { inputSchema: tool.inputSchema }),
    isNameMatch,
    isNameValid,
    reference: Object.freeze({ path: reference.path, symbol: reference.symbol }),
    shape,
  });
};

const inspectInstructionLoader = async (
  session: IGoogleGenAiInspectionSession,
  agent: IIndexedAgent,
  runtimeAnalysis: IGoogleGenAiSourceAnalysis,
  generateContent: IGoogleGenAiGenerateContentAnalysis,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const reference = agent.declaration.bindings?.instructionLoader;

  if (reference?.symbol === undefined) {
    return;
  }

  const loaderAnalysis = await analyzeGoogleGenAiBoundReference(
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
    addGoogleGenAiDiagnostic(
      diagnostics,
      'GOOGLE_GENAI_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
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
    generateContent.requests.map((request) => request.systemInstruction),
    generateContent.hasAmbiguousCandidate,
    reference,
  );

  if (relationship.kind === 'present') {
    evidence.push(
      createGoogleGenAiEvidence({
        agentId: agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: { requestProperty: 'config.systemInstruction' },
        kind: 'instruction-loader',
        references: [
          { path: runtimeAnalysis.path },
          { path: reference.path, symbol: reference.symbol },
        ],
        runtimeName: reference.symbol,
        source: GOOGLE_GENAI_ADAPTER_ID,
      }),
    );
  } else if (relationship.kind === 'absent') {
    addGoogleGenAiDiagnostic(
      diagnostics,
      'GOOGLE_GENAI_INSTRUCTION_LOADER_NOT_WIRED',
      runtimeAnalysis.path,
      agent.id,
      getExpressionRange(runtimeAnalysis, relationship.expression),
    );
  }
};

const inspectToolRelationships = async (
  session: IGoogleGenAiInspectionSession,
  agent: IIndexedAgent,
  runtimeAnalysis: IGoogleGenAiSourceAnalysis,
  generateContent: IGoogleGenAiGenerateContentAnalysis,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const registrations: IGoogleGenAiRegistrationInspection[] = [];

  for (const capabilityId of Object.keys(agent.declaration.tools ?? {}).sort(
    compareGoogleGenAiStrings,
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

  const collectionRegistrations: IGoogleGenAiCollectionRegistration[] = registrations.map(
    ({ inputSchema, reference }) =>
      Object.freeze({
        ...(inputSchema === undefined ? {} : { inputSchema }),
        reference,
      }),
  );
  const collections = await analyzeGoogleGenAiToolCollections(
    runtimeAnalysis,
    generateContent.requests.map((request) => request.tools),
    collectionRegistrations,
    session,
    generateContent.hasAmbiguousCandidate,
  );

  for (const registration of registrations) {
    if (registration.inputSchema === undefined) {
      continue;
    }

    await inspectInputSchema(
      session,
      agent,
      registration.capabilityId,
      registration.inputSchema,
      registration.analysis,
      registration.shape.parametersJsonSchema,
      collections.hasAmbiguousCandidate,
      evidence,
      diagnostics,
    );
  }

  for (const expression of collections.limitViolationExpressions) {
    addGoogleGenAiDiagnostic(
      diagnostics,
      'GOOGLE_GENAI_FUNCTION_DECLARATION_LIMIT_EXCEEDED',
      runtimeAnalysis.path,
      agent.id,
      getExpressionRange(runtimeAnalysis, expression),
    );
  }

  registrations.forEach((registration, index) => {
    if (collections.presentRegistrationIndexes.has(index)) {
      if (registration.isNameMatch && registration.isNameValid) {
        evidence.push(
          createGoogleGenAiEvidence({
            agentId: agent.id,
            capabilityId: registration.capabilityId,
            capabilityKind: 'tool',
            details: { toolType: 'function-declaration' },
            kind: 'tool-registration',
            references: [
              { path: runtimeAnalysis.path },
              { path: registration.reference.path, symbol: registration.reference.symbol },
            ],
            runtimeName: registration.detectedName,
            source: GOOGLE_GENAI_ADAPTER_ID,
          }),
        );
      }

      return;
    }

    if (!collections.hasAmbiguousCandidate) {
      addGoogleGenAiDiagnostic(
        diagnostics,
        'GOOGLE_GENAI_TOOL_REGISTRATION_NOT_WIRED',
        runtimeAnalysis.path,
        agent.id,
        getExpressionRange(runtimeAnalysis, collections.absentExpression),
        registration.capabilityId,
      );
    }
  });
};

/**
 * Inspects loader, tool-registration, input-schema, and provider-limit relationships.
 * @param session The operation-local inspection session.
 * @param agent The indexed agent declaration.
 * @param runtimeAnalysis The indexed runtime-agent source.
 * @param generateContent The nested generate-content request analysis.
 * @param evidence The operation evidence collection.
 * @param diagnostics The operation diagnostic collection.
 */
export const inspectGoogleGenAiRelationships = async (
  session: IGoogleGenAiInspectionSession,
  agent: IIndexedAgent,
  runtimeAnalysis: IGoogleGenAiSourceAnalysis,
  generateContent: IGoogleGenAiGenerateContentAnalysis,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  await inspectInstructionLoader(
    session,
    agent,
    runtimeAnalysis,
    generateContent,
    evidence,
    diagnostics,
  );
  await inspectToolRelationships(
    session,
    agent,
    runtimeAnalysis,
    generateContent,
    evidence,
    diagnostics,
  );
};
