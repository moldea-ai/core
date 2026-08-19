import ts from 'typescript';

import {
  getCallableExportState,
  getClosedObjectProperties,
  getConstExport,
  getStaticString,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference } from '@moldea.ai/core/format';

import { CLAUDE_AGENT_SDK_ADAPTER_ID } from '../constants/index.js';
import type {
  IClaudeAgentSdkInspectedDefinitionAgent,
  IClaudeAgentSdkInspectedQueryAgent,
} from './types.js';
import type {
  IClaudeAgentSdkInspectionSession,
  IClaudeAgentSdkRelationship,
} from '../contracts/index.js';
import {
  classifyClaudeAgentSdkDirectBinding,
  classifyClaudeAgentSdkInstructionLoader,
} from '../source-analysis/index.js';
import {
  addClaudeAgentSdkDiagnostic,
  analyzeClaudeAgentSdkBoundReference,
  createClaudeAgentSdkEvidence,
  locateClaudeAgentSdkNode,
} from './common.js';

const inspectCallableSymbol = async (
  session: IClaudeAgentSdkInspectionSession,
  reference: IRepositoryReference,
  agentId: string,
  diagnostics: IAdapterDiagnostic[],
): Promise<boolean | null> => {
  if (reference.symbol === undefined) {
    return null;
  }

  const analysis = await analyzeClaudeAgentSdkBoundReference(
    session,
    reference,
    diagnostics,
    agentId,
  );

  if (analysis === null) {
    return null;
  }

  const state = getCallableExportState(analysis, reference.symbol);

  if (state.kind === 'absent') {
    addClaudeAgentSdkDiagnostic(
      diagnostics,
      'CLAUDE_AGENT_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
      reference.path,
      agentId,
    );
    return false;
  }

  return state.kind === 'present-supported' ? true : null;
};

const getInstructionRole = (relationship: IClaudeAgentSdkRelationship): string => {
  if (relationship.kind !== 'present') {
    return 'query-system-prompt';
  }

  const candidate = unwrapExpression(relationship.expression);

  if (!ts.isObjectLiteralExpression(candidate)) {
    return 'query-system-prompt';
  }

  const properties = getClosedObjectProperties(candidate);
  return properties !== null &&
    getStaticString(properties.get('type') ?? candidate) === 'preset' &&
    getStaticString(properties.get('preset') ?? candidate) === 'claude_code'
    ? 'query-preset-append'
    : 'query-system-prompt';
};

const inspectQueryInstructionLoader = async (
  session: IClaudeAgentSdkInspectionSession,
  inspected: IClaudeAgentSdkInspectedQueryAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const reference = inspected.agent.declaration.bindings?.instructionLoader;

  if (reference?.symbol === undefined) {
    return;
  }

  if ((await inspectCallableSymbol(session, reference, inspected.agent.id, diagnostics)) !== true) {
    return;
  }

  const results = inspected.wrapper.contexts.map((context) =>
    context.agentSelection.kind === 'absent'
      ? classifyClaudeAgentSdkInstructionLoader(
          context.systemPrompt,
          inspected.analysis,
          reference,
          true,
        )
      : null,
  );
  const wiredIndex = results.findIndex((result) => result === true);

  if (wiredIndex >= 0) {
    const context = inspected.wrapper.contexts[wiredIndex];

    if (context !== undefined) {
      evidence.push(
        createClaudeAgentSdkEvidence({
          agentId: inspected.agent.id,
          capabilityId: null,
          capabilityKind: null,
          details: { role: getInstructionRole(context.systemPrompt) },
          kind: 'instruction-loader',
          references: [
            { path: inspected.analysis.path },
            { path: reference.path, symbol: reference.symbol },
          ],
          runtimeName: reference.symbol,
          source: CLAUDE_AGENT_SDK_ADAPTER_ID,
        }),
      );
    }
  } else if (
    !inspected.wrapper.hasAmbiguousCandidate &&
    results.every((result) => result === false)
  ) {
    addClaudeAgentSdkDiagnostic(
      diagnostics,
      'CLAUDE_AGENT_SDK_INSTRUCTION_LOADER_NOT_WIRED',
      inspected.analysis.path,
      inspected.agent.id,
    );
  }
};

