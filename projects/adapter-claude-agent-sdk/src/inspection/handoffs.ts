import ts from 'typescript';

import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic, IRuntimeAdapterContext } from '@moldea.ai/core/adapter';

import { CLAUDE_AGENT_SDK_ADAPTER_ID } from '../constants/index.js';
import type {
  IClaudeAgentSdkInspectionSession,
  IClaudeAgentSdkMapEntry,
  IClaudeAgentSdkResolvedAgentDefinition,
} from '../contracts/index.js';
import {
  applyClaudeAgentSdkAgentMutations,
  classifyClaudeAgentSdkAgentAvailability,
  collectClaudeAgentSdkAgentDefinitionReferences,
  collectClaudeAgentSdkRelationshipIdentifiers,
  getClaudeAgentSdkClosedMapEntries,
  resolveClaudeAgentSdkStaticString,
} from '../source-analysis/index.js';
import {
  addClaudeAgentSdkDiagnostic,
  createClaudeAgentSdkEvidence,
  isClaudeAgentSdkMachineString,
  locateClaudeAgentSdkNode,
} from './common.js';
import { resolveClaudeAgentSdkAgentDefinition } from './resolution.js';
import type { IClaudeAgentSdkInspectedQueryAgent } from './types.js';

const resolveMapEntryName = async (
  session: IClaudeAgentSdkInspectionSession,
  inspected: IClaudeAgentSdkInspectedQueryAgent,
  entry: IClaudeAgentSdkMapEntry,
): Promise<string | null> => {
  if (entry.name !== null) {
    return entry.name;
  }

  const keyExpression = entry.keyExpression;

  if (!ts.isExpression(keyExpression)) {
    return null;
  }

  const result = await resolveClaudeAgentSdkStaticString(
    session,
    inspected.analysis,
    keyExpression,
  );
  return result.kind === 'supported' ? result.value : null;
};

const getMappedAgents = (
  context: IRuntimeAdapterContext,
  target: IClaudeAgentSdkResolvedAgentDefinition,
) =>
  context.project.agents.filter(({ declaration }) => {
    const runtimeAgent = declaration.bindings?.runtimeAgent;
    return runtimeAgent?.path === target.path && runtimeAgent.symbol === target.symbol;
  });

const inspectRoutingDescription = async (
  session: IClaudeAgentSdkInspectionSession,
  sourceAgentId: string,
  target: IClaudeAgentSdkResolvedAgentDefinition,
  targetAgent: ReturnType<typeof getMappedAgents>[number],
  runtimeName: string,
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const canonicalDescription =
    targetAgent.handoffDescription?.value ?? targetAgent.description.value;
  const relationship = target.definition.description;
  const safeDetails = {
    targetAgentId: targetAgent.id,
    ...(isClaudeAgentSdkMachineString(runtimeName) ? { targetRuntimeName: runtimeName } : {}),
  };

  if (relationship.kind === 'unresolved') {
    return;
  }

  if (relationship.kind === 'absent') {
    addClaudeAgentSdkDiagnostic(
      diagnostics,
      'CLAUDE_AGENT_SDK_HANDOFF_ROUTING_DESCRIPTION_MISSING',
      target.path,
      sourceAgentId,
      locateClaudeAgentSdkNode(target.analysis, target.definition.declaration),
      undefined,
      safeDetails,
    );
    return;
  }

  const result = await resolveClaudeAgentSdkStaticString(
    session,
    target.analysis,
    relationship.expression,
  );

  if (result.kind !== 'supported') {
    return;
  }

  const code =
    result.value.length === 0
      ? 'CLAUDE_AGENT_SDK_HANDOFF_ROUTING_DESCRIPTION_MISSING'
      : result.value !== canonicalDescription
        ? 'CLAUDE_AGENT_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED'
        : null;

  if (code !== null) {
    addClaudeAgentSdkDiagnostic(
      diagnostics,
      code,
      target.path,
      sourceAgentId,
      locateClaudeAgentSdkNode(target.analysis, relationship.expression),
      undefined,
      safeDetails,
    );
  }
};

