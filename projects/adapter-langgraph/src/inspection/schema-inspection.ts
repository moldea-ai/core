import { getConstExport } from '@moldea.ai/adapter-static-analysis';
import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference } from '@moldea.ai/core/format';

import { LANGGRAPH_ADAPTER_ID, LANGGRAPH_STATE_GRAPH_TARGET_ID } from '../constants/index.js';
import type {
  ILangGraphInspectionSession,
  ILangGraphSchemaRelationship,
  ILangGraphSourceAnalysis,
} from '../contracts/index.js';
import {
  addLangGraphDiagnostic,
  analyzeLangGraphBoundReference,
  createLangGraphEvidence,
  locateLangGraphNode,
} from './common.js';

interface ILangGraphSchemaInspectionInput {
  readonly agent: IIndexedAgent;
  readonly graphAnalysis: ILangGraphSourceAnalysis;
  readonly relationship: ILangGraphSchemaRelationship;
  readonly role: 'input' | 'output';
}

/** Inspects one declared agent schema against one closed Graph API relationship. */
export const inspectLangGraphSchema = async (
  session: ILangGraphInspectionSession,
  input: ILangGraphSchemaInspectionInput,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const bindingName = input.role === 'input' ? 'inputSchema' : 'outputSchema';
  const reference = input.agent.declaration.bindings?.[bindingName];

  if (reference?.symbol === undefined) {
    return;
  }

  const boundReference = Object.freeze({ path: reference.path, symbol: reference.symbol });
  const schemaAnalysis = await analyzeLangGraphBoundReference(
    session,
    reference,
    diagnostics,
    input.agent.id,
  );

  if (schemaAnalysis === null) {
    return;
  }

  const schema = getConstExport(schemaAnalysis, reference.symbol);

  if (schema.kind === 'absent') {
    addLangGraphDiagnostic(
      diagnostics,
      input.role === 'input'
        ? 'LANGGRAPH_AGENT_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
        : 'LANGGRAPH_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
      reference.path,
      input.agent.id,
    );
    return;
  }

  if (schema.kind !== 'present-supported' || input.relationship.kind !== 'present') {
    return;
  }

  const isWired =
    input.relationship.source.path === boundReference.path &&
    input.relationship.source.symbol === boundReference.symbol;

  if (isWired) {
    evidence.push(
      createLangGraphEvidence({
        agentId: input.agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: {
          schemaRole: input.role === 'input' ? 'agent-input' : 'agent-output',
          schemaSource: input.relationship.schemaSource,
          targetId: LANGGRAPH_STATE_GRAPH_TARGET_ID,
        },
        kind: 'schema',
        references: [
          input.agent.declaration.bindings?.runtimeAgent as IRepositoryReference,
          boundReference,
        ],
        runtimeName: null,
        source: LANGGRAPH_ADAPTER_ID,
      }),
    );
    return;
  }

  addLangGraphDiagnostic(
    diagnostics,
    input.role === 'input'
      ? 'LANGGRAPH_AGENT_INPUT_SCHEMA_NOT_WIRED'
      : 'LANGGRAPH_AGENT_OUTPUT_SCHEMA_NOT_WIRED',
    input.graphAnalysis.path,
    input.agent.id,
    locateLangGraphNode(input.graphAnalysis, input.relationship.source.expression),
  );
};