const inspectDefinitionInstructionLoader = async (
  session: IClaudeAgentSdkInspectionSession,
  inspected: IClaudeAgentSdkInspectedDefinitionAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const reference = inspected.agent.declaration.bindings?.instructionLoader;

  if (reference?.symbol === undefined) {
    return;
  }

  if ((await inspectCallableSymbol(session, reference, inspected.agent.id, diagnostics)) !== true) {
    return;
  }

  const relationship = classifyClaudeAgentSdkInstructionLoader(
    inspected.definition.prompt,
    inspected.analysis,
    reference,
    false,
  );

  if (relationship === true) {
    evidence.push(
      createClaudeAgentSdkEvidence({
        agentId: inspected.agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: { role: 'subagent-prompt' },
        kind: 'instruction-loader',
        references: [
          { path: inspected.analysis.path },
          { path: reference.path, symbol: reference.symbol },
        ],
        runtimeName: reference.symbol,
        source: CLAUDE_AGENT_SDK_ADAPTER_ID,
      }),
    );
  } else if (relationship === false) {
    addClaudeAgentSdkDiagnostic(
      diagnostics,
      'CLAUDE_AGENT_SDK_INSTRUCTION_LOADER_NOT_WIRED',
      inspected.analysis.path,
      inspected.agent.id,
      inspected.definition.prompt.kind === 'present'
        ? locateClaudeAgentSdkNode(inspected.analysis, inspected.definition.prompt.expression)
        : null,
    );
  }
};

const getOutputSchemaRelationship = (
  relationship: IClaudeAgentSdkRelationship,
): IClaudeAgentSdkRelationship => {
  if (relationship.kind !== 'present') {
    return relationship;
  }

  const candidate = unwrapExpression(relationship.expression);

  if (!ts.isObjectLiteralExpression(candidate)) {
    return { kind: 'unresolved' };
  }

  const properties = getClosedObjectProperties(candidate);

  if (
    properties === null ||
    properties.size !== 2 ||
    getStaticString(properties.get('type') ?? candidate) !== 'json_schema'
  ) {
    return properties !== null
      ? { expression: candidate, kind: 'present' }
      : { kind: 'unresolved' };
  }

  const schema = properties.get('schema');
  return schema === undefined
    ? { expression: candidate, kind: 'present' }
    : { expression: schema, kind: 'present' };
};

const inspectQueryOutputSchema = async (
  session: IClaudeAgentSdkInspectionSession,
  inspected: IClaudeAgentSdkInspectedQueryAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const reference = inspected.agent.declaration.bindings?.outputSchema;

  if (reference?.symbol === undefined) {
    return;
  }

  const schemaAnalysis = await analyzeClaudeAgentSdkBoundReference(
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
    addClaudeAgentSdkDiagnostic(
      diagnostics,
      'CLAUDE_AGENT_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
      reference.path,
      inspected.agent.id,
    );
    return;
  }

  if (schema.kind !== 'present-supported') {
    return;
  }

  const results = inspected.wrapper.contexts.map((context) =>
    classifyClaudeAgentSdkDirectBinding(
      getOutputSchemaRelationship(context.outputFormat),
      inspected.analysis,
      reference,
    ),
  );

  if (results.includes(true)) {
    evidence.push(
      createClaudeAgentSdkEvidence({
        agentId: inspected.agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: { role: 'agent-output', schemaKind: 'json-schema' },
        kind: 'schema',
        references: [
          { path: inspected.analysis.path },
          { path: reference.path, symbol: reference.symbol },
        ],
        runtimeName: reference.symbol,
        source: CLAUDE_AGENT_SDK_ADAPTER_ID,
      }),
    );
  } else if (
    !inspected.wrapper.hasAmbiguousCandidate &&
    results.every((result) => result === false)
  ) {
    addClaudeAgentSdkDiagnostic(
      diagnostics,
      'CLAUDE_AGENT_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED',
      inspected.analysis.path,
      inspected.agent.id,
    );
  }
};

/** Inspects canonical instruction and query-output-schema relationships. */
export const inspectClaudeAgentSdkRelationships = async (
  session: IClaudeAgentSdkInspectionSession,
  inspected: IClaudeAgentSdkInspectedDefinitionAgent | IClaudeAgentSdkInspectedQueryAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  if (inspected.kind === 'query-wrapper') {
    await inspectQueryInstructionLoader(session, inspected, evidence, diagnostics);
    await inspectQueryOutputSchema(session, inspected, evidence, diagnostics);
  } else {
    await inspectDefinitionInstructionLoader(session, inspected, evidence, diagnostics);
  }
};
