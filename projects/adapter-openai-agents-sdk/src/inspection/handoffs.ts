import ts from 'typescript';

import { resolveBindingReferences, unwrapExpression } from '@moldea.ai/adapter-static-analysis';
import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic, IRuntimeAdapterContext } from '@moldea.ai/core/adapter';
import { parseRepositoryPath } from '@moldea.ai/repository';

import { OPENAI_AGENTS_SDK_ADAPTER_ID } from '../constants/index.js';
import type {
  IOpenAiAgentsSdkAgentDefinition,
  IOpenAiAgentsSdkHandoffRegistration,
  IOpenAiAgentsSdkInspectionSession,
  IOpenAiAgentsSdkResolvedAgentTarget,
  IOpenAiAgentsSdkSourceAnalysis,
} from '../contracts/index.js';
import {
  analyzeOpenAiAgentsSdkHandoffElement,
  applyOpenAiAgentsSdkAgentMutations,
  collectOpenAiAgentsSdkHandoffCollectionReferences,
  collectOpenAiAgentsSdkHandoffTargetReferences,
  getOpenAiAgentsSdkAgentDefinition,
  getOpenAiAgentsSdkHandoffElements,
  resolveOpenAiAgentsSdkStaticString,
} from '../source-analysis/index.js';
import {
  addOpenAiAgentsSdkDiagnostic,
  createOpenAiAgentsSdkEvidence,
  isOpenAiAgentsSdkMachineString,
  locateOpenAiAgentsSdkNode,
} from './common.js';

const getLocalAgentDefinitions = (
  analysis: IOpenAiAgentsSdkSourceAnalysis,
): readonly IOpenAiAgentsSdkAgentDefinition[] =>
  [...analysis.exports.keys()].flatMap((symbol) => {
    const result = getOpenAiAgentsSdkAgentDefinition(analysis, symbol);
    return result.kind === 'present-supported' && result.definition !== undefined
      ? [result.definition]
      : [];
  });

const resolveTarget = async (
  session: IOpenAiAgentsSdkInspectionSession,
  sourceAnalysis: IOpenAiAgentsSdkSourceAnalysis,
  expression: ts.Expression,
): Promise<IOpenAiAgentsSdkResolvedAgentTarget | null> => {
  const candidate = unwrapExpression(expression);

  if (!ts.isIdentifier(candidate)) {
    return null;
  }

  const resolvedTargets: IOpenAiAgentsSdkResolvedAgentTarget[] = [];

  for (const reference of resolveBindingReferences(candidate, sourceAnalysis)) {
    const path = parseRepositoryPath(reference.path);
    const entry = await session.getEntry(path);

    if (entry?.type !== 'file') {
      continue;
    }

    const sourceResult = await session.analyzeSource(path);

    if (sourceResult.kind !== 'valid') {
      continue;
    }

    const definitionResult = getOpenAiAgentsSdkAgentDefinition(
      sourceResult.analysis,
      reference.symbol,
    );

    if (
      definitionResult.kind !== 'present-supported' ||
      definitionResult.definition === undefined
    ) {
      continue;
    }

    const definition = applyOpenAiAgentsSdkAgentMutations(
      sourceResult.analysis,
      definitionResult.definition,
      collectOpenAiAgentsSdkHandoffTargetReferences(sourceResult.analysis),
    );
    const staticName =
      definition.name.kind === 'present'
        ? await resolveOpenAiAgentsSdkStaticString(
            session,
            sourceResult.analysis,
            definition.name.expression,
          )
        : { kind: 'unsupported' as const };

    resolvedTargets.push(
      Object.freeze({
        analysis: sourceResult.analysis,
        definition,
        path,
        runtimeName:
          staticName.kind === 'supported' && isOpenAiAgentsSdkMachineString(staticName.value)
            ? staticName.value
            : null,
        symbol: reference.symbol,
      }),
    );
  }

  return resolvedTargets.length === 1
    ? (resolvedTargets[0] as IOpenAiAgentsSdkResolvedAgentTarget)
    : null;
};

