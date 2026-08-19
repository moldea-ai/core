import { isSupportedTypeScriptSourcePath } from '@moldea.ai/adapter-static-analysis';
import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type {
  IAdapterDiagnostic,
  IRuntimeAdapterContext,
  IRuntimeAdapterResult,
} from '@moldea.ai/core/adapter';

import { OPENAI_AGENTS_SDK_ADAPTER_ID } from '../constants/index.js';
import type { IOpenAiAgentsSdkInspectionSession } from '../contracts/index.js';
import {
  applyOpenAiAgentsSdkAgentMutations,
  collectOpenAiAgentsSdkHandoffTargetReferences,
  getOpenAiAgentsSdkAgentDefinition,
  resolveOpenAiAgentsSdkStaticString,
} from '../source-analysis/index.js';
import {
  addOpenAiAgentsSdkDiagnostic,
  analyzeOpenAiAgentsSdkBoundReference,
  compareOpenAiAgentsSdkStrings,
  createOpenAiAgentsSdkEvidence,
  isOpenAiAgentsSdkMachineString,
} from './common.js';
import { inspectOpenAiAgentsSdkHandoffs } from './handoffs.js';
import { inspectOpenAiAgentsSdkPackage } from './package-inspection.js';
import { inspectOpenAiAgentsSdkRelationships } from './relationships.js';
import { createOpenAiAgentsSdkInspectionSession } from './session.js';

const inspectAgent = async (
  context: IRuntimeAdapterContext,
  session: IOpenAiAgentsSdkInspectionSession,
  agent: IIndexedAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const runtimeAgent = agent.declaration.bindings?.runtimeAgent;

  if (runtimeAgent === undefined) {
    return;
  }

  await inspectOpenAiAgentsSdkPackage(session, runtimeAgent.path, evidence, diagnostics, agent.id);

  if (!isSupportedTypeScriptSourcePath(runtimeAgent.path)) {
    return;
  }

  evidence.push(
    createOpenAiAgentsSdkEvidence({
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
      source: OPENAI_AGENTS_SDK_ADAPTER_ID,
    }),
  );

  if (runtimeAgent.symbol === undefined) {
    return;
  }

  const analysis = await analyzeOpenAiAgentsSdkBoundReference(
    session,
    runtimeAgent,
    diagnostics,
    agent.id,
  );

  if (analysis === null) {
    return;
  }

  const definitionResult = getOpenAiAgentsSdkAgentDefinition(analysis, runtimeAgent.symbol);

  if (definitionResult.kind === 'absent') {
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      'OPENAI_AGENTS_SDK_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
      runtimeAgent.path,
      agent.id,
    );
    return;
  }

  if (definitionResult.kind !== 'present-supported' || definitionResult.definition === undefined) {
    return;
  }

  const definition = applyOpenAiAgentsSdkAgentMutations(
    analysis,
    definitionResult.definition,
    collectOpenAiAgentsSdkHandoffTargetReferences(analysis),
  );
  const runtimeName =
    definition.name.kind === 'present'
      ? await resolveOpenAiAgentsSdkStaticString(session, analysis, definition.name.expression)
      : { kind: 'unsupported' as const };

  evidence.push(
    createOpenAiAgentsSdkEvidence({
      agentId: agent.id,
      capabilityId: null,
      capabilityKind: null,
      details: { definitionKind: 'agent' },
      kind: 'agent-definition',
      references: [{ path: runtimeAgent.path, symbol: runtimeAgent.symbol }],
      runtimeName:
        runtimeName.kind === 'supported' && isOpenAiAgentsSdkMachineString(runtimeName.value)
          ? runtimeName.value
          : runtimeAgent.symbol,
      source: OPENAI_AGENTS_SDK_ADAPTER_ID,
    }),
  );

  await inspectOpenAiAgentsSdkRelationships(
    session,
    agent,
    analysis,
    definition,
    evidence,
    diagnostics,
  );
  await inspectOpenAiAgentsSdkHandoffs(
    context,
    session,
    agent,
    analysis,
    definition,
    evidence,
    diagnostics,
  );
};

/**
 * Inspects all scoped OpenAI Agents SDK agents through one deterministic session.
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
export const inspectOpenAiAgentsSdk = async (
  context: IRuntimeAdapterContext,
): Promise<IRuntimeAdapterResult> => {
  context.signal?.throwIfAborted();
  const session = createOpenAiAgentsSdkInspectionSession(context);
  const evidence: IRuntimeAdapterEvidence[] = [];
  const diagnostics: IAdapterDiagnostic[] = [];
  const agents = [...context.agents].sort((left, right) =>
    compareOpenAiAgentsSdkStrings(left.id, right.id),
  );

  for (const agent of agents) {
    context.signal?.throwIfAborted();
    await inspectAgent(context, session, agent, evidence, diagnostics);
  }

  context.signal?.throwIfAborted();
  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    evidence: Object.freeze(evidence),
  });
};
