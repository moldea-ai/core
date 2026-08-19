import type ts from 'typescript';

import { getCallableExportState, getConstExport } from '@moldea.ai/adapter-static-analysis';
import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference, IToolManifestEntry } from '@moldea.ai/core/format';

import {
  OPENAI_AGENTS_SDK_ADAPTER_ID,
  OPENAI_AGENTS_SDK_TOOL_NAME_PATTERN,
} from '../constants/index.js';
import type {
  IOpenAiAgentsSdkAgentDefinition,
  IOpenAiAgentsSdkFunctionTool,
  IOpenAiAgentsSdkInspectionSession,
  IOpenAiAgentsSdkRelationship,
  IOpenAiAgentsSdkSourceAnalysis,
} from '../contracts/index.js';
import {
  analyzeOpenAiAgentsSdkMutations,
  classifyOpenAiAgentsSdkDirectBinding,
  classifyOpenAiAgentsSdkInstructionLoader,
  classifyOpenAiAgentsSdkToolRegistration,
  collectOpenAiAgentsSdkToolCollectionReferences,
  getOpenAiAgentsSdkAgentDefinition,
  getOpenAiAgentsSdkFunctionTool,
  getOpenAiAgentsSdkToolElements,
  resolveOpenAiAgentsSdkStaticString,
} from '../source-analysis/index.js';
import {
  addOpenAiAgentsSdkDiagnostic,
  analyzeOpenAiAgentsSdkBoundReference,
  compareOpenAiAgentsSdkStrings,
  createOpenAiAgentsSdkEvidence,
  locateOpenAiAgentsSdkNode,
} from './common.js';

interface IFunctionToolInspection {
  readonly analysis: IOpenAiAgentsSdkSourceAnalysis;
  readonly capabilityId: string;
  readonly execute: IOpenAiAgentsSdkRelationship;
  readonly isNameMatch: boolean;
  readonly name: string | null;
  readonly outputSchema: IOpenAiAgentsSdkRelationship;
  readonly parameters: IOpenAiAgentsSdkRelationship;
  readonly reference: IRepositoryReference & { readonly symbol: string };
  readonly tool: IOpenAiAgentsSdkFunctionTool;
}

const getAgentDefinitions = (
  analysis: IOpenAiAgentsSdkSourceAnalysis,
): readonly IOpenAiAgentsSdkAgentDefinition[] =>
  [...analysis.exports.keys()].flatMap((symbol) => {
    const definition = getOpenAiAgentsSdkAgentDefinition(analysis, symbol);
    return definition.kind === 'present-supported' && definition.definition !== undefined
      ? [definition.definition]
      : [];
  });

const getAllowedToolReferences = (
  analysis: IOpenAiAgentsSdkSourceAnalysis,
): ReadonlySet<ts.Identifier> => {
  const definitions = getAgentDefinitions(analysis);
  const relationships = definitions.map(({ tools }) => tools);
  const collectionReferences = collectOpenAiAgentsSdkToolCollectionReferences(relationships);

  return new Set(
    definitions.flatMap(({ tools }) =>
      getOpenAiAgentsSdkToolElements(tools, analysis, collectionReferences),
    ),
  );
};

const getRelationshipRange = (
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  relationship: IOpenAiAgentsSdkRelationship,
) =>
  relationship.kind === 'present'
    ? locateOpenAiAgentsSdkNode(analysis, relationship.expression)
    : null;

const inspectConstSymbol = async (
  session: IOpenAiAgentsSdkInspectionSession,
  reference: IRepositoryReference,
  diagnosticCode:
    | 'OPENAI_AGENTS_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
    | 'OPENAI_AGENTS_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
    | 'OPENAI_AGENTS_SDK_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
  agentId: string,
  diagnostics: IAdapterDiagnostic[],
  capabilityId?: string,
): Promise<boolean | null> => {
  if (reference.symbol === undefined) {
    return null;
  }

  const analysis = await analyzeOpenAiAgentsSdkBoundReference(
    session,
    reference,
    diagnostics,
    agentId,
    capabilityId,
  );

  if (analysis === null) {
    return null;
  }

  const exported = getConstExport(analysis, reference.symbol);

  if (exported.kind === 'absent') {
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      diagnosticCode,
      reference.path,
      agentId,
      null,
      capabilityId,
    );
    return false;
  }

  return exported.kind === 'present-supported' ? true : null;
};