const getMappedAgents = (
  context: IRuntimeAdapterContext,
  target: IOpenAiAgentsSdkResolvedAgentTarget,
): readonly IIndexedAgent[] =>
  context.project.agents.filter(({ declaration }) => {
    const runtimeAgent = declaration.bindings?.runtimeAgent;
    return runtimeAgent?.path === target.path && runtimeAgent.symbol === target.symbol;
  });

const getSafeDetails = (
  registration: IOpenAiAgentsSdkHandoffRegistration,
  routingDescriptionSource: 'override' | 'target' | 'unresolved',
  target: IOpenAiAgentsSdkResolvedAgentTarget,
  targetAgentId?: string,
) => ({
  registrationKind: registration.kind,
  routingDescriptionSource,
  ...(targetAgentId === undefined ? {} : { targetAgentId }),
  ...(target.runtimeName === null ? {} : { targetRuntimeName: target.runtimeName }),
});

const getAmbiguousTargetDetails = (
  registration: IOpenAiAgentsSdkHandoffRegistration,
  target: IOpenAiAgentsSdkResolvedAgentTarget,
) => ({
  registrationKind: registration.kind,
  ...(target.runtimeName === null ? {} : { targetRuntimeName: target.runtimeName }),
});

const getRuntimeName = async (
  session: IOpenAiAgentsSdkInspectionSession,
  sourceAnalysis: IOpenAiAgentsSdkSourceAnalysis,
  registration: IOpenAiAgentsSdkHandoffRegistration,
): Promise<string | null> => {
  if (registration.toolNameOverride.kind !== 'present') {
    return null;
  }

  const result = await resolveOpenAiAgentsSdkStaticString(
    session,
    sourceAnalysis,
    registration.toolNameOverride.expression,
  );

  return result.kind === 'supported' && isOpenAiAgentsSdkMachineString(result.value)
    ? result.value
    : null;
};

const inspectRoutingDescription = async (
  session: IOpenAiAgentsSdkInspectionSession,
  sourceAgent: IIndexedAgent,
  sourceAnalysis: IOpenAiAgentsSdkSourceAnalysis,
  registration: IOpenAiAgentsSdkHandoffRegistration,
  target: IOpenAiAgentsSdkResolvedAgentTarget,
  targetAgent: IIndexedAgent,
  diagnostics: IAdapterDiagnostic[],
): Promise<'override' | 'target' | 'unresolved'> => {
  const canonicalDescription =
    targetAgent.handoffDescription?.value ?? targetAgent.description.value;

  if (registration.toolDescriptionOverride.kind === 'unresolved') {
    return 'unresolved';
  }

  if (registration.toolDescriptionOverride.kind === 'present') {
    const override = await resolveOpenAiAgentsSdkStaticString(
      session,
      sourceAnalysis,
      registration.toolDescriptionOverride.expression,
    );

    if (override.kind !== 'supported') {
      return 'unresolved';
    }

    if (override.value.length > 0) {
      if (override.value !== canonicalDescription) {
        addOpenAiAgentsSdkDiagnostic(
          diagnostics,
          'OPENAI_AGENTS_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED',
          sourceAnalysis.path,
          sourceAgent.id,
          locateOpenAiAgentsSdkNode(
            sourceAnalysis,
            registration.toolDescriptionOverride.expression,
          ),
          undefined,
          getSafeDetails(registration, 'override', target, targetAgent.id),
        );
      }

      return 'override';
    }
  }

  if (target.definition.handoffDescription.kind === 'unresolved') {
    return 'unresolved';
  }

  if (target.definition.handoffDescription.kind === 'absent') {
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      'OPENAI_AGENTS_SDK_HANDOFF_ROUTING_DESCRIPTION_MISSING',
      target.path,
      sourceAgent.id,
      locateOpenAiAgentsSdkNode(target.analysis, target.definition.declaration),
      undefined,
      getSafeDetails(registration, 'target', target, targetAgent.id),
    );
    return 'target';
  }

  const description = await resolveOpenAiAgentsSdkStaticString(
    session,
    target.analysis,
    target.definition.handoffDescription.expression,
  );

  if (description.kind !== 'supported') {
    return 'unresolved';
  }

  const diagnosticCode =
    description.value.length === 0
      ? 'OPENAI_AGENTS_SDK_HANDOFF_ROUTING_DESCRIPTION_MISSING'
      : description.value !== canonicalDescription
        ? 'OPENAI_AGENTS_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED'
        : null;

  if (diagnosticCode !== null) {
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      diagnosticCode,
      target.path,
      sourceAgent.id,
      locateOpenAiAgentsSdkNode(target.analysis, target.definition.handoffDescription.expression),
      undefined,
      getSafeDetails(registration, 'target', target, targetAgent.id),
    );
  }

  return 'target';
};

