import ts from 'typescript';

import { getCallableExportState, getConstExport } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference, IToolManifestEntry } from '@moldea.ai/core/format';

import {
  CLAUDE_AGENT_SDK_ADAPTER_ID,
  CLAUDE_AGENT_SDK_MCP_SERVER_KEY_PATTERN,
} from '../constants/index.js';
import type {
  IClaudeAgentSdkAvailability,
  IClaudeAgentSdkInspectionSession,
  IClaudeAgentSdkMapEntry,
  IClaudeAgentSdkQueryContext,
  IClaudeAgentSdkSourceAnalysis,
  IClaudeAgentSdkToolDefinition,
} from '../contracts/index.js';
import {
  analyzeClaudeAgentSdkMutations,
  classifyClaudeAgentSdkAgentAvailability,
  classifyClaudeAgentSdkDirectBinding,
  classifyClaudeAgentSdkMcpToolAvailability,
  collectClaudeAgentSdkMcpToolReferences,
  collectClaudeAgentSdkRelationshipIdentifiers,
  getClaudeAgentSdkClosedArray,
  getClaudeAgentSdkClosedMapEntries,
  getClaudeAgentSdkQueryWrapper,
  getClaudeAgentSdkToolDefinition,
  resolveClaudeAgentSdkStaticString,
} from '../source-analysis/index.js';
import {
  addClaudeAgentSdkDiagnostic,
  analyzeClaudeAgentSdkBoundReference,
  compareClaudeAgentSdkStrings,
  createClaudeAgentSdkEvidence,
  isClaudeAgentSdkMachineString,
  locateClaudeAgentSdkNode,
} from './common.js';
import {
  resolveClaudeAgentSdkAgentDefinition,
  resolveClaudeAgentSdkMcpServer,
  resolveClaudeAgentSdkTool,
} from './resolution.js';
import type {
  IClaudeAgentSdkInspectedAgent,
  IClaudeAgentSdkInspectedDefinitionAgent,
  IClaudeAgentSdkInspectedQueryAgent,
} from './types.js';

interface IQueryToolMount {
  readonly availability: IClaudeAgentSdkAvailability;
  readonly queryAgent: IClaudeAgentSdkInspectedQueryAgent;
  readonly queryContext: IClaudeAgentSdkQueryContext;
  readonly runtimeName: string;
  readonly serverKey: string;
  readonly tool: {
    readonly analysis: IClaudeAgentSdkSourceAnalysis;
    readonly definition: IClaudeAgentSdkToolDefinition;
    readonly path: string;
    readonly symbol: string;
    readonly underlyingName: string;
  };
}

interface IQueryMountCollection {
  readonly hasUnresolvedCandidate: boolean;
  readonly mounts: readonly IQueryToolMount[];
  readonly queryAgent: IClaudeAgentSdkInspectedQueryAgent;
}

interface IInspectedManifestTool {
  readonly analysis: IClaudeAgentSdkSourceAnalysis;
  readonly definition: IClaudeAgentSdkToolDefinition;
  readonly reference: IRepositoryReference & { readonly symbol: string };
}

const collectMcpServerReferences = (
  analysis: IClaudeAgentSdkSourceAnalysis,
): ReadonlySet<ts.Identifier> => {
  const serverRelationships = [...analysis.exports.keys()].flatMap((symbol) => {
    const result = getClaudeAgentSdkQueryWrapper(analysis, symbol);

    return result.kind === 'present-supported'
      ? result.wrapper.contexts.map(({ mcpServers }) => mcpServers)
      : [];
  });
  const collectionReferences = collectClaudeAgentSdkRelationshipIdentifiers(serverRelationships);

  return new Set(
    serverRelationships.flatMap((relationship) =>
      (getClaudeAgentSdkClosedMapEntries(relationship, analysis, collectionReferences) ?? [])
        .map(({ value }) => value)
        .filter((value): value is ts.Identifier => ts.isIdentifier(value)),
    ),
  );
};

const resolveEntryName = async (
  session: IClaudeAgentSdkInspectionSession,
  analysis: IClaudeAgentSdkSourceAnalysis,
  entry: IClaudeAgentSdkMapEntry,
): Promise<string | null> => {
  if (entry.name !== null) {
    return entry.name;
  }

  const result = await resolveClaudeAgentSdkStaticString(
    session,
    analysis,
    entry.keyExpression as ts.Expression,
  );
  return result.kind === 'supported' ? result.value : null;
};

