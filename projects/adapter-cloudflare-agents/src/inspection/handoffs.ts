import ts from 'typescript';

import { resolveBindingReferences, unwrapExpression } from '@moldea.ai/adapter-static-analysis';
import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';

import { CLOUDFLARE_AGENTS_ADAPTER_ID } from '../constants/index.js';
import type {
  ICloudflareAgentsInspectionSession,
  ICloudflareAgentsSourceAnalysis,
} from '../contracts/index.js';
import { addCloudflareAgentsDiagnostic, createCloudflareAgentsEvidence } from './common.js';
import { resolveCloudflareAgentsToolDefinition } from './resolution.js';
import type { ICloudflareAgentsResolvedToolMap } from './resolution.js';

const findTargetAgents = (
  target: ts.Expression,
  analysis: ICloudflareAgentsSourceAnalysis,
  agents: readonly IIndexedAgent[],
): readonly IIndexedAgent[] => {
  const candidate = unwrapExpression(target);

  if (!ts.isIdentifier(candidate)) {
    return Object.freeze([]);
  }

  const references = resolveBindingReferences(candidate, analysis);

  return Object.freeze(
    agents.filter((agent) => {
      const runtimeAgent = agent.declaration.bindings?.runtimeAgent;
      return (
        runtimeAgent?.symbol !== undefined &&
        references.some(
          (reference) =>
            reference.path === runtimeAgent.path && reference.symbol === runtimeAgent.symbol,
        )
      );
    }),
  );
};

/** Inspects active Cloudflare `agentTool` helpers as runtime handoff registrations. */
export const inspectCloudflareAgentsHandoffs = async (
  session: ICloudflareAgentsInspectionSession,
  sourceAgent: IIndexedAgent,
  agents: readonly IIndexedAgent[],
  resolvedMaps: readonly ICloudflareAgentsResolvedToolMap[],
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  for (const resolvedMap of resolvedMaps) {
    for (const entry of resolvedMap.map.entries) {
      const resolved = await resolveCloudflareAgentsToolDefinition(
        session,
        resolvedMap.analysis,
        entry.expression,
      );

      if (resolved?.definition.kind !== 'agent-tool') {
        continue;
      }

      const targets = findTargetAgents(resolved.definition.tool.target, resolved.analysis, agents);

      if (targets.length > 1) {
        addCloudflareAgentsDiagnostic(
          diagnostics,
          'CLOUDFLARE_AGENTS_HANDOFF_TARGET_AMBIGUOUS',
          resolved.reference.path,
          sourceAgent.id,
          null,
          undefined,
          { toolName: entry.name },
        );
        continue;
      }

      const target = targets[0];

      if (target === undefined) {
        continue;
      }

      const description = resolved.definition.tool.description;
      const effectiveDescription = target.handoffDescription?.value ?? target.description.value;

      if (description === null || description.length === 0) {
        addCloudflareAgentsDiagnostic(
          diagnostics,
          'CLOUDFLARE_AGENTS_HANDOFF_ROUTING_DESCRIPTION_MISSING',
          resolved.reference.path,
          sourceAgent.id,
          null,
          undefined,
          { targetAgentId: target.id, toolName: entry.name },
        );
        continue;
      }

      if (description !== effectiveDescription) {
        addCloudflareAgentsDiagnostic(
          diagnostics,
          'CLOUDFLARE_AGENTS_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED',
          resolved.reference.path,
          sourceAgent.id,
          null,
          undefined,
          { targetAgentId: target.id, toolName: entry.name },
        );
        continue;
      }

      const targetReference = target.declaration.bindings?.runtimeAgent;

      if (targetReference === undefined) {
        continue;
      }

      evidence.push(
        createCloudflareAgentsEvidence({
          agentId: sourceAgent.id,
          capabilityId: null,
          capabilityKind: null,
          details: { targetAgentId: target.id, toolName: entry.name },
          kind: 'handoff-registration',
          references: [resolved.reference, targetReference],
          runtimeName: entry.name,
          source: CLOUDFLARE_AGENTS_ADAPTER_ID,
        }),
      );
    }
  }
};