const inspectInstructionLoader = async (
  session: IOpenAiAgentsSdkInspectionSession,
  agent: IIndexedAgent,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  definition: IOpenAiAgentsSdkAgentDefinition,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const reference = agent.declaration.bindings?.instructionLoader;

  if (reference?.symbol === undefined) {
    return;
  }

  const loaderAnalysis = await analyzeOpenAiAgentsSdkBoundReference(
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
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      'OPENAI_AGENTS_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
      reference.path,
      agent.id,
    );
    return;
  }

  if (loader.kind !== 'present-supported') {
    return;
  }

  const relationship = classifyOpenAiAgentsSdkInstructionLoader(
    definition.instructions,
    analysis,
    reference,
  );

  if (relationship === true) {
    evidence.push(
      createOpenAiAgentsSdkEvidence({
        agentId: agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: { configurationProperty: 'instructions' },
        kind: 'instruction-loader',
        references: [{ path: analysis.path }, { path: reference.path, symbol: reference.symbol }],
        runtimeName: reference.symbol,
        source: OPENAI_AGENTS_SDK_ADAPTER_ID,
      }),
    );
  } else if (relationship === false) {
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      'OPENAI_AGENTS_SDK_INSTRUCTION_LOADER_NOT_WIRED',
      analysis.path,
      agent.id,
      getRelationshipRange(analysis, definition.instructions),
    );
  }
};

const inspectAgentOutputSchema = async (
  session: IOpenAiAgentsSdkInspectionSession,
  agent: IIndexedAgent,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  definition: IOpenAiAgentsSdkAgentDefinition,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const reference = agent.declaration.bindings?.outputSchema;

  if (reference?.symbol === undefined) {
    return;
  }

  const symbolState = await inspectConstSymbol(
    session,
    reference,
    'OPENAI_AGENTS_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
    agent.id,
    diagnostics,
  );

  if (symbolState !== true) {
    return;
  }

  const relationship = classifyOpenAiAgentsSdkDirectBinding(
    definition.outputType,
    analysis,
    reference,
  );

  if (relationship === true) {
    evidence.push(
      createOpenAiAgentsSdkEvidence({
        agentId: agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: { configurationProperty: 'outputType', schemaRole: 'agent-output' },
        kind: 'schema',
        references: [{ path: analysis.path }, { path: reference.path, symbol: reference.symbol }],
        runtimeName: reference.symbol,
        source: OPENAI_AGENTS_SDK_ADAPTER_ID,
      }),
    );
  } else if (relationship === false) {
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      'OPENAI_AGENTS_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED',
      analysis.path,
      agent.id,
      getRelationshipRange(analysis, definition.outputType),
    );
  }
};

const inspectImplementationSymbol = async (
  session: IOpenAiAgentsSdkInspectionSession,
  agent: IIndexedAgent,
  capabilityId: string,
  reference: IRepositoryReference,
  diagnostics: IAdapterDiagnostic[],
): Promise<boolean | null> => {
  if (reference.symbol === undefined) {
    return null;
  }

  const analysis = await analyzeOpenAiAgentsSdkBoundReference(
    session,
    reference,
    diagnostics,
    agent.id,
    capabilityId,
  );

  if (analysis === null) {
    return null;
  }

  const implementation = getCallableExportState(analysis, reference.symbol);

  if (implementation.kind === 'absent') {
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      'OPENAI_AGENTS_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND',
      reference.path,
      agent.id,
      null,
      capabilityId,
    );
    return false;
  }

  return implementation.kind === 'present-supported' ? true : null;
};

