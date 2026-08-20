import type ts from 'typescript';

import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference } from '@moldea.ai/core/format';

import { CLOUDFLARE_AGENTS_ADAPTER_ID } from '../constants/index.js';
import type {
  ICloudflareAgentsAdapterDiagnosticCode,
  ICloudflareAgentsInspectionSession,
  ICloudflareAgentsRelationship,
  ICloudflareAgentsSourceAnalysis,
} from '../contracts/index.js';
import {
  classifyCloudflareAgentsDirectBinding,
  classifyCloudflareAgentsInstructionLoader,
  getCloudflareAgentsOutputSchema,
} from '../source-analysis/index.js';
import {
  addCloudflareAgentsDiagnostic,
  createCloudflareAgentsEvidence,
  hasCloudflareAgentsSymbol,
} from './common.js';
import { inspectCloudflareAgentsHandoffs } from './handoffs.js';
import {
  resolveCloudflareAgentsToolDefinition,
  resolveCloudflareAgentsToolMap,
  type ICloudflareAgentsResolvedToolMap,
} from './resolution.js';
import type { ICloudflareAgentsInspectedAgent } from './types.js';

const inspectBinding = async (
  session: ICloudflareAgentsInspectionSession,
  agent: IIndexedAgent,
  relationship: ICloudflareAgentsRelationship,
  analysis: ICloudflareAgentsSourceAnalysis,
  reference: IRepositoryReference,
  symbolMissingCode: ICloudflareAgentsAdapterDiagnosticCode,
  notWiredCode: ICloudflareAgentsAdapterDiagnosticCode,
  evidenceKind: 'instruction-loader' | 'schema',
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
  schemaRole?: 'agent-output',
): Promise<void> => {
  const boundAnalysis = await hasCloudflareAgentsSymbol(
    session,
    reference,
    diagnostics,
    agent.id,
    symbolMissingCode,
  );

  if (boundAnalysis === null) {
    return;
  }

  const matches =
    evidenceKind === 'instruction-loader'
      ? classifyCloudflareAgentsInstructionLoader(relationship, analysis, reference)
      : classifyCloudflareAgentsDirectBinding(relationship, analysis, reference);

  if (matches !== true) {
    addCloudflareAgentsDiagnostic(diagnostics, notWiredCode, reference.path, agent.id);
    return;
  }

  evidence.push(
    createCloudflareAgentsEvidence({
      agentId: agent.id,
      capabilityId: null,
      capabilityKind: null,
      details: schemaRole === undefined ? {} : { schemaRole },
      kind: evidenceKind,
      references: [reference],
      runtimeName: reference.symbol ?? null,
      source: CLOUDFLARE_AGENTS_ADAPTER_ID,
    }),
  );
};

const inspectToolReference = async (
  session: ICloudflareAgentsInspectionSession,
  agent: IIndexedAgent,
  capabilityId: string,
  relationship: ICloudflareAgentsRelationship,
  relationshipAnalysis: ICloudflareAgentsSourceAnalysis,
  reference: IRepositoryReference | undefined,
  symbolMissingCode: ICloudflareAgentsAdapterDiagnosticCode,
  notWiredCode: ICloudflareAgentsAdapterDiagnosticCode,
  diagnostics: IAdapterDiagnostic[],
): Promise<boolean> => {
  if (reference === undefined) {
    return true;
  }

  const analysis = await hasCloudflareAgentsSymbol(
    session,
    reference,
    diagnostics,
    agent.id,
    symbolMissingCode,
    capabilityId,
  );

  if (analysis === null) {
    return false;
  }

  if (
    classifyCloudflareAgentsDirectBinding(relationship, relationshipAnalysis, reference) !== true
  ) {
    addCloudflareAgentsDiagnostic(
      diagnostics,
      notWiredCode,
      reference.path,
      agent.id,
      null,
      capabilityId,
    );
    return false;
  }

  return true;
};

