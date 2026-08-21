import { isSupportedTypeScriptSourcePath } from '@moldea.ai/adapter-static-analysis';
import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type {
  IAdapterDiagnostic,
  IRuntimeAdapterContext,
  IRuntimeAdapterResult,
} from '@moldea.ai/core/adapter';

import {
  LANGGRAPH_ADAPTER_ID,
  LANGGRAPH_FUNCTIONAL_API_TARGET_ID,
  LANGGRAPH_STATE_GRAPH_TARGET_ID,
} from '../constants/index.js';
import type {
  ILangGraphAgentDefinitionResult,
  ILangGraphInspectionSession,
  ILangGraphRelationship,
  ILangGraphRuntimePattern,
  ILangGraphSourceFailure,
} from '../contracts/index.js';
import {
  getLangGraphFunctionalDefinition,
  getLangGraphStateGraphDefinition,
  resolveLangGraphStaticString,
} from '../source-analysis/index.js';
import {
  addLangGraphDiagnostic,
  addLangGraphSourceFailureDiagnostic,
  analyzeLangGraphBoundReference,
  compareLangGraphStrings,
  createLangGraphEvidence,
  isLangGraphEvidenceSafeName,
  isLangGraphMachineString,
} from './common.js';
import { inspectLangGraphPackage } from './package-inspection.js';
import { inspectLangGraphSchema } from './schema-inspection.js';
import { createLangGraphInspectionSession } from './session.js';

const getRuntimeName = async (
  session: ILangGraphInspectionSession,
  relationship: ILangGraphRelationship,
  onSourceFailure: (failure: ILangGraphSourceFailure) => void,
): Promise<string | null> => {
  if (relationship.kind !== 'present') {
    return null;
  }

  const result = await resolveLangGraphStaticString(
    session,
    relationship.analysis,
    relationship.expression,
    onSourceFailure,
  );

  return result.kind === 'supported' &&
    isLangGraphMachineString(result.value.value) &&
    isLangGraphEvidenceSafeName(result.value.value)
    ? result.value.value
    : null;
};

const emitPatterns = (
  agentId: string,
  targetId: string,
  patterns: readonly ILangGraphRuntimePattern[],
  evidence: IRuntimeAdapterEvidence[],
): void => {
  for (const pattern of patterns) {
    evidence.push(
      createLangGraphEvidence({
        agentId,
        capabilityId: null,
        capabilityKind: null,
        details: { ...pattern.details, targetId },
        kind: 'runtime-pattern',
        references: pattern.references,
        runtimeName: pattern.runtimeName,
        source: LANGGRAPH_ADAPTER_ID,
      }),
    );
  }
};

const selectDefinition = async (
  session: ILangGraphInspectionSession,
  agent: IIndexedAgent,
  diagnostics: IAdapterDiagnostic[],
  analysis: Parameters<typeof getLangGraphStateGraphDefinition>[1],
  symbol: string,
): Promise<ILangGraphAgentDefinitionResult> => {
  const sourceFailures = new Set<string>();
  const onSourceFailure = (failure: ILangGraphSourceFailure): void => {
    const key = `${failure.kind}\0${failure.path}`;

    if (sourceFailures.has(key)) {
      return;
    }

    sourceFailures.add(key);
    addLangGraphSourceFailureDiagnostic(diagnostics, failure, agent.id);
  };
  const graph = await getLangGraphStateGraphDefinition(session, analysis, symbol, onSourceFailure);

  if (graph.kind === 'present-supported') {
    return graph;
  }

  const functional = await getLangGraphFunctionalDefinition(
    session,
    analysis,
    symbol,
    onSourceFailure,
  );

  if (functional.kind === 'present-supported') {
    return functional;
  }

  return graph.kind === 'absent' && functional.kind === 'absent'
    ? Object.freeze({ kind: 'absent' })
    : Object.freeze({
        declaration:
          graph.kind === 'present-unsupported'
            ? graph.declaration
            : functional.kind === 'present-unsupported'
              ? functional.declaration
              : analysis.sourceFile,
        kind: 'present-unsupported',
      });
};

