import ts from 'typescript';

import {
  getCallableExportState,
  getConstExport,
  isModuleBindingVisible,
  resolveBindingReferences,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference, IToolManifestEntry } from '@moldea.ai/core/format';

import {
  VERCEL_AI_SDK_ADAPTER_ID,
  VERCEL_AI_SDK_GENERATION_TARGET_ID,
  VERCEL_AI_SDK_TOOL_LOOP_AGENT_TARGET_ID,
} from '../constants/index.js';
import type {
  IVercelAiSdkFunctionTool,
  IVercelAiSdkInspectionSession,
  IVercelAiSdkRelationship,
  IVercelAiSdkSourceAnalysis,
} from '../contracts/index.js';
import {
  classifyVercelAiSdkDirectBinding,
  classifyVercelAiSdkInstructionLoader,
  getVercelAiSdkFunctionTool,
} from '../source-analysis/index.js';
import {
  addVercelAiSdkDiagnostic,
  analyzeVercelAiSdkBoundReference,
  compareVercelAiSdkStrings,
  createVercelAiSdkEvidence,
  isVercelAiSdkMachineString,
  locateVercelAiSdkNode,
} from './common.js';
import {
  resolveVercelAiSdkOutputSchema,
  resolveVercelAiSdkToolMap,
  type IVercelAiSdkResolvedToolMap,
} from './resolution.js';
import type { IVercelAiSdkInspectedAgent } from './types.js';

interface IVercelAiSdkFunctionToolInspection {
  readonly analysis: IVercelAiSdkSourceAnalysis;
  readonly capabilityId: string;
  readonly reference: IRepositoryReference & { readonly symbol: string };
  readonly tool: IVercelAiSdkFunctionTool;
}

interface IVercelAiSdkRelationshipInspection {
  readonly references: readonly IRepositoryReference[];
  readonly state: boolean | null;
}

const getTargetId = (inspected: IVercelAiSdkInspectedAgent): string =>
  inspected.kind === 'tool-loop-agent'
    ? VERCEL_AI_SDK_TOOL_LOOP_AGENT_TARGET_ID
    : VERCEL_AI_SDK_GENERATION_TARGET_ID;

const getRelationships = (
  inspected: IVercelAiSdkInspectedAgent,
  name: 'instructions' | 'output' | 'tools',
): readonly IVercelAiSdkRelationship[] =>
  inspected.kind === 'tool-loop-agent'
    ? [inspected.definition[name]]
    : inspected.wrapper.requests.map((request) => request[name]);

const getRelatedRelationships = (
  inspectedAgents: readonly IVercelAiSdkInspectedAgent[],
  inspected: IVercelAiSdkInspectedAgent,
  name: 'output' | 'tools',
): readonly IVercelAiSdkRelationship[] =>
  inspectedAgents
    .filter((candidate) => candidate.analysis === inspected.analysis)
    .flatMap((candidate) => getRelationships(candidate, name));

const getRelationshipRange = (
  analysis: IVercelAiSdkSourceAnalysis,
  relationships: readonly IVercelAiSdkRelationship[],
) => {
  const present = relationships.find((relationship) => relationship.kind === 'present');
  return present?.kind === 'present' ? locateVercelAiSdkNode(analysis, present.expression) : null;
};

const canEmitNegative = (
  inspected: IVercelAiSdkInspectedAgent,
  results: readonly (boolean | null)[],
): boolean =>
  !(inspected.kind === 'generation-wrapper' && inspected.wrapper.hasAmbiguousCandidate) &&
  results.length > 0 &&
  results.every((result) => result === false);