const inspectFunctionTool = async (
  session: IOpenAiAgentsSdkInspectionSession,
  agent: IIndexedAgent,
  capabilityId: string,
  toolDeclaration: IToolManifestEntry,
  diagnostics: IAdapterDiagnostic[],
): Promise<IFunctionToolInspection | null> => {
  const reference = toolDeclaration.registration;

  if (reference?.symbol === undefined) {
    return null;
  }

  const analysis = await analyzeOpenAiAgentsSdkBoundReference(
    session,
    reference,
    diagnostics,
    agent.id,
    capabilityId,
  );

  if (analysis === null) {
    return null;
  }

  const registration = getOpenAiAgentsSdkFunctionTool(analysis, reference.symbol);

  if (registration.kind === 'absent') {
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      'OPENAI_AGENTS_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
      reference.path,
      agent.id,
      null,
      capabilityId,
    );
    return null;
  }

  if (registration.kind !== 'present-supported') {
    return null;
  }

  const staticName = await resolveOpenAiAgentsSdkStaticString(
    session,
    analysis,
    registration.tool.name,
  );

  if (
    staticName.kind !== 'supported' ||
    !OPENAI_AGENTS_SDK_TOOL_NAME_PATTERN.test(staticName.value)
  ) {
    return null;
  }

  const mutations = analyzeOpenAiAgentsSdkMutations(
    analysis,
    registration.tool.declaration,
    getAllowedToolReferences(analysis),
  );

  if (mutations.hasUnknownMutation || mutations.mutatedMembers.has('type')) {
    return null;
  }

  const isNameMutable = mutations.mutatedMembers.has('name');
  const isNameMatch = !isNameMutable && staticName.value === toolDeclaration.name;
  const execute: IOpenAiAgentsSdkRelationship = mutations.mutatedMembers.has('invoke')
    ? { kind: 'unresolved' }
    : registration.tool.execute;
  const outputSchema: IOpenAiAgentsSdkRelationship = mutations.mutatedMembers.has('outputSchema')
    ? { kind: 'unresolved' }
    : registration.tool.outputSchema;
  const parameters: IOpenAiAgentsSdkRelationship = mutations.mutatedMembers.has('parameters')
    ? { kind: 'unresolved' }
    : registration.tool.parameters;

  if (!isNameMutable && !isNameMatch) {
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      'OPENAI_AGENTS_SDK_TOOL_NAME_MISMATCH',
      analysis.path,
      agent.id,
      locateOpenAiAgentsSdkNode(analysis, registration.tool.name),
      capabilityId,
    );
  }

  return Object.freeze({
    analysis,
    capabilityId,
    execute,
    isNameMatch,
    name: isNameMutable ? null : staticName.value,
    outputSchema,
    parameters,
    reference: Object.freeze({ path: reference.path, symbol: reference.symbol }),
    tool: registration.tool,
  });
};

const inspectToolSchema = async (
  session: IOpenAiAgentsSdkInspectionSession,
  agent: IIndexedAgent,
  capabilityId: string,
  reference: IRepositoryReference,
  registration: IFunctionToolInspection | null,
  relationshipName: 'outputSchema' | 'parameters',
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  if (reference.symbol === undefined) {
    return;
  }

  const isOutput = relationshipName === 'outputSchema';
  const symbolState = await inspectConstSymbol(
    session,
    reference,
    isOutput
      ? 'OPENAI_AGENTS_SDK_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
      : 'OPENAI_AGENTS_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
    agent.id,
    diagnostics,
    capabilityId,
  );

  if (symbolState !== true || registration === null) {
    return;
  }

  const relationship = classifyOpenAiAgentsSdkDirectBinding(
    registration[relationshipName],
    registration.analysis,
    reference,
  );

  if (relationship === true) {
    evidence.push(
      createOpenAiAgentsSdkEvidence({
        agentId: agent.id,
        capabilityId,
        capabilityKind: 'tool',
        details: {
          configurationProperty: relationshipName,
          schemaRole: isOutput ? 'tool-output' : 'tool-input',
        },
        kind: 'schema',
        references: [
          { path: registration.analysis.path },
          { path: reference.path, symbol: reference.symbol },
        ],
        runtimeName: reference.symbol,
        source: OPENAI_AGENTS_SDK_ADAPTER_ID,
      }),
    );
  } else if (relationship === false) {
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      isOutput
        ? 'OPENAI_AGENTS_SDK_TOOL_OUTPUT_SCHEMA_NOT_WIRED'
        : 'OPENAI_AGENTS_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED',
      registration.analysis.path,
      agent.id,
      getRelationshipRange(registration.analysis, registration[relationshipName]),
      capabilityId,
    );
  }
};