const inspectTools = async (
  session: ICloudflareAgentsInspectionSession,
  inspected: ICloudflareAgentsInspectedAgent,
  agents: readonly IIndexedAgent[],
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  if (inspected.tools.some((relationship) => relationship.kind === 'unresolved')) {
    return;
  }

  const presentRelationships = inspected.tools.filter(
    (relationship) => relationship.kind === 'present',
  );
  const resolvedMaps = (
    await Promise.all(
      presentRelationships.map((relationship) =>
        resolveCloudflareAgentsToolMap(session, inspected.analysis, relationship),
      ),
    )
  ).filter(
    (map): map is ICloudflareAgentsResolvedToolMap => map !== null && map.map.kind === 'closed',
  );

  if (resolvedMaps.length !== presentRelationships.length) {
    return;
  }

  await inspectCloudflareAgentsHandoffs(
    session,
    inspected.agent,
    agents,
    resolvedMaps,
    evidence,
    diagnostics,
  );

  for (const [capabilityId, tool] of Object.entries(inspected.agent.declaration.tools ?? {})) {
    if (tool.registration === undefined) {
      continue;
    }

    await hasCloudflareAgentsSymbol(
      session,
      tool.registration,
      diagnostics,
      inspected.agent.id,
      'CLOUDFLARE_AGENTS_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
      capabilityId,
    );
    let matchedEntry:
      | {
          readonly analysis: ICloudflareAgentsSourceAnalysis;
          readonly expression: ts.Expression;
          readonly name: string;
        }
      | undefined;

    for (const resolvedMap of resolvedMaps) {
      for (const entry of resolvedMap.map.entries) {
        if (
          classifyCloudflareAgentsDirectBinding(
            { expression: entry.expression, kind: 'present' },
            resolvedMap.analysis,
            tool.registration,
          ) === true
        ) {
          matchedEntry = { analysis: resolvedMap.analysis, ...entry };
          break;
        }
      }
    }

    if (matchedEntry === undefined) {
      addCloudflareAgentsDiagnostic(
        diagnostics,
        'CLOUDFLARE_AGENTS_TOOL_REGISTRATION_NOT_WIRED',
        tool.registration.path,
        inspected.agent.id,
        null,
        capabilityId,
      );
      continue;
    }

    if (matchedEntry.name !== tool.name) {
      addCloudflareAgentsDiagnostic(
        diagnostics,
        'CLOUDFLARE_AGENTS_TOOL_NAME_MISMATCH',
        tool.registration.path,
        inspected.agent.id,
        null,
        capabilityId,
        { declaredName: tool.name, detectedName: matchedEntry.name },
      );
      continue;
    }

    const resolvedTool = await resolveCloudflareAgentsToolDefinition(
      session,
      matchedEntry.analysis,
      matchedEntry.expression,
    );

    if (resolvedTool?.definition.kind !== 'function-tool') {
      continue;
    }

    const functionTool = resolvedTool.definition.tool;
    const implementationMatches = await inspectToolReference(
      session,
      inspected.agent,
      capabilityId,
      functionTool.execute,
      resolvedTool.analysis,
      tool.implementation,
      'CLOUDFLARE_AGENTS_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND',
      'CLOUDFLARE_AGENTS_TOOL_IMPLEMENTATION_NOT_WIRED',
      diagnostics,
    );
    const inputMatches = await inspectToolReference(
      session,
      inspected.agent,
      capabilityId,
      functionTool.inputSchema,
      resolvedTool.analysis,
      tool.inputSchema,
      'CLOUDFLARE_AGENTS_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
      'CLOUDFLARE_AGENTS_TOOL_INPUT_SCHEMA_NOT_WIRED',
      diagnostics,
    );
    const outputMatches = await inspectToolReference(
      session,
      inspected.agent,
      capabilityId,
      functionTool.outputSchema,
      resolvedTool.analysis,
      tool.outputSchema,
      'CLOUDFLARE_AGENTS_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
      'CLOUDFLARE_AGENTS_TOOL_OUTPUT_SCHEMA_NOT_WIRED',
      diagnostics,
    );

    if (implementationMatches && inputMatches && outputMatches) {
      evidence.push(
        createCloudflareAgentsEvidence({
          agentId: inspected.agent.id,
          capabilityId,
          capabilityKind: 'tool',
          details: { toolName: matchedEntry.name },
          kind: 'tool-registration',
          references: [tool.registration, tool.implementation],
          runtimeName: matchedEntry.name,
          source: CLOUDFLARE_AGENTS_ADAPTER_ID,
        }),
      );

      for (const [schemaRole, reference] of [
        ['tool-input', tool.inputSchema],
        ['tool-output', tool.outputSchema],
      ] as const) {
        if (reference !== undefined) {
          evidence.push(
            createCloudflareAgentsEvidence({
              agentId: inspected.agent.id,
              capabilityId,
              capabilityKind: 'tool',
              details: { schemaRole },
              kind: 'schema',
              references: [reference],
              runtimeName: reference.symbol ?? null,
              source: CLOUDFLARE_AGENTS_ADAPTER_ID,
            }),
          );
        }
      }
    }
  }
};

/** Inspects manifest relationships for every supported Cloudflare runtime agent. */
export const inspectCloudflareAgentsRelationships = async (
  session: ICloudflareAgentsInspectionSession,
  inspectedAgents: readonly ICloudflareAgentsInspectedAgent[],
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const verifiedAgents = Object.freeze(inspectedAgents.map(({ agent }) => agent));

  for (const inspected of inspectedAgents) {
    const bindings = inspected.agent.declaration.bindings;

    if (bindings?.instructionLoader !== undefined) {
      await inspectBinding(
        session,
        inspected.agent,
        inspected.instructions,
        inspected.analysis,
        bindings.instructionLoader,
        'CLOUDFLARE_AGENTS_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
        'CLOUDFLARE_AGENTS_INSTRUCTION_LOADER_NOT_WIRED',
        'instruction-loader',
        evidence,
        diagnostics,
      );
    }

    if (bindings?.outputSchema !== undefined) {
      await inspectBinding(
        session,
        inspected.agent,
        getCloudflareAgentsOutputSchema(inspected.output, inspected.analysis),
        inspected.analysis,
        bindings.outputSchema,
        'CLOUDFLARE_AGENTS_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
        'CLOUDFLARE_AGENTS_AGENT_OUTPUT_SCHEMA_NOT_WIRED',
        'schema',
        evidence,
        diagnostics,
        'agent-output',
      );
    }

    await inspectTools(session, inspected, verifiedAgents, evidence, diagnostics);
  }
};
