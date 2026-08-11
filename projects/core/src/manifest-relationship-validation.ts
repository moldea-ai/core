import { parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import type { ICanonicalDiscoveryResult } from './canonical-discovery.js';
import type { ICoreResourceLimits } from './contracts.js';
import {
  createCoreDiagnosticCollector,
  escapeJsonPointerSegment,
  type ICoreDiagnosticCollector,
} from './diagnostic-utilities.js';
import type { ICoreDiagnostic, IDiagnosticEntity } from './diagnostics.js';
import { compareExactStrings, parseDecisionIdFromPath } from './format-validation.js';
import type { IMoldeaManifestV1, IParsedDecision } from './format.js';

// trusted repository indexes shared by relationship validation helpers
interface IManifestRelationshipValidationContext {
  readonly blockedPaths: ReadonlySet<IRepositoryPath>;
  readonly collector: ICoreDiagnosticCollector;
  readonly discoveredDecisionPaths: ReadonlySet<IRepositoryPath>;
  readonly manifestPath: IRepositoryPath;
  readonly parsedDecisionsByPath: ReadonlyMap<
    IRepositoryPath,
    Pick<IParsedDecision, 'id' | 'path' | 'status'>
  >;
  readonly validAgentContextPaths: ReadonlySet<IRepositoryPath>;
  readonly validTopLevelContextPaths: ReadonlySet<IRepositoryPath>;
}

/** Creates diagnostic entity metadata for a decision relationship. */
const createDecisionEntity = (
  decisionPath: IRepositoryPath,
  agentId?: string,
): IDiagnosticEntity => {
  const decisionId = parseDecisionIdFromPath(decisionPath);

  return {
    ...(agentId === undefined ? {} : { agentId }),
    ...(decisionId === null ? {} : { decisionId }),
  };
};

/** Adds a missing-context diagnostic unless discovery owns the target-path failure. */
const validateContextRelationship = (
  referencedPath: IRepositoryPath,
  pointer: string,
  validContextPaths: ReadonlySet<IRepositoryPath>,
  context: IManifestRelationshipValidationContext,
  agentId?: string,
): void => {
  if (validContextPaths.has(referencedPath) || context.blockedPaths.has(referencedPath)) {
    return;
  }

  context.collector.add({
    code: 'MOLDEA_REFERENCE_MISSING',
    details: { referencedPath },
    entity: agentId === undefined ? null : { agentId },
    path: context.manifestPath,
    pointer,
  });
};

/** Adds missing or inactive diagnostics for a decision relationship. */
const validateDecisionRelationship = (
  referencedPath: IRepositoryPath,
  pointer: string,
  context: IManifestRelationshipValidationContext,
  agentId?: string,
): void => {
  if (!context.discoveredDecisionPaths.has(referencedPath)) {
    if (context.blockedPaths.has(referencedPath)) {
      return;
    }

    context.collector.add({
      code: 'MOLDEA_DECISION_REFERENCE_MISSING',
      details: { referencedPath },
      entity: createDecisionEntity(referencedPath, agentId),
      path: context.manifestPath,
      pointer,
    });
    return;
  }

  const parsedDecision = context.parsedDecisionsByPath.get(referencedPath);
  if (parsedDecision === undefined || parsedDecision.status === 'accepted') {
    return;
  }

  context.collector.add({
    code: 'MOLDEA_DECISION_RELATIONSHIP_INACTIVE',
    details: {
      referencedPath,
      targetStatus: parsedDecision.status,
    },
    entity: createDecisionEntity(referencedPath, agentId),
    path: context.manifestPath,
    pointer,
  });
};

/**
 * Validates manifest and agent relationships against canonical discovery and parsed decisions.
 * @param manifestPath The canonical manifest path used for relationship diagnostics.
 * @param manifest The normalized manifest contract to validate.
 * @param discovery The canonical repository discovery result.
 * @param decisions The successfully parsed canonical decisions.
 * @param limits The resource limits applied to emitted diagnostics.
 * @returns The frozen deterministic relationship diagnostics.
 * @throws
 * - RESOURCE_LIMIT_EXCEEDED: The repository-level diagnostic budget was exceeded.
 */
export const validateManifestRelationships = (
  manifestPath: IRepositoryPath,
  manifest: IMoldeaManifestV1,
  discovery: ICanonicalDiscoveryResult,
  decisions: readonly Pick<IParsedDecision, 'id' | 'path' | 'status'>[],
  limits: ICoreResourceLimits,
): readonly ICoreDiagnostic[] => {
  const collector = createCoreDiagnosticCollector(limits, 'inspect-project');
  const validAgentContextPaths = new Set<IRepositoryPath>(discovery.inventory.context);
  const validTopLevelContextPaths = new Set(validAgentContextPaths);
  if (discovery.inventory.project !== null) {
    validTopLevelContextPaths.add(discovery.inventory.project);
  }

  const validationContext: IManifestRelationshipValidationContext = {
    blockedPaths: new Set(
      discovery.diagnostics.flatMap((diagnostic) =>
        diagnostic.path === null ? [] : [diagnostic.path],
      ),
    ),
    collector,
    discoveredDecisionPaths: new Set(discovery.inventory.decisions),
    manifestPath,
    parsedDecisionsByPath: new Map(decisions.map((decision) => [decision.path, decision])),
    validAgentContextPaths,
    validTopLevelContextPaths,
  };

  for (const referencedPathValue of Object.keys(manifest.context ?? {}).sort(compareExactStrings)) {
    const referencedPath = parseRepositoryPath(referencedPathValue);
    validateContextRelationship(
      referencedPath,
      `/context/${escapeJsonPointerSegment(referencedPathValue)}`,
      validationContext.validTopLevelContextPaths,
      validationContext,
    );
  }

  for (const referencedPathValue of Object.keys(manifest.decisions ?? {}).sort(
    compareExactStrings,
  )) {
    const referencedPath = parseRepositoryPath(referencedPathValue);
    validateDecisionRelationship(
      referencedPath,
      `/decisions/${escapeJsonPointerSegment(referencedPathValue)}`,
      validationContext,
    );
  }

  for (const agentId of Object.keys(manifest.agents ?? {}).sort(compareExactStrings)) {
    const agent = manifest.agents?.[agentId];
    if (agent === undefined) {
      continue;
    }

    const escapedAgentId = escapeJsonPointerSegment(agentId);
    for (const referencedPath of [...(agent.context ?? [])].sort(compareExactStrings)) {
      validateContextRelationship(
        referencedPath,
        `/agents/${escapedAgentId}/context`,
        validationContext.validAgentContextPaths,
        validationContext,
        agentId,
      );
    }

    for (const referencedPath of [...(agent.decisions ?? [])].sort(compareExactStrings)) {
      validateDecisionRelationship(
        referencedPath,
        `/agents/${escapedAgentId}/decisions`,
        validationContext,
        agentId,
      );
    }
  }

  return collector.finalize();
};
