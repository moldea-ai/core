import ts from 'typescript';

import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';

import { EVE_ADAPTER_ID, EVE_TARGET_ID } from '../constants/index.js';
import type { IEveAgentDefinition, IEveInspectionSession } from '../contracts/index.js';
import { resolveEveAgentRoot } from '../repository-discovery/index.js';
import {
  getEveDefinition,
  getEvePropertyExpression,
  resolveEveStaticString,
} from '../source-analysis/index.js';
import {
  addEveDiagnostic,
  addEveSourceFailureDiagnostic,
  createEveEvidence,
  locateEveNode,
} from './common.js';
import { inspectEvePackage } from './package-inspection.js';
import { classifyEveBoundExpression } from './relationships.js';

const POSITIVE_AGENT_KEYS = new Set(['description', 'model', 'outputSchema']);

/** Inspects one exact manifest-bound Eve agent definition and its output schema. */
export const inspectEveAgent = async (
  session: IEveInspectionSession,
  agent: IIndexedAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<IEveAgentDefinition | null> => {
  const runtimeAgent = agent.declaration.bindings?.runtimeAgent;

  if (runtimeAgent === undefined || !runtimeAgent.path.endsWith('/agent.ts')) {
    return null;
  }

  const packageObservation = await inspectEvePackage(
    session,
    agent,
    runtimeAgent.path,
    evidence,
    diagnostics,
  );

  if (packageObservation === null) {
    return null;
  }

  const root = resolveEveAgentRoot(runtimeAgent.path, packageObservation);

  if (root === null) {
    return null;
  }

  const rootIndex = await session.indexAgentRoot(root.agentRoot);

  if (rootIndex.isAgentSlotCollided) {
    return null;
  }

  const result = await session.analyzeSource(runtimeAgent.path);

  if (addEveSourceFailureDiagnostic(diagnostics, result, runtimeAgent.path, agent.id)) {
    return null;
  }

  if (result.kind !== 'valid') {
    return null;
  }

  evidence.push(
    createEveEvidence({
      agentId: agent.id,
      capabilityId: null,
      capabilityKind: null,
      details: { language: 'typescript' },
      kind: 'language',
      references: [runtimeAgent],
      runtimeName: null,
      source: EVE_ADAPTER_ID,
    }),
  );

  if (runtimeAgent.symbol !== undefined && runtimeAgent.symbol !== 'default') {
    return null;
  }

  const definition = getEveDefinition(result.analysis, 'agent');

  if (definition.kind === 'absent') {
    if (runtimeAgent.symbol === 'default') {
      addEveDiagnostic(
        diagnostics,
        'EVE_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
        runtimeAgent.path,
        agent.id,
      );
    }

    return null;
  }

  if (
    definition.kind !== 'present-supported' ||
    [...definition.properties].some(
      ([key, property]) => !POSITIVE_AGENT_KEYS.has(key) || !ts.isPropertyAssignment(property),
    )
  ) {
    return null;
  }

  const model = getEvePropertyExpression(definition.properties, 'model');

  if (
    model === null ||
    (await resolveEveStaticString(session, result.analysis, model)).kind !== 'supported'
  ) {
    return null;
  }

  evidence.push(
    createEveEvidence({
      agentId: agent.id,
      capabilityId: null,
      capabilityKind: null,
      details: {
        agentKind: root.agentKind,
        agentRoot: root.agentRoot,
        layout: root.layout,
        targetId: EVE_TARGET_ID,
      },
      kind: 'agent-definition',
      references: [runtimeAgent],
      runtimeName: root.runtimeName,
      source: EVE_ADAPTER_ID,
    }),
  );

  const outputSchema = agent.declaration.bindings?.outputSchema;

  if (outputSchema !== undefined && outputSchema.symbol !== undefined) {
    const schemaSource = await session.analyzeSource(outputSchema.path);

    if (!addEveSourceFailureDiagnostic(diagnostics, schemaSource, outputSchema.path, agent.id)) {
      const state = await classifyEveBoundExpression(
        session,
        result.analysis,
        getEvePropertyExpression(definition.properties, 'outputSchema'),
        outputSchema,
      );

      if (state === 'missing') {
        addEveDiagnostic(
          diagnostics,
          'EVE_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
          outputSchema.path,
          agent.id,
        );
      } else if (state === 'wired') {
        evidence.push(
          createEveEvidence({
            agentId: agent.id,
            capabilityId: null,
            capabilityKind: null,
            details: { schemaRole: 'agent-output' },
            kind: 'schema',
            references: [outputSchema],
            runtimeName: outputSchema.symbol,
            source: EVE_ADAPTER_ID,
          }),
        );
      } else if (state === 'different') {
        addEveDiagnostic(
          diagnostics,
          'EVE_AGENT_OUTPUT_SCHEMA_NOT_WIRED',
          runtimeAgent.path,
          agent.id,
        );
      }
    }
  }

  const descriptionProperty = definition.properties.get('description');
  const descriptionExpression = getEvePropertyExpression(definition.properties, 'description');
  let routingDescription: IEveAgentDefinition['routingDescription'];

  if (descriptionProperty === undefined) {
    routingDescription = Object.freeze({ kind: 'absent', range: null });
  } else if (descriptionExpression === null) {
    routingDescription = Object.freeze({
      kind: 'unsupported',
      range: locateEveNode(result.analysis, descriptionProperty),
    });
  } else {
    const staticDescription = await resolveEveStaticString(
      session,
      result.analysis,
      descriptionExpression,
    );
    const range = locateEveNode(result.analysis, descriptionProperty);
    routingDescription =
      staticDescription.kind === 'supported'
        ? Object.freeze({ kind: 'supported', range, value: staticDescription.value })
        : Object.freeze({ kind: 'unsupported', range });
  }

  return Object.freeze({
    agent,
    analysis: result.analysis,
    definition,
    packageObservation,
    root,
    rootIndex,
    routingDescription,
  });
};