const inspectAgent = async (
  session: ILangGraphInspectionSession,
  agent: IIndexedAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const runtimeAgent = agent.declaration.bindings?.runtimeAgent;

  if (runtimeAgent === undefined) {
    return;
  }

  const targetClassification = await inspectLangGraphPackage(
    session,
    runtimeAgent.path,
    evidence,
    diagnostics,
    agent.id,
  );

  if (!isSupportedTypeScriptSourcePath(runtimeAgent.path)) {
    return;
  }

  const analysis = await analyzeLangGraphBoundReference(
    session,
    runtimeAgent,
    diagnostics,
    agent.id,
  );

  if (analysis === null) {
    return;
  }

  evidence.push(
    createLangGraphEvidence({
      agentId: agent.id,
      capabilityId: null,
      capabilityKind: null,
      details: { language: 'typescript', moduleKind: 'esm' },
      kind: 'language',
      references: [runtimeAgent],
      runtimeName: null,
      source: LANGGRAPH_ADAPTER_ID,
    }),
  );

  if (targetClassification !== 'supported' || runtimeAgent.symbol === undefined) {
    return;
  }

  const definition = await selectDefinition(
    session,
    agent,
    diagnostics,
    analysis,
    runtimeAgent.symbol,
  );

  if (definition.kind === 'absent') {
    addLangGraphDiagnostic(
      diagnostics,
      'LANGGRAPH_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
      runtimeAgent.path,
      agent.id,
    );
    return;
  }

  if (definition.kind !== 'present-supported') {
    return;
  }

  const sourceFailures = new Set<string>();
  const onSourceFailure = (failure: ILangGraphSourceFailure): void => {
    const key = `${failure.kind}\0${failure.path}`;

    if (!sourceFailures.has(key)) {
      sourceFailures.add(key);
      addLangGraphSourceFailureDiagnostic(diagnostics, failure, agent.id);
    }
  };
  const runtimeName = await getRuntimeName(session, definition.definition.name, onSourceFailure);
  const apiKind =
    definition.targetId === LANGGRAPH_STATE_GRAPH_TARGET_ID ? 'state-graph' : 'functional';
  const references =
    definition.targetId === LANGGRAPH_FUNCTIONAL_API_TARGET_ID &&
    definition.definition.functionAnalysis.path !== runtimeAgent.path
      ? [runtimeAgent, { path: definition.definition.functionAnalysis.path }]
      : [runtimeAgent];

  evidence.push(
    createLangGraphEvidence({
      agentId: agent.id,
      capabilityId: null,
      capabilityKind: null,
      details: {
        apiKind,
        ...(definition.targetId === LANGGRAPH_STATE_GRAPH_TARGET_ID
          ? { builderForm: definition.definition.builderForm }
          : {}),
        targetId: definition.targetId,
      },
      kind: 'agent-definition',
      references,
      runtimeName,
      source: LANGGRAPH_ADAPTER_ID,
    }),
  );

  emitPatterns(agent.id, definition.targetId, definition.definition.patterns, evidence);

  if (definition.targetId === LANGGRAPH_STATE_GRAPH_TARGET_ID) {
    await inspectLangGraphSchema(
      session,
      {
        agent,
        graphAnalysis: definition.definition.analysis,
        relationship: definition.definition.inputSchema,
        role: 'input',
      },
      evidence,
      diagnostics,
    );
    await inspectLangGraphSchema(
      session,
      {
        agent,
        graphAnalysis: definition.definition.analysis,
        relationship: definition.definition.outputSchema,
        role: 'output',
      },
      evidence,
      diagnostics,
    );
  }
};

/**
 * Inspects all scoped LangGraph agents through one deterministic operation-local session.
 * @param context The Core-provided immutable adapter context.
 * @returns A promise resolving to source-grounded evidence and diagnostics.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - ENTRY_NOT_FOUND: The requested repository entry was not found.
 * - ENTRY_NOT_FILE: The requested repository entry is not a file.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
 * - ABORTED: The repository operation or inspection signal was aborted.
 */
export const inspectLangGraph = async (
  context: IRuntimeAdapterContext,
): Promise<IRuntimeAdapterResult> => {
  context.signal?.throwIfAborted();
  const session = createLangGraphInspectionSession(context);
  const evidence: IRuntimeAdapterEvidence[] = [];
  const diagnostics: IAdapterDiagnostic[] = [];
  const agents = [...context.agents].sort((left, right) =>
    compareLangGraphStrings(left.id, right.id),
  );

  for (const agent of agents) {
    context.signal?.throwIfAborted();
    await inspectAgent(session, agent, evidence, diagnostics);
  }

  context.signal?.throwIfAborted();
  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    evidence: Object.freeze(evidence),
  });
};
