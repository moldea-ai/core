import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';

import {
  EVE_ADAPTER_ID,
  EVE_ALWAYS_RESERVED_TOOL_NAME,
  EVE_FRAMEWORK_TOOL_NAMES,
} from '../constants/index.js';
import type { IEveAgentDefinition } from '../contracts/index.js';
import { addEveDiagnostic, compareEveStrings, createEveEvidence } from './common.js';

/** Inspects exact immediate directory-backed local-subagent registrations. */
export const inspectEveSubagents = (
  definitions: readonly IEveAgentDefinition[],
  preparedToolNames: ReadonlyMap<string, ReadonlySet<string>>,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): void => {
  for (const target of definitions) {
    if (
      target.root.agentKind !== 'local-subagent' ||
      target.root.parentRoot === null ||
      target.root.runtimeName === null
    ) {
      continue;
    }

    const parents = definitions
      .filter(({ root }) => root.agentRoot === target.root.parentRoot)
      .sort((left, right) => compareEveStrings(left.agent.id, right.agent.id));

    if (parents.length > 1) {
      addEveDiagnostic(
        diagnostics,
        'EVE_SUBAGENT_PARENT_AMBIGUOUS',
        target.agent.declaration.bindings?.runtimeAgent?.path ?? null,
        target.agent.id,
        null,
        undefined,
        undefined,
        { candidateAgentIds: parents.map(({ agent }) => agent.id).join(',') },
      );
      continue;
    }

    const parent = parents[0];

    if (parent === undefined) {
      continue;
    }

    const candidates = parent.rootIndex.subagentCandidates.filter(
      ({ runtimeName }) => runtimeName === target.root.runtimeName,
    );
    const candidate = candidates.find(
      ({ agentPath, isDirectoryBacked }) =>
        isDirectoryBacked && agentPath === target.agent.declaration.bindings?.runtimeAgent?.path,
    );

    if (candidates.length !== 1 || candidate === undefined || candidate.isExtensionReserved) {
      continue;
    }

    const parentTools = preparedToolNames.get(parent.agent.id) ?? new Set<string>();
    const hasToolCollision =
      parentTools.has(target.root.runtimeName) ||
      EVE_FRAMEWORK_TOOL_NAMES.includes(
        target.root.runtimeName as (typeof EVE_FRAMEWORK_TOOL_NAMES)[number],
      ) ||
      target.root.runtimeName === EVE_ALWAYS_RESERVED_TOOL_NAME;

    if (hasToolCollision) {
      addEveDiagnostic(
        diagnostics,
        'EVE_TOOL_SUBAGENT_NAME_COLLISION',
        target.agent.declaration.bindings?.runtimeAgent?.path ?? null,
        target.agent.id,
        null,
        undefined,
        undefined,
        { collisionKind: 'runtime-tool' },
      );
      continue;
    }

    if (
      target.routingDescription.kind === 'absent' ||
      (target.routingDescription.kind === 'supported' && target.routingDescription.value === '')
    ) {
      addEveDiagnostic(
        diagnostics,
        'EVE_ROUTING_DESCRIPTION_MISSING',
        target.agent.declaration.bindings?.runtimeAgent?.path ?? null,
        target.agent.id,
        target.routingDescription.range,
      );
      continue;
    }

    if (target.routingDescription.kind !== 'supported') {
      continue;
    }

    const routingDescriptionSource =
      target.agent.handoffDescription === null ? 'agent-description' : 'handoff-description';
    const effectiveDescription =
      target.agent.handoffDescription?.value ?? target.agent.description.value;
    const isWired = target.routingDescription.value === effectiveDescription;

    if (!isWired) {
      addEveDiagnostic(
        diagnostics,
        'EVE_ROUTING_DESCRIPTION_NOT_WIRED',
        target.agent.declaration.bindings?.runtimeAgent?.path ?? null,
        target.agent.id,
        target.routingDescription.range,
      );
    }

    const parentReference = parent.agent.declaration.bindings?.runtimeAgent;
    const targetReference = target.agent.declaration.bindings?.runtimeAgent;

    if (parentReference === undefined || targetReference === undefined) {
      continue;
    }

    evidence.push(
      createEveEvidence({
        agentId: parent.agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: {
          registrationKind: 'local-subagent-package',
          routingDescriptionSource,
          routingDescriptionWired: isWired,
          targetAgentId: target.agent.id,
          targetRuntimeName: target.root.runtimeName,
        },
        kind: 'handoff-registration',
        references: [parentReference, targetReference],
        runtimeName: target.root.runtimeName,
        source: EVE_ADAPTER_ID,
      }),
    );
  }
};
