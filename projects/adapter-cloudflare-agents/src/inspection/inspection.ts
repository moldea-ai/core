import { isSupportedTypeScriptSourcePath } from '@moldea.ai/adapter-static-analysis';
import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type {
  IAdapterDiagnostic,
  IRuntimeAdapterContext,
  IRuntimeAdapterResult,
} from '@moldea.ai/core/adapter';

import { CLOUDFLARE_AGENTS_ADAPTER_ID, CLOUDFLARE_AI_CHAT_TARGET_ID } from '../constants/index.js';
import type {
  ICloudflareAgentsInspectionSession,
  ICloudflareAgentsRelationship,
} from '../contracts/index.js';
import {
  getCloudflareAgentsAiChatRequests,
  getCloudflareAgentsClassDefinition,
  getCloudflareAgentsThinkChannelTools,
  getCloudflareAgentsThinkSessionInstructions,
  getCloudflareAgentsThinkSystemPrompt,
  getCloudflareAgentsThinkTools,
} from '../source-analysis/index.js';
import {
  addCloudflareAgentsDiagnostic,
  analyzeCloudflareAgentsBoundReference,
  compareCloudflareAgentsStrings,
  createCloudflareAgentsEvidence,
} from './common.js';
import { inspectCloudflareAgentsPackage } from './package-inspection.js';
import { inspectCloudflareAgentsRelationships } from './relationships.js';
import { createCloudflareAgentsInspectionSession } from './session.js';
import type { ICloudflareAgentsInspectedAgent } from './types.js';

const combineRelationships = (
  relationships: readonly ICloudflareAgentsRelationship[],
): ICloudflareAgentsRelationship => {
  const present = relationships.filter((relationship) => relationship.kind === 'present');

  if (
    relationships.some((relationship) => relationship.kind === 'unresolved') ||
    present.length > 1
  ) {
    return Object.freeze({ kind: 'unresolved' });
  }

  return Object.freeze(present[0] ?? { kind: 'absent' });
};

const inspectAgent = async (
  session: ICloudflareAgentsInspectionSession,
  agent: IIndexedAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<ICloudflareAgentsInspectedAgent | null> => {
  const runtimeAgent = agent.declaration.bindings?.runtimeAgent;

  if (runtimeAgent === undefined || !isSupportedTypeScriptSourcePath(runtimeAgent.path)) {
    return null;
  }

  evidence.push(
    createCloudflareAgentsEvidence({
      agentId: agent.id,
      capabilityId: null,
      capabilityKind: null,
      details: { language: 'typescript' },
      kind: 'language',
      references: [runtimeAgent],
      runtimeName: null,
      source: CLOUDFLARE_AGENTS_ADAPTER_ID,
    }),
  );

  if (runtimeAgent.symbol === undefined) {
    return null;
  }

  const analysis = await analyzeCloudflareAgentsBoundReference(
    session,
    runtimeAgent,
    diagnostics,
    agent.id,
  );

  if (analysis === null) {
    return null;
  }

  if (!analysis.exports.has(runtimeAgent.symbol)) {
    addCloudflareAgentsDiagnostic(
      diagnostics,
      'CLOUDFLARE_AGENTS_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
      runtimeAgent.path,
      agent.id,
    );
    return null;
  }

  const classResult = getCloudflareAgentsClassDefinition(analysis, runtimeAgent.symbol);

  if (classResult.kind === 'absent') {
    return null;
  }

  const targetId =
    classResult.kind === 'present-supported'
      ? classResult.definition.targetId
      : classResult.targetId;

  if (targetId === undefined) {
    return null;
  }

  const isTargetSupported = await inspectCloudflareAgentsPackage(
    session,
    runtimeAgent.path,
    targetId,
    evidence,
    diagnostics,
    agent.id,
  );

  if (!isTargetSupported) {
    return null;
  }

  evidence.push(
    createCloudflareAgentsEvidence({
      agentId: agent.id,
      capabilityId: null,
      capabilityKind: null,
      details: { targetId },
      kind: 'agent-definition',
      references: [runtimeAgent],
      runtimeName: runtimeAgent.symbol,
      source: CLOUDFLARE_AGENTS_ADAPTER_ID,
    }),
  );

  if (classResult.kind !== 'present-supported') {
    return null;
  }

  if (classResult.definition.targetId === CLOUDFLARE_AI_CHAT_TARGET_ID) {
    const requests = getCloudflareAgentsAiChatRequests(classResult.definition, analysis);

    if (requests.length === 0) {
      return Object.freeze({
        agent,
        analysis,
        definition: classResult.definition,
        instructions: Object.freeze({ kind: 'absent' }),
        output: Object.freeze({ kind: 'absent' }),
        requests,
        tools: Object.freeze([]),
      });
    }

    evidence.push(
      createCloudflareAgentsEvidence({
        agentId: agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: { calls: [...new Set(requests.map(({ call }) => call))].join(',') },
        kind: 'runtime-pattern',
        references: [runtimeAgent],
        runtimeName: runtimeAgent.symbol,
        source: CLOUDFLARE_AGENTS_ADAPTER_ID,
      }),
    );

    return Object.freeze({
      agent,
      analysis,
      definition: classResult.definition,
      instructions: combineRelationships(requests.map(({ instructions }) => instructions)),
      output: combineRelationships(requests.map(({ output }) => output)),
      requests,
      tools: Object.freeze(requests.map(({ tools }) => tools)),
    });
  }

  const thinkTools = combineRelationships([
    getCloudflareAgentsThinkTools(classResult.definition),
    getCloudflareAgentsThinkChannelTools(classResult.definition),
  ]);

  return Object.freeze({
    agent,
    analysis,
    definition: classResult.definition,
    instructions: combineRelationships([
      getCloudflareAgentsThinkSystemPrompt(classResult.definition),
      getCloudflareAgentsThinkSessionInstructions(classResult.definition),
    ]),
    output: Object.freeze({ kind: 'absent' }),
    requests: Object.freeze([]),
    tools: Object.freeze([thinkTools]),
  });
};

/**
 * Inspects all scoped Cloudflare Agents agents through one deterministic session.
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
export const inspectCloudflareAgents = async (
  context: IRuntimeAdapterContext,
): Promise<IRuntimeAdapterResult> => {
  context.signal?.throwIfAborted();
  const session = createCloudflareAgentsInspectionSession(context);
  const evidence: IRuntimeAdapterEvidence[] = [];
  const diagnostics: IAdapterDiagnostic[] = [];
  const agents = [...context.agents].sort((left, right) =>
    compareCloudflareAgentsStrings(left.id, right.id),
  );
  const inspectedAgents: ICloudflareAgentsInspectedAgent[] = [];

  for (const agent of agents) {
    context.signal?.throwIfAborted();
    const inspected = await inspectAgent(session, agent, evidence, diagnostics);

    if (inspected !== null) {
      inspectedAgents.push(inspected);
    }
  }

  context.signal?.throwIfAborted();
  await inspectCloudflareAgentsRelationships(session, inspectedAgents, evidence, diagnostics);

  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    evidence: Object.freeze(evidence),
  });
};