/** Inspects runtime-native handoff registrations and routing-description wiring. */
export const inspectOpenAiAgentsSdkHandoffs = async (
  context: IRuntimeAdapterContext,
  session: IOpenAiAgentsSdkInspectionSession,
  agent: IIndexedAgent,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  definition: IOpenAiAgentsSdkAgentDefinition,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const localDefinitions = getLocalAgentDefinitions(analysis);
  const relationships = localDefinitions.map(({ handoffs }) => handoffs);
  const collectionReferences = collectOpenAiAgentsSdkHandoffCollectionReferences(relationships);
  const elements = getOpenAiAgentsSdkHandoffElements(
    definition.handoffs,
    analysis,
    collectionReferences,
  );

  if (elements === null) {
    return;
  }

  const allowedWrapperReferences = new Set(
    localDefinitions.flatMap(({ handoffs }) =>
      (getOpenAiAgentsSdkHandoffElements(handoffs, analysis, collectionReferences) ?? []).filter(
        (element): element is ts.Identifier => ts.isIdentifier(element),
      ),
    ),
  );

  for (const element of elements) {
    session.signal?.throwIfAborted();
    const registration = analyzeOpenAiAgentsSdkHandoffElement(
      element,
      analysis,
      allowedWrapperReferences,
    );

    if (registration === null) {
      continue;
    }

    const target = await resolveTarget(session, analysis, registration.target);

    if (target === null) {
      continue;
    }

    const mappedAgents = getMappedAgents(context, target);
    const runtimeName = await getRuntimeName(session, analysis, registration);
    let routingDescriptionSource: 'override' | 'target' | 'unresolved' = 'unresolved';

    if (mappedAgents.length > 1) {
      addOpenAiAgentsSdkDiagnostic(
        diagnostics,
        'OPENAI_AGENTS_SDK_HANDOFF_TARGET_AMBIGUOUS',
        analysis.path,
        agent.id,
        locateOpenAiAgentsSdkNode(analysis, registration.target),
        undefined,
        getAmbiguousTargetDetails(registration, target),
      );
    } else if (mappedAgents.length === 1) {
      routingDescriptionSource = await inspectRoutingDescription(
        session,
        agent,
        analysis,
        registration,
        target,
        mappedAgents[0] as IIndexedAgent,
        diagnostics,
      );
    }

    const targetAgent = mappedAgents.length === 1 ? mappedAgents[0] : undefined;

    evidence.push(
      createOpenAiAgentsSdkEvidence({
        agentId: agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: getSafeDetails(registration, routingDescriptionSource, target, targetAgent?.id),
        kind: 'handoff-registration',
        references: [{ path: analysis.path }, { path: target.path, symbol: target.symbol }],
        runtimeName,
        source: OPENAI_AGENTS_SDK_ADAPTER_ID,
      }),
    );
  }
};