const inspectCallableSymbol = async (
  session: IClaudeAgentSdkInspectionSession,
  reference: IRepositoryReference,
  agentId: string,
  capabilityId: string,
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
    capabilityId,
  );

  if (analysis === null) {
    return null;
  }

  const state = getCallableExportState(analysis, reference.symbol);

  if (state.kind === 'absent') {
    addClaudeAgentSdkDiagnostic(
      diagnostics,
      'CLAUDE_AGENT_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND',
      reference.path,
      agentId,
      null,
      capabilityId,
    );
    return false;
  }

  return state.kind === 'present-supported' ? true : null;
};

const inspectConstSymbol = async (
  session: IClaudeAgentSdkInspectionSession,
  reference: IRepositoryReference,
  agentId: string,
  capabilityId: string,
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
    capabilityId,
  );

  if (analysis === null) {
    return null;
  }

  const state = getConstExport(analysis, reference.symbol);

  if (state.kind === 'absent') {
    addClaudeAgentSdkDiagnostic(
      diagnostics,
      'CLAUDE_AGENT_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
      reference.path,
      agentId,
      null,
      capabilityId,
    );
    return false;
  }

  return state.kind === 'present-supported' ? true : null;
};

const inspectManifestTool = async (
  session: IClaudeAgentSdkInspectionSession,
  agentId: string,
  capabilityId: string,
  declaration: IToolManifestEntry,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<IInspectedManifestTool | null> => {
  const reference = declaration.registration;

  if (reference?.symbol === undefined) {
    return null;
  }

  const analysis = await analyzeClaudeAgentSdkBoundReference(
    session,
    reference,
    diagnostics,
    agentId,
    capabilityId,
  );

  if (analysis === null) {
    return null;
  }

  const result = getClaudeAgentSdkToolDefinition(analysis, reference.symbol);

  if (result.kind === 'absent') {
    addClaudeAgentSdkDiagnostic(
      diagnostics,
      'CLAUDE_AGENT_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
      reference.path,
      agentId,
      null,
      capabilityId,
    );
    return null;
  }

  if (result.kind !== 'present-supported') {
    return null;
  }

  const allowedReferences = collectClaudeAgentSdkMcpToolReferences(analysis);
  const mutations = analyzeClaudeAgentSdkMutations(
    analysis,
    result.tool.declaration,
    allowedReferences,
  );
  const implementationRelationship =
    mutations.hasUnknownMutation || mutations.mutatedMembers.has('handler')
      ? null
      : classifyClaudeAgentSdkDirectBinding(
          { expression: result.tool.implementation, kind: 'present' },
          analysis,
          declaration.implementation,
        );
  const implementationSymbolState = await inspectCallableSymbol(
    session,
    declaration.implementation,
    agentId,
    capabilityId,
    diagnostics,
  );

  if (implementationSymbolState === true && implementationRelationship === false) {
    addClaudeAgentSdkDiagnostic(
      diagnostics,
      'CLAUDE_AGENT_SDK_TOOL_IMPLEMENTATION_NOT_WIRED',
      analysis.path,
      agentId,
      locateClaudeAgentSdkNode(analysis, result.tool.implementation),
      capabilityId,
    );
  }

  if (declaration.inputSchema?.symbol !== undefined) {
    const schemaState = await inspectConstSymbol(
      session,
      declaration.inputSchema,
      agentId,
      capabilityId,
      diagnostics,
    );
    const schemaRelationship =
      mutations.hasUnknownMutation || mutations.mutatedMembers.has('inputSchema')
        ? null
        : classifyClaudeAgentSdkDirectBinding(
            { expression: result.tool.inputSchema, kind: 'present' },
            analysis,
            declaration.inputSchema,
          );

    if (schemaState === true && schemaRelationship === true) {
      evidence.push(
        createClaudeAgentSdkEvidence({
          agentId,
          capabilityId,
          capabilityKind: 'tool',
          details: { role: 'tool-input', schemaKind: 'sdk-tool-input' },
          kind: 'schema',
          references: [
            { path: analysis.path },
            { path: declaration.inputSchema.path, symbol: declaration.inputSchema.symbol },
          ],
          runtimeName: declaration.inputSchema.symbol,
          source: CLAUDE_AGENT_SDK_ADAPTER_ID,
        }),
      );
    } else if (schemaState === true && schemaRelationship === false) {
      addClaudeAgentSdkDiagnostic(
        diagnostics,
        'CLAUDE_AGENT_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED',
        analysis.path,
        agentId,
        locateClaudeAgentSdkNode(analysis, result.tool.inputSchema),
        capabilityId,
      );
    }
  }

  return Object.freeze({
    analysis,
    definition: result.tool,
    reference: Object.freeze({ path: reference.path, symbol: reference.symbol }),
  });
};

const collectQueryMounts = async (
  session: IClaudeAgentSdkInspectionSession,
  queryAgent: IClaudeAgentSdkInspectedQueryAgent,
  diagnostics: IAdapterDiagnostic[],
): Promise<IQueryMountCollection> => {
  const mounts: IQueryToolMount[] = [];
  let hasUnresolvedCandidate = queryAgent.wrapper.hasAmbiguousCandidate;
  const queryCollectionReferences = collectClaudeAgentSdkRelationshipIdentifiers(
    queryAgent.wrapper.contexts.flatMap((queryContext) => [
      queryContext.mcpServers,
      queryContext.disallowedTools,
    ]),
  );

  for (const queryContext of queryAgent.wrapper.contexts) {
    const entries = getClaudeAgentSdkClosedMapEntries(
      queryContext.mcpServers,
      queryAgent.analysis,
      queryCollectionReferences,
    );

    if (entries === null) {
      hasUnresolvedCandidate = true;
      continue;
    }

    const resolvedNames = await Promise.all(
      entries.map((entry) => resolveEntryName(session, queryAgent.analysis, entry)),
    );
    const supportedNames = resolvedNames.filter((name): name is string => name !== null);

    if (
      supportedNames.length !== entries.length ||
      new Set(supportedNames).size !== supportedNames.length
    ) {
      hasUnresolvedCandidate = true;
      continue;
    }

    for (const [entryIndex, entry] of entries.entries()) {
      const serverKey = resolvedNames[entryIndex];

      if (serverKey === undefined || serverKey === null) {
        hasUnresolvedCandidate = true;
        continue;
      }

      const server = await resolveClaudeAgentSdkMcpServer(
        session,
        queryAgent.analysis,
        entry.value,
      );

      if (server === null) {
        hasUnresolvedCandidate = true;
        continue;
      }

      const serverMutations = analyzeClaudeAgentSdkMutations(
        server.analysis,
        server.definition.declaration,
        collectMcpServerReferences(server.analysis),
      );

      if (serverMutations.hasUnknownMutation || serverMutations.mutatedMembers.has('tools')) {
        hasUnresolvedCandidate = true;
        continue;
      }

      if (!CLAUDE_AGENT_SDK_MCP_SERVER_KEY_PATTERN.test(serverKey)) {
        addClaudeAgentSdkDiagnostic(
          diagnostics,
          'CLAUDE_AGENT_SDK_MCP_SERVER_KEY_UNSUPPORTED',
          queryAgent.analysis.path,
          queryAgent.agent.id,
          locateClaudeAgentSdkNode(queryAgent.analysis, entry.keyExpression),
        );
        hasUnresolvedCandidate = true;
        continue;
      }

      const serverName = await resolveClaudeAgentSdkStaticString(
        session,
        server.analysis,
        server.definition.name,
      );
      const serverVersion =
        server.definition.version.kind === 'present'
          ? await resolveClaudeAgentSdkStaticString(
              session,
              server.analysis,
              server.definition.version.expression,
            )
          : { kind: 'supported' as const, value: '', expression: server.definition.name };

      if (serverName.kind !== 'supported' || serverVersion.kind !== 'supported') {
        hasUnresolvedCandidate = true;
        continue;
      }

      const serverCollectionReferences = collectClaudeAgentSdkRelationshipIdentifiers([
        server.definition.tools,
      ]);
      const toolElements = getClaudeAgentSdkClosedArray(
        server.definition.tools,
        server.analysis,
        serverCollectionReferences,
      );

      if (toolElements === null) {
        hasUnresolvedCandidate = true;
        continue;
      }

      for (const toolElement of toolElements) {
        const resolvedTool = await resolveClaudeAgentSdkTool(session, server.analysis, toolElement);

        if (resolvedTool === null) {
          hasUnresolvedCandidate = true;
          continue;
        }

        const toolMutations = analyzeClaudeAgentSdkMutations(
          resolvedTool.analysis,
          resolvedTool.definition.declaration,
          collectClaudeAgentSdkMcpToolReferences(resolvedTool.analysis),
        );

        if (toolMutations.hasUnknownMutation || toolMutations.mutatedMembers.has('name')) {
          hasUnresolvedCandidate = true;
          continue;
        }

        const name = await resolveClaudeAgentSdkStaticString(
          session,
          resolvedTool.analysis,
          resolvedTool.definition.name,
        );

        if (name.kind !== 'supported') {
          hasUnresolvedCandidate = true;
          continue;
        }

        const runtimeName = `mcp__${serverKey}__${name.value}`;
        const availability = await classifyClaudeAgentSdkMcpToolAvailability(
          queryAgent.analysis,
          'available',
          null,
          queryContext.disallowedTools,
          queryContext.agentSelection,
          queryContext.toolAliases,
          queryCollectionReferences,
          runtimeName,
          serverKey,
          (analysis, expression) =>
            resolveClaudeAgentSdkStaticString(session, analysis, expression),
        );

        mounts.push(
          Object.freeze({
            availability,
            queryAgent,
            queryContext,
            runtimeName,
            serverKey,
            tool: Object.freeze({
              analysis: resolvedTool.analysis,
              definition: resolvedTool.definition,
              path: resolvedTool.path,
              symbol: resolvedTool.symbol,
              underlyingName: name.value,
            }),
          }),
        );
      }
    }
  }

  return Object.freeze({
    hasUnresolvedCandidate,
    mounts: Object.freeze(mounts),
    queryAgent,
  });
};

const isActiveDefinitionContext = async (
  session: IClaudeAgentSdkInspectionSession,
  mount: IQueryToolMount,
  inspected: IClaudeAgentSdkInspectedDefinitionAgent,
): Promise<boolean | null> => {
  const queryAgent = mount.queryAgent;
  const references = collectClaudeAgentSdkRelationshipIdentifiers([
    mount.queryContext.tools,
    mount.queryContext.disallowedTools,
    mount.queryContext.agents,
  ]);
  const agentAvailability = await classifyClaudeAgentSdkAgentAvailability(
    queryAgent.analysis,
    mount.queryContext.tools,
    mount.queryContext.disallowedTools,
    mount.queryContext.agentSelection,
    mount.queryContext.toolAliases,
    references,
    (analysis, expression) => resolveClaudeAgentSdkStaticString(session, analysis, expression),
  );

  if (agentAvailability !== 'available') {
    return agentAvailability === 'unavailable' ? false : null;
  }

  const entries = getClaudeAgentSdkClosedMapEntries(
    mount.queryContext.agents,
    queryAgent.analysis,
    references,
  );

  if (entries === null) {
    return null;
  }

  const targetReference = inspected.agent.declaration.bindings?.runtimeAgent;

  if (targetReference?.symbol === undefined) {
    return false;
  }

  for (const entry of entries) {
    const target = await resolveClaudeAgentSdkAgentDefinition(
      session,
      queryAgent.analysis,
      entry.value,
    );

    if (target?.path === targetReference.path && target.symbol === targetReference.symbol) {
      return true;
    }
  }

  return false;
};

const getEligibleMounts = async (
  session: IClaudeAgentSdkInspectionSession,
  inspected: IClaudeAgentSdkInspectedAgent,
  collections: readonly IQueryMountCollection[],
): Promise<{
  readonly hasUnresolvedCandidate: boolean;
  readonly mounts: readonly IQueryToolMount[];
}> => {
  if (inspected.kind === 'query-wrapper') {
    const matchingCollection = collections.find(
      ({ queryAgent }) => queryAgent.agent.id === inspected.agent.id,
    );
    const directMounts = collections.flatMap(({ mounts }) =>
      mounts.filter((mount) => mount.queryAgent.agent.id === inspected.agent.id),
    );

    return Object.freeze({
      hasUnresolvedCandidate: matchingCollection?.hasUnresolvedCandidate ?? false,
      mounts: Object.freeze(directMounts),
    });
  }

  const mounts: IQueryToolMount[] = [];
  let hasUnresolvedCandidate = false;

  for (const collection of collections) {
    for (const mount of collection.mounts) {
      const active = await isActiveDefinitionContext(session, mount, inspected);

      if (active === null) {
        hasUnresolvedCandidate = true;
      } else if (active) {
        if (inspected.definition.mcpServers.kind !== 'absent') {
          hasUnresolvedCandidate = true;
        }

        const references = collectClaudeAgentSdkRelationshipIdentifiers([
          inspected.definition.tools,
          inspected.definition.disallowedTools,
        ]);
        const availability = await classifyClaudeAgentSdkMcpToolAvailability(
          inspected.analysis,
          mount.availability,
          inspected.definition.tools,
          inspected.definition.disallowedTools,
          null,
          null,
          references,
          mount.runtimeName,
          mount.serverKey,
          (analysis, expression) =>
            resolveClaudeAgentSdkStaticString(session, analysis, expression),
        );

        mounts.push(Object.freeze({ ...mount, availability }));
      }
    }
  }

  return Object.freeze({ hasUnresolvedCandidate, mounts: Object.freeze(mounts) });
};

/** Inspects custom tool declarations, schemas, implementations, mounts, and availability. */
export const inspectClaudeAgentSdkTools = async (
  session: IClaudeAgentSdkInspectionSession,
  inspectedAgents: readonly IClaudeAgentSdkInspectedAgent[],
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const queryAgents = inspectedAgents.filter(
    (inspected): inspected is IClaudeAgentSdkInspectedQueryAgent =>
      inspected.kind === 'query-wrapper',
  );
  const mountCollections = await Promise.all(
    queryAgents.map((queryAgent) => collectQueryMounts(session, queryAgent, diagnostics)),
  );

  for (const inspected of inspectedAgents) {
    const eligible = await getEligibleMounts(session, inspected, mountCollections);

    for (const capabilityId of Object.keys(inspected.agent.declaration.tools ?? {}).sort(
      compareClaudeAgentSdkStrings,
    )) {
      const declaration = inspected.agent.declaration.tools?.[capabilityId];

      if (declaration === undefined) {
        continue;
      }

      const registration = await inspectManifestTool(
        session,
        inspected.agent.id,
        capabilityId,
        declaration,
        evidence,
        diagnostics,
      );

      if (registration === null) {
        continue;
      }

      const exactMounts = eligible.mounts.filter(
        (mount) =>
          mount.tool.path === registration.reference.path &&
          mount.tool.symbol === registration.reference.symbol,
      );
      const matchingMount = exactMounts.find(
        (mount) => mount.availability === 'available' && mount.runtimeName === declaration.name,
      );

      if (matchingMount !== undefined && isClaudeAgentSdkMachineString(matchingMount.runtimeName)) {
        evidence.push(
          createClaudeAgentSdkEvidence({
            agentId: inspected.agent.id,
            capabilityId,
            capabilityKind: 'tool',
            details: {
              availabilitySource:
                inspected.kind === 'query-wrapper'
                  ? 'query'
                  : inspected.definition.tools.kind === 'absent'
                    ? 'inherited-subagent-tools'
                    : 'explicit-subagent-tools',
              registrationKind: 'sdk-mcp-tool',
              serverKey: matchingMount.serverKey,
              underlyingToolName: matchingMount.tool.underlyingName,
            },
            kind: 'tool-registration',
            references: [
              { path: matchingMount.queryAgent.analysis.path },
              { path: registration.reference.path, symbol: registration.reference.symbol },
              {
                path: declaration.implementation.path,
                ...(declaration.implementation.symbol === undefined
                  ? {}
                  : { symbol: declaration.implementation.symbol }),
              },
            ],
            runtimeName: matchingMount.runtimeName,
            source: CLAUDE_AGENT_SDK_ADAPTER_ID,
          }),
        );
        continue;
      }

      const hasUnresolvedMount =
        eligible.hasUnresolvedCandidate ||
        exactMounts.some(({ availability }) => availability === 'unresolved');
      const closedMounts = exactMounts.filter(({ availability }) => availability !== 'unresolved');
      const hasDeclaredRuntimeName = closedMounts.some(
        ({ runtimeName }) => runtimeName === declaration.name,
      );

      if (hasUnresolvedMount) {
        continue;
      }

      if (closedMounts.length > 0 && !hasDeclaredRuntimeName) {
        const observedRuntimeName =
          closedMounts.length === 1 ? closedMounts[0]?.runtimeName : undefined;
        addClaudeAgentSdkDiagnostic(
          diagnostics,
          'CLAUDE_AGENT_SDK_TOOL_NAME_MISMATCH',
          registration.analysis.path,
          inspected.agent.id,
          locateClaudeAgentSdkNode(registration.analysis, registration.definition.name),
          capabilityId,
          {
            expectedRuntimeName: declaration.name,
            ...(observedRuntimeName !== undefined &&
            isClaudeAgentSdkMachineString(observedRuntimeName)
              ? { observedRuntimeName }
              : {}),
          },
        );
      } else if (inspected.kind === 'query-wrapper' || eligible.mounts.length > 0) {
        addClaudeAgentSdkDiagnostic(
          diagnostics,
          'CLAUDE_AGENT_SDK_TOOL_REGISTRATION_NOT_WIRED',
          inspected.analysis.path,
          inspected.agent.id,
          null,
          capabilityId,
        );
      }
    }
  }
};
