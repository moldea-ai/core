import { getConstExport } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference } from '@moldea.ai/core/format';

import { LANGCHAIN_ADAPTER_ID, LANGCHAIN_TARGET_ID } from '../constants/index.js';
import type { ILangChainInspectedAgent, ILangChainInspectionSession } from '../contracts/index.js';
import {
  classifyLangChainResponseFormat,
  isLangChainSingleSchemaInitializer,
} from '../source-analysis/index.js';
import {
  addLangChainDiagnostic,
  analyzeLangChainBoundReference,
  createLangChainEvidence,
  locateLangChainNode,
} from './common.js';

/** Inspects one declared agent output schema against supported response formats. */
export const inspectLangChainOutputSchema = async (
  session: ILangChainInspectionSession,
  inspected: ILangChainInspectedAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const reference = inspected.agent.declaration.bindings?.outputSchema;

  if (reference?.symbol === undefined) {
    return;
  }

  const boundReference = Object.freeze({ path: reference.path, symbol: reference.symbol });

  const schemaAnalysis = await analyzeLangChainBoundReference(
    session,
    reference,
    diagnostics,
    inspected.agent.id,
  );

  if (schemaAnalysis === null) {
    return;
  }

  const schema = getConstExport(schemaAnalysis, reference.symbol);

  if (schema.kind === 'absent') {
    addLangChainDiagnostic(
      diagnostics,
      'LANGCHAIN_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
      reference.path,
      inspected.agent.id,
    );
    return;
  }

  if (
    schema.kind !== 'present-supported' ||
    schema.expression === undefined ||
    !isLangChainSingleSchemaInitializer(schema.expression, schemaAnalysis) ||
    inspected.middlewareState !== 'inactive'
  ) {
    return;
  }

  const relationship = inspected.definition.responseFormat;

  if (relationship.kind === 'unresolved') {
    return;
  }

  const result =
    relationship.kind === 'absent'
      ? ({ expression: null, kind: 'different' } as const)
      : classifyLangChainResponseFormat(
          relationship.expression,
          inspected.analysis,
          boundReference,
        );

  if (result.kind === 'wired') {
    evidence.push(
      createLangChainEvidence({
        agentId: inspected.agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: {
          property: 'responseFormat',
          schemaRole: 'agent-output',
          schemaStrategy: result.strategy ?? 'direct',
          targetId: LANGCHAIN_TARGET_ID,
        },
        kind: 'schema',
        references: [
          inspected.agent.declaration.bindings?.runtimeAgent as IRepositoryReference,
          boundReference,
        ],
        runtimeName: boundReference.symbol,
        source: LANGCHAIN_ADAPTER_ID,
      }),
    );
  } else if (result.kind === 'different') {
    addLangChainDiagnostic(
      diagnostics,
      'LANGCHAIN_AGENT_OUTPUT_SCHEMA_NOT_WIRED',
      inspected.analysis.path,
      inspected.agent.id,
      result.expression === null
        ? locateLangChainNode(inspected.analysis, inspected.definition.object)
        : locateLangChainNode(inspected.analysis, result.expression),
    );
  }
};
