import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type {
  IAdapterDiagnostic,
  IRuntimeAdapterContext,
  IRuntimeAdapterResult,
} from '@moldea.ai/core/adapter';

import { OPENAI_ADAPTER_ID, OPENAI_RESPONSES_RUNTIME_NAME } from '../constants/index.js';
import type { IOpenAiInspectionSession } from '../contracts/index.js';
import {
  analyzeOpenAiResponses,
  getOpenAiRuntimeExport,
  isSupportedOpenAiSourcePath,
} from '../source-analysis/index.js';
import {
  addOpenAiDiagnostic,
  analyzeOpenAiBoundReference,
  compareOpenAiStrings,
  createOpenAiEvidence,
} from './common.js';
import { inspectOpenAiPackage } from './package-inspection.js';
import { inspectOpenAiRelationships } from './relationships.js';
import { createOpenAiInspectionSession } from './session.js';

const inspectAgent = async (
  session: IOpenAiInspectionSession,
  agent: IIndexedAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const runtimeAgent = agent.declaration.bindings?.runtimeAgent;

  if (runtimeAgent === undefined) {
    return;
  }

  await inspectOpenAiPackage(session, runtimeAgent.path, evidence, diagnostics, agent.id);

  if (!isSupportedOpenAiSourcePath(runtimeAgent.path)) {
    return;
  }

  evidence.push(
    createOpenAiEvidence({
      agentId: agent.id,
      capabilityId: null,
      capabilityKind: null,
      details: { language: 'typescript' },
      kind: 'language',
      references: [
        runtimeAgent.symbol === undefined
          ? { path: runtimeAgent.path }
          : { path: runtimeAgent.path, symbol: runtimeAgent.symbol },
      ],
      runtimeName: null,
      source: OPENAI_ADAPTER_ID,
    }),
  );

  if (runtimeAgent.symbol === undefined) {
    return;
  }

  const analysis = await analyzeOpenAiBoundReference(session, runtimeAgent, diagnostics, agent.id);

  if (analysis === null) {
    return;
  }

  const runtimeExport = getOpenAiRuntimeExport(analysis, runtimeAgent.symbol);

  if (runtimeExport.kind === 'absent') {
    addOpenAiDiagnostic(
      diagnostics,
      'OPENAI_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
      runtimeAgent.path,
      agent.id,
    );
    return;
  }

  if (runtimeExport.kind === 'present-unsupported' || runtimeExport.body === undefined) {
    return;
  }

  const responses = analyzeOpenAiResponses(analysis, runtimeExport.body, session.signal);

  if (responses.closedRequests.length === 0) {
    return;
  }

  evidence.push(
    createOpenAiEvidence({
      agentId: agent.id,
      capabilityId: null,
      capabilityKind: null,
      details: { api: 'responses' },
      kind: 'runtime-pattern',
      references: [{ path: runtimeAgent.path, symbol: runtimeAgent.symbol }],
      runtimeName: OPENAI_RESPONSES_RUNTIME_NAME,
      source: OPENAI_ADAPTER_ID,
    }),
  );

  await inspectOpenAiRelationships(session, agent, analysis, responses, evidence, diagnostics);
};

/**
 * Inspects all scoped OpenAI agents through one operation-local deterministic session.
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
export const inspectOpenAi = async (
  context: IRuntimeAdapterContext,
): Promise<IRuntimeAdapterResult> => {
  context.signal?.throwIfAborted();
  const session = createOpenAiInspectionSession(context);
  const evidence: IRuntimeAdapterEvidence[] = [];
  const diagnostics: IAdapterDiagnostic[] = [];
  const agents = [...context.agents].sort((left, right) => compareOpenAiStrings(left.id, right.id));

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