const inspectTools = async (
  session: IOpenAiAgentsSdkInspectionSession,
  agent: IIndexedAgent,
  runtimeAnalysis: IOpenAiAgentsSdkSourceAnalysis,
  definition: IOpenAiAgentsSdkAgentDefinition,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const localDefinitions = getAgentDefinitions(runtimeAnalysis);
  const toolRelationships = localDefinitions.map(({ tools }) => tools);
  const collectionReferences = collectOpenAiAgentsSdkToolCollectionReferences(toolRelationships);

  for (const capabilityId of Object.keys(agent.declaration.tools ?? {}).sort(
    compareOpenAiAgentsSdkStrings,
  )) {
    const toolDeclaration = agent.declaration.tools?.[capabilityId];

    if (toolDeclaration === undefined) {
      continue;
    }

    const implementationState = await inspectImplementationSymbol(
      session,
      agent,
      capabilityId,
      toolDeclaration.implementation,
      diagnostics,
    );
    const registration = await inspectFunctionTool(
      session,
      agent,
      capabilityId,
      toolDeclaration,
      diagnostics,
    );

    if (toolDeclaration.inputSchema !== undefined) {
      await inspectToolSchema(
        session,
        agent,
        capabilityId,
        toolDeclaration.inputSchema,
        registration,
        'parameters',
        evidence,
        diagnostics,
      );
    }

    if (toolDeclaration.outputSchema !== undefined) {
      await inspectToolSchema(
        session,
        agent,
        capabilityId,
        toolDeclaration.outputSchema,
        registration,
        'outputSchema',
        evidence,
        diagnostics,
      );
    }

    if (registration === null) {
      continue;
    }

    const implementationRelationship = classifyOpenAiAgentsSdkDirectBinding(
      registration.execute,
      registration.analysis,
      toolDeclaration.implementation,
    );

    if (implementationState === true && implementationRelationship === false) {
      addOpenAiAgentsSdkDiagnostic(
        diagnostics,
        'OPENAI_AGENTS_SDK_TOOL_IMPLEMENTATION_NOT_WIRED',
        registration.analysis.path,
        agent.id,
        getRelationshipRange(registration.analysis, registration.execute),
        capabilityId,
      );
    }

    const registrationRelationship = classifyOpenAiAgentsSdkToolRegistration(
      definition.tools,
      runtimeAnalysis,
      registration.reference,
      collectionReferences,
    );

    if (registrationRelationship === false) {
      addOpenAiAgentsSdkDiagnostic(
        diagnostics,
        'OPENAI_AGENTS_SDK_TOOL_REGISTRATION_NOT_WIRED',
        runtimeAnalysis.path,
        agent.id,
        getRelationshipRange(runtimeAnalysis, definition.tools),
        capabilityId,
      );
    } else if (
      registrationRelationship === true &&
      implementationState === true &&
      implementationRelationship === true &&
      registration.isNameMatch &&
      registration.name !== null
    ) {
      evidence.push(
        createOpenAiAgentsSdkEvidence({
          agentId: agent.id,
          capabilityId,
          capabilityKind: 'tool',
          details: { toolType: 'function' },
          kind: 'tool-registration',
          references: [
            { path: runtimeAnalysis.path },
            { path: registration.reference.path, symbol: registration.reference.symbol },
            {
              path: toolDeclaration.implementation.path,
              ...(toolDeclaration.implementation.symbol === undefined
                ? {}
                : { symbol: toolDeclaration.implementation.symbol }),
            },
          ],
          runtimeName: registration.name,
          source: OPENAI_AGENTS_SDK_ADAPTER_ID,
        }),
      );
    }
  }
};

/** Inspects instruction, agent-schema, function-tool, and tool-schema relationships. */
export const inspectOpenAiAgentsSdkRelationships = async (
  session: IOpenAiAgentsSdkInspectionSession,
  agent: IIndexedAgent,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  definition: IOpenAiAgentsSdkAgentDefinition,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  await inspectInstructionLoader(session, agent, analysis, definition, evidence, diagnostics);
  await inspectAgentOutputSchema(session, agent, analysis, definition, evidence, diagnostics);
  await inspectTools(session, agent, analysis, definition, evidence, diagnostics);
};
