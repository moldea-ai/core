import { isSupportedTypeScriptSourcePath } from '@moldea.ai/adapter-static-analysis';
import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type {
  IAdapterDiagnostic,
  IRuntimeAdapterContext,
  IRuntimeAdapterResult,
} from '@moldea.ai/core/adapter';

import { LANGCHAIN_ADAPTER_ID, LANGCHAIN_TARGET_ID } from '../constants/index.js';
import type {
  ILangChainAgentDefinition,
  ILangChainInspectedAgent,
  ILangChainInspectionSession,
  ILangChainSourceAnalysis,
} from '../contracts/index.js';
import {
  getLangChainAgentDefinition,
  resolveLangChainStaticString,
} from '../source-analysis/index.js';
import {
  addLangChainDiagnostic,
  addLangChainSourceFailureDiagnostic,
  analyzeLangChainBoundReference,
  compareLangChainStrings,
  createLangChainEvidence,
  isLangChainMachineString,
} from './common.js';
import { inspectLangChainInstruction } from './instruction-inspection.js';
import { classifyLangChainMiddleware } from './middleware-inspection.js';
import { inspectLangChainPackage } from './package-inspection.js';
import { inspectLangChainOutputSchema } from './schema-inspection.js';
import { createLangChainInspectionSession } from './session.js';
import { inspectLangChainTools } from './tool-inspection.js';

interface ILangChainAgentCandidate {
  readonly agent: IIndexedAgent;
  readonly analysis: ILangChainSourceAnalysis;
  readonly definition: ILangChainAgentDefinition;
}

const inspectAgent = async (
  session: ILangChainInspectionSession,
  agent: IIndexedAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<ILangChainAgentCandidate | null> => {
  const runtimeAgent = agent.declaration.bindings?.runtimeAgent;

  if (runtimeAgent === undefined) {
    return null;
  }

  const targetClassification = await inspectLangChainPackage(
    session,
    runtimeAgent.path,
    evidence,
    diagnostics,
    agent.id,
  );

  if (!isSupportedTypeScriptSourcePath(runtimeAgent.path)) {
    return null;
  }

  const analysis = await analyzeLangChainBoundReference(
    session,
    runtimeAgent,
    diagnostics,
    agent.id,
  );

  if (analysis === null) {
    return null;
  }

  evidence.push(
    createLangChainEvidence({
      agentId: agent.id,
      capabilityId: null,
      capabilityKind: null,
      details: { language: 'typescript' },
      kind: 'language',
      references: [runtimeAgent],
      runtimeName: null,
      source: LANGCHAIN_ADAPTER_ID,
    }),
  );

  if (targetClassification !== 'supported' || runtimeAgent.symbol === undefined) {
    return null;
  }

  const definition = getLangChainAgentDefinition(analysis, runtimeAgent.symbol);

  if (definition.kind === 'absent') {
    addLangChainDiagnostic(
      diagnostics,
      'LANGCHAIN_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
      runtimeAgent.path,
      agent.id,
    );
    return null;
  }

  if (definition.kind !== 'present-supported') {
    return null;
  }

  const staticName =
    definition.definition.name.kind === 'present'
      ? await resolveLangChainStaticString(
          session,
          analysis,
          definition.definition.name.expression,
          (failure) => addLangChainSourceFailureDiagnostic(diagnostics, failure, agent.id),
        )
      : null;
  const runtimeName =
    staticName?.kind === 'supported' && isLangChainMachineString(staticName.value)
      ? staticName.value
      : null;

  evidence.push(
    createLangChainEvidence({
      agentId: agent.id,
      capabilityId: null,
      capabilityKind: null,
      details: { targetId: LANGCHAIN_TARGET_ID },
      kind: 'agent-definition',
      references: [runtimeAgent],
      runtimeName,
      source: LANGCHAIN_ADAPTER_ID,
    }),
  );

  return Object.freeze({ agent, analysis, definition: definition.definition });
};

/**
 * Inspects all scoped LangChain agents through one deterministic operation-local session.
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
export const inspectLangChain = async (
  context: IRuntimeAdapterContext,
): Promise<IRuntimeAdapterResult> => {
  context.signal?.throwIfAborted();
  const session = createLangChainInspectionSession(context);
  const evidence: IRuntimeAdapterEvidence[] = [];
  const diagnostics: IAdapterDiagnostic[] = [];
  const agents = [...context.agents].sort((left, right) =>
    compareLangChainStrings(left.id, right.id),
  );
  const candidates: ILangChainAgentCandidate[] = [];

  for (const agent of agents) {
    context.signal?.throwIfAborted();
    const candidate = await inspectAgent(session, agent, evidence, diagnostics);

    if (candidate !== null) {
      candidates.push(candidate);
    }
  }

  const inspectedAgents: ILangChainInspectedAgent[] = [];

  for (const candidate of candidates) {
    context.signal?.throwIfAborted();
    const relatedMiddleware = candidates
      .filter(({ analysis }) => analysis === candidate.analysis)
      .map(({ definition }) => definition.middleware);
    const middlewareState = await classifyLangChainMiddleware(
      session,
      candidate.analysis,
      candidate.definition.middleware,
      relatedMiddleware,
      diagnostics,
      candidate.agent.id,
    );
    inspectedAgents.push(Object.freeze({ ...candidate, middlewareState }));
  }

  for (const inspected of inspectedAgents) {
    context.signal?.throwIfAborted();
    await inspectLangChainInstruction(session, inspected, evidence, diagnostics);
    context.signal?.throwIfAborted();
    await inspectLangChainOutputSchema(session, inspected, evidence, diagnostics);
  }

  context.signal?.throwIfAborted();
  await inspectLangChainTools(session, inspectedAgents, evidence, diagnostics);
  context.signal?.throwIfAborted();

  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    evidence: Object.freeze(evidence),
  });
};