/** Inspects active query-configured programmatic subagent registrations and routing metadata. */
export const inspectClaudeAgentSdkHandoffs = async (
  context: IRuntimeAdapterContext,
  session: IClaudeAgentSdkInspectionSession,
  inspected: IClaudeAgentSdkInspectedQueryAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const collectionReferences = collectClaudeAgentSdkRelationshipIdentifiers(
    inspected.wrapper.contexts.flatMap((queryContext) => [
      queryContext.tools,
      queryContext.disallowedTools,
      queryContext.agents,
    ]),
  );

  for (const queryContext of inspected.wrapper.contexts) {
    session.signal?.throwIfAborted();
    const availability = await classifyClaudeAgentSdkAgentAvailability(
      inspected.analysis,
      queryContext.tools,
      queryContext.disallowedTools,
      queryContext.agentSelection,
      queryContext.toolAliases,
      collectionReferences,
      (analysis, expression) => resolveClaudeAgentSdkStaticString(session, analysis, expression),
    );

    if (availability !== 'available') {
      continue;
    }

    const entries = getClaudeAgentSdkClosedMapEntries(
      queryContext.agents,
      inspected.analysis,
      collectionReferences,
    );

    if (entries === null) {
      continue;
    }

    const resolvedNames = await Promise.all(
      entries.map((entry) => resolveMapEntryName(session, inspected, entry)),
    );
    const supportedNames = resolvedNames.filter((name): name is string => name !== null);

    if (
      supportedNames.length !== entries.length ||
      new Set(supportedNames).size !== supportedNames.length
    ) {
      continue;
    }

    for (const [entryIndex, entry] of entries.entries()) {
      session.signal?.throwIfAborted();
      const runtimeName = resolvedNames[entryIndex];

      if (runtimeName === undefined || runtimeName === null) {
        continue;
      }

      const unresolvedTarget = await resolveClaudeAgentSdkAgentDefinition(
        session,
        inspected.analysis,
        entry.value,
      );

      if (unresolvedTarget === null) {
        continue;
      }

      const target: IClaudeAgentSdkResolvedAgentDefinition = Object.freeze({
        ...unresolvedTarget,
        definition: applyClaudeAgentSdkAgentMutations(
          unresolvedTarget.analysis,
          unresolvedTarget.definition,
          collectClaudeAgentSdkAgentDefinitionReferences(unresolvedTarget.analysis),
        ),
      });
      const mappedAgents = getMappedAgents(context, target);
      const mappedAgent = mappedAgents.length === 1 ? mappedAgents[0] : undefined;
      const safeRuntimeName = isClaudeAgentSdkMachineString(runtimeName) ? runtimeName : null;
      const details = {
        delegationAvailabilitySource:
          queryContext.tools.kind === 'absent'
            ? 'default-built-in-tools'
            : 'explicit-built-in-tools',
        delegationTool: 'Agent',
        registrationKind: 'programmatic-subagent',
        registrationScope: 'query-session',
        ...(mappedAgent === undefined ? {} : { targetAgentId: mappedAgent.id }),
        ...(safeRuntimeName === null ? {} : { targetRuntimeName: safeRuntimeName }),
      };

      if (mappedAgents.length > 1) {
        addClaudeAgentSdkDiagnostic(
          diagnostics,
          'CLAUDE_AGENT_SDK_HANDOFF_TARGET_AMBIGUOUS',
          inspected.analysis.path,
          inspected.agent.id,
          locateClaudeAgentSdkNode(inspected.analysis, entry.value),
          undefined,
          safeRuntimeName === null ? {} : { targetRuntimeName: safeRuntimeName },
        );
      } else if (mappedAgent !== undefined) {
        await inspectRoutingDescription(
          session,
          inspected.agent.id,
          target,
          mappedAgent,
          runtimeName,
          diagnostics,
        );
      }

      evidence.push(
        createClaudeAgentSdkEvidence({
          agentId: inspected.agent.id,
          capabilityId: null,
          capabilityKind: null,
          details,
          kind: 'handoff-registration',
          references: [
            { path: inspected.analysis.path },
            { path: target.path, symbol: target.symbol },
          ],
          runtimeName: safeRuntimeName,
          source: CLAUDE_AGENT_SDK_ADAPTER_ID,
        }),
      );
    }
  }
};
