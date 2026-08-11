import {
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryOperationOptions,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import type { ICanonicalDiscoveryResult } from '../canonical-discovery/index.js';
import type { ICoreResourceLimits } from '../contracts/index.js';
import {
  createCoreDiagnosticCollector,
  escapeJsonPointerSegment,
  type ICoreDiagnosticCollector,
} from '../diagnostic-utilities/index.js';
import type {
  ICoreDiagnostic,
  ICoreDiagnosticCode,
  IDiagnosticEntity,
} from '../diagnostics/index.js';
import { compareExactStrings, parseDecisionIdFromPath } from '../format-validation/index.js';
import type {
  IAgentManifestEntry,
  IMoldeaManifestV1,
  IRepositoryReference,
  IRelationshipManifestEntry,
  ISkillManifestEntry,
  IToolManifestEntry,
  IUnresolvedRequirementManifestEntry,
} from '../format/index.js';

// internal classification for one exact repository-backed declaration
type IRepositoryCandidateKind =
  'reference' | 'impact' | 'tool-implementation' | 'skill-implementation';

interface IRepositoryCandidate {
  readonly entity: IDiagnosticEntity | null;
  readonly kind: IRepositoryCandidateKind;
  readonly path: IRepositoryPath;
  readonly pointer: string;
}

const childPointer = (pointer: string, segment: string): string => {
  return `${pointer}/${escapeJsonPointerSegment(segment)}`;
};

const compareNullableStrings = (left: string | undefined, right: string | undefined): number => {
  if (left === undefined) {
    return right === undefined ? 0 : -1;
  }

  return right === undefined ? 1 : compareExactStrings(left, right);
};

const compareReferences = (left: IRepositoryReference, right: IRepositoryReference): number => {
  return (
    compareExactStrings(left.path, right.path) || compareNullableStrings(left.symbol, right.symbol)
  );
};

/** Adds sorted repository-reference array entries with their normalized indexes. */
const addReferenceCandidates = (
  candidates: IRepositoryCandidate[],
  references: readonly IRepositoryReference[] | undefined,
  pointer: string,
  entity: IDiagnosticEntity | null,
): void => {
  for (const [index, reference] of [...(references ?? [])].sort(compareReferences).entries()) {
    candidates.push({
      entity,
      kind: 'reference',
      path: reference.path,
      pointer: childPointer(pointer, String(index)),
    });
  }
};

/** Adds sorted exact impact paths while retaining skipped glob indexes. */
const addImpactCandidates = (
  candidates: IRepositoryCandidate[],
  affectedBy: readonly string[] | undefined,
  pointer: string,
  entity: IDiagnosticEntity | null,
): void => {
  for (const [index, pattern] of [...(affectedBy ?? [])].sort(compareExactStrings).entries()) {
    if (pattern.includes('*')) {
      continue;
    }

    candidates.push({
      entity,
      kind: 'impact',
      path: parseRepositoryPath(pattern),
      pointer: childPointer(pointer, String(index)),
    });
  }
};

/** Adds repository-backed declarations owned by one context or decision relationship. */
const addRelationshipCandidates = (
  candidates: IRepositoryCandidate[],
  relationship: IRelationshipManifestEntry,
  pointer: string,
  entity: IDiagnosticEntity | null,
): void => {
  addReferenceCandidates(
    candidates,
    relationship.bindings,
    childPointer(pointer, 'bindings'),
    entity,
  );
  addImpactCandidates(
    candidates,
    relationship.affectedBy,
    childPointer(pointer, 'affectedBy'),
    entity,
  );
};

/** Adds related repository references from sorted unresolved requirements. */
const addUnresolvedCandidates = (
  candidates: IRepositoryCandidate[],
  requirements: Readonly<Record<string, IUnresolvedRequirementManifestEntry>> | undefined,
  pointer: string,
  entity: IDiagnosticEntity | null,
): void => {
  for (const requirementId of Object.keys(requirements ?? {}).sort(compareExactStrings)) {
    const requirement = requirements?.[requirementId];

    if (requirement === undefined) {
      continue;
    }

    addReferenceCandidates(
      candidates,
      requirement.related,
      childPointer(childPointer(pointer, requirementId), 'related'),
      entity,
    );
  }
};

/** Adds one capability's implementation, optional bindings, and exact impact paths. */
const addCapabilityCandidates = (
  candidates: IRepositoryCandidate[],
  capability: ISkillManifestEntry | IToolManifestEntry,
  capabilityKind: 'tool' | 'skill',
  capabilityId: string,
  agentId: string,
  collectionPointer: string,
  additionalReferences: readonly (readonly [
    property: 'inputSchema' | 'outputSchema',
    reference: IRepositoryReference | undefined,
  ])[] = [],
): void => {
  const capabilityPointer = childPointer(collectionPointer, capabilityId);
  const capabilityEntity = { agentId, capabilityId, capabilityKind };
  candidates.push({
    entity: capabilityEntity,
    kind: `${capabilityKind}-implementation`,
    path: capability.implementation.path,
    pointer: childPointer(capabilityPointer, 'implementation'),
  });

  for (const [property, reference] of [
    ['registration', capability.registration] as const,
    ...additionalReferences,
  ]) {
    if (reference !== undefined) {
      candidates.push({
        entity: capabilityEntity,
        kind: 'reference',
        path: reference.path,
        pointer: childPointer(capabilityPointer, property),
      });
    }
  }

  addImpactCandidates(
    candidates,
    capability.affectedBy,
    childPointer(capabilityPointer, 'affectedBy'),
    capabilityEntity,
  );
};

/** Adds all repository-backed declarations owned by one normalized agent. */
const addAgentCandidates = (
  candidates: IRepositoryCandidate[],
  agentId: string,
  agent: IAgentManifestEntry,
): void => {
  const escapedAgentId = escapeJsonPointerSegment(agentId);
  const pointer = `/agents/${escapedAgentId}`;
  const entity = { agentId };
  const bindingsPointer = childPointer(pointer, 'bindings');
  const bindings = agent.bindings;

  for (const property of [
    'runtimeAgent',
    'inputSchema',
    'outputSchema',
    'instructionLoader',
  ] as const) {
    const reference = bindings?.[property];

    if (reference !== undefined) {
      candidates.push({
        entity,
        kind: 'reference',
        path: reference.path,
        pointer: childPointer(bindingsPointer, property),
      });
    }
  }

  for (const variableId of Object.keys(bindings?.variableProviders ?? {}).sort(
    compareExactStrings,
  )) {
    const reference = bindings?.variableProviders?.[variableId];

    if (reference !== undefined) {
      candidates.push({
        entity: { agentId, variableId },
        kind: 'reference',
        path: reference.path,
        pointer: childPointer(childPointer(bindingsPointer, 'variableProviders'), variableId),
      });
    }
  }

  addImpactCandidates(candidates, agent.affectedBy, childPointer(pointer, 'affectedBy'), entity);

  const toolsPointer = childPointer(pointer, 'tools');

  for (const capabilityId of Object.keys(agent.tools ?? {}).sort(compareExactStrings)) {
    const capability = agent.tools?.[capabilityId];

    if (capability !== undefined) {
      addCapabilityCandidates(candidates, capability, 'tool', capabilityId, agentId, toolsPointer, [
        ['inputSchema', capability.inputSchema],
        ['outputSchema', capability.outputSchema],
      ]);
    }
  }

  const skillsPointer = childPointer(pointer, 'skills');

  for (const capabilityId of Object.keys(agent.skills ?? {}).sort(compareExactStrings)) {
    const capability = agent.skills?.[capabilityId];

    if (capability !== undefined) {
      addCapabilityCandidates(
        candidates,
        capability,
        'skill',
        capabilityId,
        agentId,
        skillsPointer,
      );
    }
  }

  addUnresolvedCandidates(
    candidates,
    agent.unresolved,
    childPointer(pointer, 'unresolved'),
    entity,
  );
};

/** Collects every repository-backed manifest declaration in deterministic pointer order. */
const collectCandidates = (manifest: IMoldeaManifestV1): readonly IRepositoryCandidate[] => {
  const candidates: IRepositoryCandidate[] = [];

  for (const property of ['context', 'decisions'] as const) {
    const relationships = manifest[property];

    for (const referencedPath of Object.keys(relationships ?? {}).sort(compareExactStrings)) {
      const relationship = relationships?.[referencedPath];

      if (relationship === undefined) {
        continue;
      }

      const pointer = childPointer(`/${property}`, referencedPath);
      const decisionId =
        property === 'decisions'
          ? parseDecisionIdFromPath(parseRepositoryPath(referencedPath))
          : null;
      addRelationshipCandidates(
        candidates,
        relationship,
        pointer,
        decisionId === null ? null : { decisionId },
      );
    }
  }

  addUnresolvedCandidates(candidates, manifest.unresolved, '/unresolved', null);

  for (const agentId of Object.keys(manifest.agents ?? {}).sort(compareExactStrings)) {
    const agent = manifest.agents?.[agentId];

    if (agent !== undefined) {
      addAgentCandidates(candidates, agentId, agent);
    }
  }

  return candidates.sort((left, right) => compareExactStrings(left.pointer, right.pointer));
};

/** Tests whether discovery already owns a diagnostic for a path or one of its ancestors. */
const isBlockedPath = (path: IRepositoryPath, blockedPaths: ReadonlySet<string>): boolean => {
  let candidate: string = path;

  while (candidate.length > 0) {
    if (blockedPaths.has(candidate)) {
      return true;
    }

    const separatorIndex = candidate.lastIndexOf('/');
    if (separatorIndex <= 0) {
      return false;
    }

    candidate = candidate.slice(0, separatorIndex);
  }

  return false;
};

/** Creates normalized diagnostic details for one failed exact lookup. */
const createCandidateDetails = (
  candidate: IRepositoryCandidate,
  entry: IRepositoryEntry | null,
): Readonly<Record<string, string>> => {
  const pathProperty = candidate.kind === 'impact' ? 'impactPath' : 'referencedPath';
  const details: Record<string, string> = { [pathProperty]: candidate.path };

  if (entry !== null) {
    details['actualType'] = entry.type;
  }

  if (candidate.kind === 'tool-implementation' || candidate.kind === 'skill-implementation') {
    details['reason'] =
      entry === null ? 'missing' : entry.type === 'symlink' ? 'symlink' : 'not-file';
  }

  return details;
};

/** Selects the most-specific diagnostic code for one failed exact lookup. */
const getCandidateCode = (
  candidate: IRepositoryCandidate,
  entry: IRepositoryEntry | null,
): ICoreDiagnosticCode | null => {
  if (entry?.type === 'file') {
    return null;
  }

  if (candidate.kind === 'tool-implementation') {
    return 'MOLDEA_TOOL_IMPLEMENTATION_MISSING';
  }

  if (candidate.kind === 'skill-implementation') {
    return 'MOLDEA_SKILL_IMPLEMENTATION_MISSING';
  }

  if (candidate.kind === 'impact') {
    return entry === null ? 'MOLDEA_IMPACT_PATH_MISSING' : 'MOLDEA_IMPACT_PATH_NOT_FILE';
  }

  if (entry === null) {
    return 'MOLDEA_REFERENCE_MISSING';
  }

  return entry.type === 'symlink' ? 'MOLDEA_REFERENCE_SYMLINK' : 'MOLDEA_REFERENCE_NOT_FILE';
};

/** Adds the one most-specific diagnostic for a resolved repository candidate. */
const validateCandidate = (
  candidate: IRepositoryCandidate,
  entry: IRepositoryEntry | null,
  manifestPath: IRepositoryPath,
  collector: ICoreDiagnosticCollector,
): void => {
  const code = getCandidateCode(candidate, entry);

  if (code === null) {
    return;
  }

  collector.add({
    code,
    details: createCandidateDetails(candidate, entry),
    entity: candidate.entity,
    path: manifestPath,
    pointer: candidate.pointer,
  });
};

/**
 * Validates every manifest repository reference, binding, and exact impact path.
 * @param repository The budget-aware reader for the active inspection session.
 * @param manifestPath The canonical manifest path used for diagnostics.
 * @param manifest The normalized valid manifest contract to inspect.
 * @param discovery Canonical discovery state used to suppress dependent path diagnostics.
 * @param limits The resource limits applied to emitted diagnostics.
 * @param signal Optional cancellation forwarded to exact repository lookups.
 * @returns Deeply immutable deterministic repository-reference diagnostics.
 * @throws
 * - INVALID_REPOSITORY_PATH: A repository path is invalid.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during validation.
 * - INVALID_SOURCE_DATA: The repository reader returned invalid contract data.
 * - RESOURCE_LIMIT_EXCEEDED: A Core or repository resource limit was exceeded.
 * - ABORTED: Repository inspection or a repository lookup was aborted.
 */
export const validateRepositoryReferences = async (
  repository: IRepositoryReader,
  manifestPath: IRepositoryPath,
  manifest: IMoldeaManifestV1,
  discovery: ICanonicalDiscoveryResult,
  limits: ICoreResourceLimits,
  signal?: AbortSignal,
): Promise<readonly ICoreDiagnostic[]> => {
  const collector = createCoreDiagnosticCollector(limits, 'inspect-project');
  const blockedPaths = new Set(
    discovery.diagnostics.flatMap((diagnostic) =>
      diagnostic.path === null ? [] : [diagnostic.path],
    ),
  );
  const entryCache = new Map<IRepositoryPath, Promise<IRepositoryEntry | null>>();
  const operationOptions: IRepositoryOperationOptions | undefined =
    signal === undefined ? undefined : { signal };

  for (const candidate of collectCandidates(manifest)) {
    if (isBlockedPath(candidate.path, blockedPaths)) {
      continue;
    }

    let entryPromise = entryCache.get(candidate.path);

    if (entryPromise === undefined) {
      entryPromise = repository.getEntry(candidate.path, operationOptions);
      entryCache.set(candidate.path, entryPromise);
    }

    validateCandidate(candidate, await entryPromise, manifestPath, collector);
  }

  return collector.finalize();
};