const inspectConstSymbol = async (
  session: IVercelAiSdkInspectionSession,
  reference: IRepositoryReference,
  diagnosticCode:
    | 'VERCEL_AI_SDK_AGENT_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
    | 'VERCEL_AI_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
    | 'VERCEL_AI_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
    | 'VERCEL_AI_SDK_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
  agentId: string,
  diagnostics: IAdapterDiagnostic[],
  capabilityId?: string,
): Promise<boolean | null> => {
  if (reference.symbol === undefined) {
    return null;
  }

  const analysis = await analyzeVercelAiSdkBoundReference(
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
    addVercelAiSdkDiagnostic(
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
  session: IVercelAiSdkInspectionSession,
  inspected: IVercelAiSdkInspectedAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const reference = inspected.agent.declaration.bindings?.instructionLoader;

  if (reference?.symbol === undefined) {
    return;
  }

  const loaderAnalysis = await analyzeVercelAiSdkBoundReference(
    session,
    reference,
    diagnostics,
    inspected.agent.id,
  );

  if (loaderAnalysis === null) {
    return;
  }

  const loader = getCallableExportState(loaderAnalysis, reference.symbol);

  if (loader.kind === 'absent') {
    addVercelAiSdkDiagnostic(
      diagnostics,
      'VERCEL_AI_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
      reference.path,
      inspected.agent.id,
    );
    return;
  }

  if (loader.kind !== 'present-supported') {
    return;
  }

  const relationships = getRelationships(inspected, 'instructions');
  const results = relationships.map((relationship) =>
    classifyVercelAiSdkInstructionLoader(relationship, inspected.analysis, reference),
  );

  if (results.includes(true)) {
    evidence.push(
      createVercelAiSdkEvidence({
        agentId: inspected.agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: { targetId: getTargetId(inspected) },
        kind: 'instruction-loader',
        references: [
          { path: inspected.analysis.path },
          { path: reference.path, symbol: reference.symbol },
        ],
        runtimeName: reference.symbol,
        source: VERCEL_AI_SDK_ADAPTER_ID,
      }),
    );
  } else if (canEmitNegative(inspected, results)) {
    addVercelAiSdkDiagnostic(
      diagnostics,
      'VERCEL_AI_SDK_INSTRUCTION_LOADER_NOT_WIRED',
      inspected.analysis.path,
      inspected.agent.id,
      getRelationshipRange(inspected.analysis, relationships),
    );
  }
};

const inspectAgentInputSchema = async (
  session: IVercelAiSdkInspectionSession,
  inspected: IVercelAiSdkInspectedAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  if (inspected.kind !== 'tool-loop-agent') {
    return;
  }

  const reference = inspected.agent.declaration.bindings?.inputSchema;

  if (reference?.symbol === undefined) {
    return;
  }

  const symbolState = await inspectConstSymbol(
    session,
    reference,
    'VERCEL_AI_SDK_AGENT_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
    inspected.agent.id,
    diagnostics,
  );

  if (symbolState !== true) {
    return;
  }

  const result = classifyVercelAiSdkDirectBinding(
    inspected.definition.callOptionsSchema,
    inspected.analysis,
    reference,
  );

  if (result === true) {
    evidence.push(
      createVercelAiSdkEvidence({
        agentId: inspected.agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: {
          configurationProperty: 'callOptionsSchema',
          schemaRole: 'agent-input',
          targetId: VERCEL_AI_SDK_TOOL_LOOP_AGENT_TARGET_ID,
        },
        kind: 'schema',
        references: [
          { path: inspected.analysis.path },
          { path: reference.path, symbol: reference.symbol },
        ],
        runtimeName: reference.symbol,
        source: VERCEL_AI_SDK_ADAPTER_ID,
      }),
    );
  } else if (result === false) {
    addVercelAiSdkDiagnostic(
      diagnostics,
      'VERCEL_AI_SDK_AGENT_INPUT_SCHEMA_NOT_WIRED',
      inspected.analysis.path,
      inspected.agent.id,
      getRelationshipRange(inspected.analysis, [inspected.definition.callOptionsSchema]),
    );
  }
};

const classifyOutputRelationship = async (
  session: IVercelAiSdkInspectionSession,
  analysis: IVercelAiSdkSourceAnalysis,
  relationship: IVercelAiSdkRelationship,
  relatedRelationships: readonly IVercelAiSdkRelationship[],
  reference: IRepositoryReference,
): Promise<IVercelAiSdkRelationshipInspection> => {
  if (relationship.kind === 'absent') {
    return Object.freeze({ references: [], state: false });
  }

  if (relationship.kind === 'unresolved') {
    return Object.freeze({ references: [], state: null });
  }

  const output = await resolveVercelAiSdkOutputSchema(
    session,
    analysis,
    relationship,
    relatedRelationships,
  );

  if (output === null || output.relationship.kind !== 'present') {
    return Object.freeze({ references: [], state: null });
  }

  const state = classifyVercelAiSdkDirectBinding(output.relationship, output.analysis, reference);
  const references = output.reference === null ? [] : [output.reference];
  return Object.freeze({ references: Object.freeze(references), state });
};

const inspectAgentOutputSchema = async (
  session: IVercelAiSdkInspectionSession,
  inspected: IVercelAiSdkInspectedAgent,
  relatedRelationships: readonly IVercelAiSdkRelationship[],
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const reference = inspected.agent.declaration.bindings?.outputSchema;

  if (reference?.symbol === undefined) {
    return;
  }

  const symbolState = await inspectConstSymbol(
    session,
    reference,
    'VERCEL_AI_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
    inspected.agent.id,
    diagnostics,
  );

  if (symbolState !== true) {
    return;
  }

  const relationships = getRelationships(inspected, 'output');
  const results: IVercelAiSdkRelationshipInspection[] = [];

  for (const relationship of relationships) {
    results.push(
      await classifyOutputRelationship(
        session,
        inspected.analysis,
        relationship,
        relatedRelationships,
        reference,
      ),
    );
  }

  const matched = results.find(({ state }) => state === true);

  if (matched !== undefined) {
    evidence.push(
      createVercelAiSdkEvidence({
        agentId: inspected.agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: { schemaRole: 'agent-output', targetId: getTargetId(inspected) },
        kind: 'schema',
        references: [
          { path: inspected.analysis.path },
          ...matched.references,
          { path: reference.path, symbol: reference.symbol },
        ],
        runtimeName: reference.symbol,
        source: VERCEL_AI_SDK_ADAPTER_ID,
      }),
    );
  } else if (
    canEmitNegative(
      inspected,
      results.map(({ state }) => state),
    )
  ) {
    addVercelAiSdkDiagnostic(
      diagnostics,
      'VERCEL_AI_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED',
      inspected.analysis.path,
      inspected.agent.id,
      getRelationshipRange(inspected.analysis, relationships),
    );
  }
};

const inspectImplementationSymbol = async (
  session: IVercelAiSdkInspectionSession,
  agent: IIndexedAgent,
  capabilityId: string,
  reference: IRepositoryReference,
  diagnostics: IAdapterDiagnostic[],
): Promise<boolean | null> => {
  if (reference.symbol === undefined) {
    return null;
  }

  const analysis = await analyzeVercelAiSdkBoundReference(
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
    addVercelAiSdkDiagnostic(
      diagnostics,
      'VERCEL_AI_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND',
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
  session: IVercelAiSdkInspectionSession,
  agent: IIndexedAgent,
  capabilityId: string,
  declaration: IToolManifestEntry,
  maps: readonly (IVercelAiSdkResolvedToolMap | null)[],
  diagnostics: IAdapterDiagnostic[],
): Promise<IVercelAiSdkFunctionToolInspection | null> => {
  const reference = declaration.registration;

  if (reference?.symbol === undefined) {
    return null;
  }

  const analysis = await analyzeVercelAiSdkBoundReference(
    session,
    reference,
    diagnostics,
    agent.id,
    capabilityId,
  );

  if (analysis === null) {
    return null;
  }

  const allowedToolMapReferences = new Set<ts.Identifier>();

  for (const map of maps) {
    if (map === null) {
      continue;
    }

    for (const entry of map.map.entries) {
      const candidate = unwrapExpression(entry.expression);

      if (
        ts.isIdentifier(candidate) &&
        isModuleBindingVisible(candidate, map.analysis) &&
        resolveBindingReferences(candidate, map.analysis).some(
          (candidateReference) =>
            candidateReference.path === reference.path &&
            candidateReference.symbol === reference.symbol,
        )
      ) {
        allowedToolMapReferences.add(candidate);
      }
    }
  }

  const registration = getVercelAiSdkFunctionTool(
    analysis,
    reference.symbol,
    allowedToolMapReferences,
  );

  if (registration.kind === 'absent') {
    addVercelAiSdkDiagnostic(
      diagnostics,
      'VERCEL_AI_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
      reference.path,
      agent.id,
      null,
      capabilityId,
    );
    return null;
  }

  return registration.kind === 'present-supported'
    ? Object.freeze({
        analysis,
        capabilityId,
        reference: Object.freeze({ path: reference.path, symbol: reference.symbol }),
        tool: registration.tool,
      })
    : null;
};

const inspectToolSchema = async (
  session: IVercelAiSdkInspectionSession,
  agent: IIndexedAgent,
  capabilityId: string,
  reference: IRepositoryReference,
  registration: IVercelAiSdkFunctionToolInspection | null,
  relationshipName: 'inputSchema' | 'outputSchema',
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<boolean> => {
  if (reference.symbol === undefined) {
    return false;
  }

  const isOutput = relationshipName === 'outputSchema';
  const symbolState = await inspectConstSymbol(
    session,
    reference,
    isOutput
      ? 'VERCEL_AI_SDK_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
      : 'VERCEL_AI_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
    agent.id,
    diagnostics,
    capabilityId,
  );

  if (symbolState !== true || registration === null) {
    return false;
  }

  const relationship = registration.tool[relationshipName];
  const result = classifyVercelAiSdkDirectBinding(relationship, registration.analysis, reference);

  if (result === true) {
    evidence.push(
      createVercelAiSdkEvidence({
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
        source: VERCEL_AI_SDK_ADAPTER_ID,
      }),
    );
    return true;
  }

  if (result === false) {
    addVercelAiSdkDiagnostic(
      diagnostics,
      isOutput
        ? 'VERCEL_AI_SDK_TOOL_OUTPUT_SCHEMA_NOT_WIRED'
        : 'VERCEL_AI_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED',
      registration.analysis.path,
      agent.id,
      getRelationshipRange(registration.analysis, [relationship]),
      capabilityId,
    );
  }

  return false;
};

const resolveToolsMaps = async (
  session: IVercelAiSdkInspectionSession,
  inspected: IVercelAiSdkInspectedAgent,
  relatedRelationships: readonly IVercelAiSdkRelationship[],
): Promise<readonly (IVercelAiSdkResolvedToolMap | null)[]> => {
  const relationships = getRelationships(inspected, 'tools');
  const maps: (IVercelAiSdkResolvedToolMap | null)[] = [];

  for (const relationship of relationships) {
    maps.push(
      relationship.kind === 'absent'
        ? Object.freeze({
            analysis: inspected.analysis,
            map: Object.freeze({ entries: Object.freeze([]), kind: 'closed' }),
            reference: null,
          })
        : await resolveVercelAiSdkToolMap(
            session,
            inspected.analysis,
            relationship,
            relatedRelationships,
          ),
    );
  }

  return Object.freeze(maps);
};

const classifyToolMapEntry = (
  map: IVercelAiSdkResolvedToolMap,
  reference: IRepositoryReference & { readonly symbol: string },
): { readonly matches: readonly string[]; readonly unresolved: boolean } => {
  const matches: string[] = [];
  let unresolved = map.map.kind === 'unresolved';

  for (const entry of map.map.entries) {
    const candidate = unwrapExpression(entry.expression);

    if (ts.isIdentifier(candidate) && isModuleBindingVisible(candidate, map.analysis)) {
      const references = resolveBindingReferences(candidate, map.analysis);

      if (
        references.some(
          (candidateReference) =>
            candidateReference.path === reference.path &&
            candidateReference.symbol === reference.symbol,
        )
      ) {
        matches.push(entry.name);
      } else if (references.length === 0) {
        unresolved = true;
      }
    } else if (ts.isCallExpression(candidate)) {
      const callee = unwrapExpression(candidate.expression);

      if (
        !ts.isIdentifier(callee) ||
        !map.analysis.imports.toolNames.has(callee.text) ||
        !isModuleBindingVisible(callee, map.analysis)
      ) {
        unresolved = true;
      }
    } else if (!ts.isObjectLiteralExpression(candidate)) {
      unresolved = true;
    }
  }

  return Object.freeze({ matches: Object.freeze(matches), unresolved });
};

const inspectToolRegistration = (
  inspected: IVercelAiSdkInspectedAgent,
  capabilityId: string,
  declaration: IToolManifestEntry,
  registration: IVercelAiSdkFunctionToolInspection,
  maps: readonly (IVercelAiSdkResolvedToolMap | null)[],
  establishedImplementation: boolean,
  establishedInputSchema: boolean,
  establishedOutputSchema: boolean,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): void => {
  const classifications = maps.map((map) =>
    map === null
      ? Object.freeze({ matches: Object.freeze([]), unresolved: true })
      : classifyToolMapEntry(map, registration.reference),
  );
  const names = classifications.flatMap(({ matches }) => matches);
  const hasUnresolved =
    (inspected.kind === 'generation-wrapper' && inspected.wrapper.hasAmbiguousCandidate) ||
    classifications.some(({ unresolved }) => unresolved);

  if (names.includes(declaration.name)) {
    const matchedMap = maps.find((map) => {
      if (map === null) {
        return false;
      }
      return classifyToolMapEntry(map, registration.reference).matches.includes(declaration.name);
    });
    const references: IRepositoryReference[] = [
      { path: inspected.analysis.path },
      ...(matchedMap?.reference === null || matchedMap?.reference === undefined
        ? []
        : [matchedMap.reference]),
      registration.reference,
    ];

    if (establishedImplementation) {
      references.push(declaration.implementation);
    }
    if (establishedInputSchema && declaration.inputSchema !== undefined) {
      references.push(declaration.inputSchema);
    }
    if (establishedOutputSchema && declaration.outputSchema !== undefined) {
      references.push(declaration.outputSchema);
    }

    evidence.push(
      createVercelAiSdkEvidence({
        agentId: inspected.agent.id,
        capabilityId,
        capabilityKind: 'tool',
        details: { targetId: getTargetId(inspected), toolType: 'function' },
        kind: 'tool-registration',
        references,
        runtimeName: isVercelAiSdkMachineString(declaration.name) ? declaration.name : null,
        source: VERCEL_AI_SDK_ADAPTER_ID,
      }),
    );
  } else if (names.length > 0 && !hasUnresolved) {
    addVercelAiSdkDiagnostic(
      diagnostics,
      'VERCEL_AI_SDK_TOOL_NAME_MISMATCH',
      registration.analysis.path,
      inspected.agent.id,
      locateVercelAiSdkNode(registration.analysis, registration.tool.object),
      capabilityId,
    );
  } else if (!hasUnresolved) {
    addVercelAiSdkDiagnostic(
      diagnostics,
      'VERCEL_AI_SDK_TOOL_REGISTRATION_NOT_WIRED',
      inspected.analysis.path,
      inspected.agent.id,
      getRelationshipRange(inspected.analysis, getRelationships(inspected, 'tools')),
      capabilityId,
    );
  }
};

const inspectTools = async (
  session: IVercelAiSdkInspectionSession,
  inspected: IVercelAiSdkInspectedAgent,
  maps: readonly (IVercelAiSdkResolvedToolMap | null)[],
  allowedMaps: readonly (IVercelAiSdkResolvedToolMap | null)[],
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  for (const capabilityId of Object.keys(inspected.agent.declaration.tools ?? {}).sort(
    compareVercelAiSdkStrings,
  )) {
    const declaration = inspected.agent.declaration.tools?.[capabilityId];

    if (declaration === undefined) {
      continue;
    }

    const implementationState = await inspectImplementationSymbol(
      session,
      inspected.agent,
      capabilityId,
      declaration.implementation,
      diagnostics,
    );
    const registration = await inspectFunctionTool(
      session,
      inspected.agent,
      capabilityId,
      declaration,
      allowedMaps,
      diagnostics,
    );
    const establishedInputSchema =
      declaration.inputSchema === undefined
        ? false
        : await inspectToolSchema(
            session,
            inspected.agent,
            capabilityId,
            declaration.inputSchema,
            registration,
            'inputSchema',
            evidence,
            diagnostics,
          );
    const establishedOutputSchema =
      declaration.outputSchema === undefined
        ? false
        : await inspectToolSchema(
            session,
            inspected.agent,
            capabilityId,
            declaration.outputSchema,
            registration,
            'outputSchema',
            evidence,
            diagnostics,
          );

    if (registration === null) {
      continue;
    }

    const implementationRelationship = classifyVercelAiSdkDirectBinding(
      registration.tool.execute,
      registration.analysis,
      declaration.implementation,
    );
    const establishedImplementation =
      implementationState === true && implementationRelationship === true;

    if (
      implementationState === true &&
      registration.tool.execute.kind === 'present' &&
      implementationRelationship === false
    ) {
      addVercelAiSdkDiagnostic(
        diagnostics,
        'VERCEL_AI_SDK_TOOL_IMPLEMENTATION_NOT_WIRED',
        registration.analysis.path,
        inspected.agent.id,
        getRelationshipRange(registration.analysis, [registration.tool.execute]),
        capabilityId,
      );
    }

    inspectToolRegistration(
      inspected,
      capabilityId,
      declaration,
      registration,
      maps,
      establishedImplementation,
      establishedInputSchema,
      establishedOutputSchema,
      evidence,
      diagnostics,
    );
  }
};

/** Inspects instruction, agent-schema, function-tool, and tool-schema relationships. */
export const inspectVercelAiSdkRelationships = async (
  session: IVercelAiSdkInspectionSession,
  inspectedAgents: readonly IVercelAiSdkInspectedAgent[],
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const toolMaps = new Map<
    IVercelAiSdkInspectedAgent,
    readonly (IVercelAiSdkResolvedToolMap | null)[]
  >();

  for (const inspected of inspectedAgents) {
    session.signal?.throwIfAborted();
    toolMaps.set(
      inspected,
      await resolveToolsMaps(
        session,
        inspected,
        getRelatedRelationships(inspectedAgents, inspected, 'tools'),
      ),
    );
  }

  const allowedMaps = [...toolMaps.values()].flat();

  for (const inspected of inspectedAgents) {
    session.signal?.throwIfAborted();
    const maps = toolMaps.get(inspected);

    if (maps === undefined) {
      continue;
    }

    await inspectInstructionLoader(session, inspected, evidence, diagnostics);
    await inspectAgentInputSchema(session, inspected, evidence, diagnostics);
    await inspectAgentOutputSchema(
      session,
      inspected,
      getRelatedRelationships(inspectedAgents, inspected, 'output'),
      evidence,
      diagnostics,
    );
    await inspectTools(session, inspected, maps, allowedMaps, evidence, diagnostics);
  }
};
