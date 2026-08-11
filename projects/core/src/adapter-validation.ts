import {
  RepositoryPathException,
  RepositorySourceException,
  isRepositoryPath,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import type { IFrameworkAdapterEvidence, IFrameworkAdapterEvidenceKind } from './adapter.js';
import type { ICoreResourceLimits, IIndexedAgent, IMoldeaProjectIndex } from './contracts.js';
import {
  normalizeDiagnosticDetails,
  normalizeDiagnosticEntity,
  normalizeDiagnostics,
} from './diagnostic-utilities.js';
import type {
  IAdapterDiagnostic,
  IDiagnosticEntity,
  ISourcePosition,
  ISourceRange,
} from './diagnostics.js';
import { CoreOperationException } from './exceptions.js';
import {
  compareExactStrings,
  isCanonicalMoldeaPath,
  isNonEmptySingleLine,
  isRepositorySymbol,
  isUnicodeScalarText,
  sortRepositoryReferences,
} from './format-validation.js';
import type { IRepositoryReference } from './format.js';
import { createNullPrototypeRecord, freezeRecursively } from './immutable.js';

// closed adapter output fields, evidence kinds, and scalar patterns
const EVIDENCE_KINDS = new Set<IFrameworkAdapterEvidenceKind>([
  'framework-package',
  'language',
  'agent-definition',
  'instruction-loader',
  'schema',
  'tool-registration',
  'skill-registration',
  'handoff-registration',
  'variable-provider',
  'runtime-pattern',
]);
const DIAGNOSTIC_ENTITY_KEYS = new Set<keyof IDiagnosticEntity>([
  'agentId',
  'capabilityKind',
  'capabilityId',
  'decisionId',
  'variableId',
  'adapterId',
]);
const POSITION_KEYS = new Set(['line', 'column', 'offset']);
const RANGE_KEYS = new Set(['start', 'end']);
const REFERENCE_KEYS = new Set(['path', 'symbol']);
const EVIDENCE_KEYS = new Set([
  'source',
  'kind',
  'agentId',
  'capabilityKind',
  'capabilityId',
  'runtimeName',
  'references',
  'details',
]);
const DIAGNOSTIC_KEYS = new Set([
  'source',
  'code',
  'message',
  'path',
  'pointer',
  'range',
  'entity',
  'details',
]);
const ADAPTER_RESULT_KEYS = new Set(['evidence', 'diagnostics']);
const EDGE_WHITESPACE_PATTERN = /(?:^\p{White_Space}|\p{White_Space}$)/u;
const ADAPTER_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/u;

// normalized output retained after one adapter result passes Core validation
export interface IValidatedFrameworkAdapterResult {
  readonly evidence: readonly IFrameworkAdapterEvidence[];
  readonly diagnostics: readonly IAdapterDiagnostic[];
}

interface IAdapterValidationContext {
  readonly adapterId: string;
  readonly agents: readonly IIndexedAgent[];
  readonly project: IMoldeaProjectIndex;
  readonly repository: IRepositoryReader;
  readonly limits: ICoreResourceLimits;
  readonly signal?: AbortSignal;
}

interface IAdapterValidationState extends IAdapterValidationContext {
  readonly agentsById: ReadonlyMap<string, IIndexedAgent>;
  readonly decisionIds: ReadonlySet<string>;
}

const isRecord = (candidate: unknown): candidate is Readonly<Record<string, unknown>> => {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
};

const invalidAdapterResult = (adapterId: string): never => {
  throw new CoreOperationException({
    adapterId,
    cause: new TypeError('The framework adapter result is invalid.'),
    code: 'ADAPTER_EXECUTION_FAILED',
    operation: 'validate-adapter',
    retryable: false,
  });
};

const hasOnlyKeys = (
  candidate: Readonly<Record<string, unknown>>,
  keys: ReadonlySet<string>,
): boolean => {
  return Reflect.ownKeys(candidate).every((key) => typeof key === 'string' && keys.has(key));
};

const isSafeString = (candidate: unknown): candidate is string => {
  return (
    typeof candidate === 'string' && isUnicodeScalarText(candidate) && !candidate.includes('\0')
  );
};

const normalizeDetails = (candidate: unknown, adapterId: string) => {
  if (!isRecord(candidate)) {
    return invalidAdapterResult(adapterId);
  }

  const entries: [string, string | number | boolean | null][] = [];

  for (const key of Reflect.ownKeys(candidate)) {
    if (typeof key !== 'string' || !isUnicodeScalarText(key) || key.includes('\0')) {
      return invalidAdapterResult(adapterId);
    }

    const descriptor = Object.getOwnPropertyDescriptor(candidate, key);

    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return invalidAdapterResult(adapterId);
    }

    const detail = descriptor.value as unknown;

    if (
      detail !== null &&
      typeof detail !== 'boolean' &&
      !(typeof detail === 'string' && isUnicodeScalarText(detail) && !detail.includes('\0')) &&
      !(typeof detail === 'number' && Number.isFinite(detail))
    ) {
      return invalidAdapterResult(adapterId);
    }

    entries.push([key, typeof detail === 'number' && Object.is(detail, -0) ? 0 : detail]);
  }

  return normalizeDiagnosticDetails(createNullPrototypeRecord(entries));
};

const normalizePosition = (candidate: unknown, adapterId: string): ISourcePosition => {
  if (
    !isRecord(candidate) ||
    !hasOnlyKeys(candidate, POSITION_KEYS) ||
    !Number.isSafeInteger(candidate['line']) ||
    !Number.isSafeInteger(candidate['column']) ||
    !Number.isSafeInteger(candidate['offset']) ||
    (candidate['line'] as number) < 1 ||
    (candidate['column'] as number) < 1 ||
    (candidate['offset'] as number) < 0
  ) {
    return invalidAdapterResult(adapterId);
  }

  return freezeRecursively({
    column: candidate['column'] as number,
    line: candidate['line'] as number,
    offset: candidate['offset'] as number,
  });
};

const normalizeRange = (candidate: unknown, adapterId: string): ISourceRange | null => {
  if (candidate === null) {
    return null;
  }

  if (!isRecord(candidate) || !hasOnlyKeys(candidate, RANGE_KEYS)) {
    return invalidAdapterResult(adapterId);
  }

  const start = normalizePosition(candidate['start'], adapterId);
  const end = normalizePosition(candidate['end'], adapterId);
  const hasOrderedLines =
    end.line > start.line || (end.line === start.line && end.column >= start.column);

  if (!hasOrderedLines || end.offset < start.offset) {
    return invalidAdapterResult(adapterId);
  }

  return freezeRecursively({ end, start });
};

const isJsonPointer = (candidate: string): boolean => {
  return (
    isUnicodeScalarText(candidate) &&
    !candidate.includes('\0') &&
    (candidate === '' || (candidate.startsWith('/') && !/~(?![01])/u.test(candidate)))
  );
};

const readCapability = (
  agent: IIndexedAgent,
  capabilityKind: 'tool' | 'skill',
  capabilityId: string,
): unknown => {
  const capabilities =
    capabilityKind === 'tool' ? agent.declaration.tools : agent.declaration.skills;

  return capabilities !== undefined && Object.hasOwn(capabilities, capabilityId)
    ? capabilities[capabilityId]
    : undefined;
};

const normalizeEntity = (
  candidate: unknown,
  context: IAdapterValidationState,
): IDiagnosticEntity | null => {
  if (candidate === null) {
    return null;
  }

  if (!isRecord(candidate) || !hasOnlyKeys(candidate, DIAGNOSTIC_ENTITY_KEYS)) {
    return invalidAdapterResult(context.adapterId);
  }

  const entity: Record<string, string> = {};

  for (const key of DIAGNOSTIC_ENTITY_KEYS) {
    const candidateValue = candidate[key];

    if (candidateValue === undefined) {
      continue;
    }

    if (!isSafeString(candidateValue) || candidateValue.length === 0) {
      return invalidAdapterResult(context.adapterId);
    }

    entity[key] = candidateValue;
  }

  const agentId = entity['agentId'];
  const agent = agentId === undefined ? undefined : context.agentsById.get(agentId);

  if (agentId !== undefined && agent === undefined) {
    return invalidAdapterResult(context.adapterId);
  }

  if (entity['adapterId'] !== undefined && entity['adapterId'] !== context.adapterId) {
    return invalidAdapterResult(context.adapterId);
  }

  const capabilityKind = entity['capabilityKind'];
  const capabilityId = entity['capabilityId'];

  if (
    (capabilityKind === undefined) !== (capabilityId === undefined) ||
    (capabilityKind !== undefined && capabilityKind !== 'tool' && capabilityKind !== 'skill') ||
    (capabilityKind !== undefined &&
      capabilityId !== undefined &&
      (agent === undefined || readCapability(agent, capabilityKind, capabilityId) === undefined))
  ) {
    return invalidAdapterResult(context.adapterId);
  }

  const variableId = entity['variableId'];

  if (
    variableId !== undefined &&
    (agent === undefined ||
      agent.declaration.variables === undefined ||
      !Object.hasOwn(agent.declaration.variables, variableId))
  ) {
    return invalidAdapterResult(context.adapterId);
  }

  const decisionId = entity['decisionId'];

  if (decisionId !== undefined && !context.decisionIds.has(decisionId)) {
    return invalidAdapterResult(context.adapterId);
  }

  return normalizeDiagnosticEntity(entity);
};

const normalizeReference = (candidate: unknown, adapterId: string): IRepositoryReference => {
  if (!isRecord(candidate) || !hasOnlyKeys(candidate, REFERENCE_KEYS)) {
    return invalidAdapterResult(adapterId);
  }

  const pathCandidate = candidate['path'];
  const symbolCandidate = candidate['symbol'];

  if (typeof pathCandidate !== 'string' || !isRepositoryPath(pathCandidate)) {
    return invalidAdapterResult(adapterId);
  }

  const path = parseRepositoryPath(pathCandidate);

  if (
    symbolCandidate !== undefined &&
    (typeof symbolCandidate !== 'string' ||
      !isUnicodeScalarText(symbolCandidate) ||
      !isRepositorySymbol(symbolCandidate) ||
      isCanonicalMoldeaPath(path))
  ) {
    return invalidAdapterResult(adapterId);
  }

  return freezeRecursively({
    path,
    ...(symbolCandidate === undefined ? {} : { symbol: symbolCandidate }),
  });
};

const normalizeReferences = (
  candidate: unknown,
  adapterId: string,
): readonly IRepositoryReference[] => {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    return invalidAdapterResult(adapterId);
  }

  const references = candidate.map((reference) => normalizeReference(reference, adapterId));
  const referenceKeys = new Set<string>();

  for (const reference of references) {
    const key = JSON.stringify(reference);

    if (referenceKeys.has(key)) {
      return invalidAdapterResult(adapterId);
    }

    referenceKeys.add(key);
  }

  return freezeRecursively(sortRepositoryReferences(references));
};

const normalizeEvidence = (
  candidate: unknown,
  context: IAdapterValidationState,
): IFrameworkAdapterEvidence => {
  if (!isRecord(candidate) || !hasOnlyKeys(candidate, EVIDENCE_KEYS)) {
    return invalidAdapterResult(context.adapterId);
  }

  const source = candidate['source'];
  const kind = candidate['kind'];
  const agentId = candidate['agentId'];
  const capabilityKind = candidate['capabilityKind'];
  const capabilityId = candidate['capabilityId'];
  const runtimeName = candidate['runtimeName'];

  if (
    source !== context.adapterId ||
    typeof kind !== 'string' ||
    !EVIDENCE_KINDS.has(kind as IFrameworkAdapterEvidenceKind) ||
    (agentId !== null && !isSafeString(agentId)) ||
    (capabilityKind !== null && capabilityKind !== 'tool' && capabilityKind !== 'skill') ||
    (capabilityId !== null && !isSafeString(capabilityId)) ||
    (runtimeName !== null &&
      (!isSafeString(runtimeName) ||
        !isNonEmptySingleLine(runtimeName) ||
        EDGE_WHITESPACE_PATTERN.test(runtimeName)))
  ) {
    return invalidAdapterResult(context.adapterId);
  }

  const scopedAgent = agentId === null ? undefined : context.agentsById.get(agentId);

  if (
    (agentId !== null && scopedAgent === undefined) ||
    (capabilityKind === null) !== (capabilityId === null) ||
    (capabilityKind !== null &&
      capabilityId !== null &&
      (scopedAgent === undefined ||
        readCapability(scopedAgent, capabilityKind, capabilityId) === undefined))
  ) {
    return invalidAdapterResult(context.adapterId);
  }

  return freezeRecursively({
    agentId,
    capabilityId,
    capabilityKind,
    details: normalizeDetails(candidate['details'], context.adapterId),
    kind: kind as IFrameworkAdapterEvidenceKind,
    references: normalizeReferences(candidate['references'], context.adapterId),
    runtimeName,
    source,
  });
};

const validateEvidenceReferences = async (
  evidence: readonly IFrameworkAdapterEvidence[],
  context: IAdapterValidationState,
): Promise<void> => {
  const entries = new Map<IRepositoryPath, IRepositoryEntry | null>();
  const operationOptions = context.signal === undefined ? undefined : { signal: context.signal };

  for (const item of evidence) {
    for (const reference of item.references) {
      let entry = entries.get(reference.path);

      if (entry === undefined && !entries.has(reference.path)) {
        entry = await context.repository.getEntry(reference.path, operationOptions);
        entries.set(reference.path, entry);
      }

      if (entry?.type !== 'file') {
        return invalidAdapterResult(context.adapterId);
      }
    }
  }
};

const normalizeDiagnostic = (
  candidate: unknown,
  context: IAdapterValidationState,
): IAdapterDiagnostic => {
  if (!isRecord(candidate) || !hasOnlyKeys(candidate, DIAGNOSTIC_KEYS)) {
    return invalidAdapterResult(context.adapterId);
  }

  const source = candidate['source'];
  const code = candidate['code'];
  const message = candidate['message'];
  const pathCandidate = candidate['path'];
  const pointer = candidate['pointer'];
  const namespace = `${context.adapterId.toUpperCase().replaceAll('-', '_')}_`;

  if (
    source !== context.adapterId ||
    !isSafeString(code) ||
    !ADAPTER_CODE_PATTERN.test(code) ||
    !code.startsWith(namespace) ||
    code.length === namespace.length ||
    !isSafeString(message) ||
    message.length === 0 ||
    (pathCandidate !== null &&
      (typeof pathCandidate !== 'string' || !isRepositoryPath(pathCandidate))) ||
    (pointer !== null && (typeof pointer !== 'string' || !isJsonPointer(pointer)))
  ) {
    return invalidAdapterResult(context.adapterId);
  }

  const path = pathCandidate === null ? null : parseRepositoryPath(pathCandidate);
  const range = normalizeRange(candidate['range'], context.adapterId);

  if (path === null && (pointer !== null || range !== null)) {
    return invalidAdapterResult(context.adapterId);
  }

  return freezeRecursively({
    code,
    details: normalizeDetails(candidate['details'], context.adapterId),
    entity: normalizeEntity(candidate['entity'], context),
    message,
    path,
    pointer,
    range,
    source,
  });
};

const compareNullableStrings = (left: string | null, right: string | null): number => {
  return left === null
    ? right === null
      ? 0
      : -1
    : right === null
      ? 1
      : compareExactStrings(left, right);
};

const compareEvidence = (
  left: IFrameworkAdapterEvidence,
  right: IFrameworkAdapterEvidence,
): number => {
  return (
    compareExactStrings(left.source, right.source) ||
    compareExactStrings(left.kind, right.kind) ||
    compareNullableStrings(left.agentId, right.agentId) ||
    compareNullableStrings(left.capabilityKind, right.capabilityKind) ||
    compareNullableStrings(left.capabilityId, right.capabilityId) ||
    compareNullableStrings(left.runtimeName, right.runtimeName) ||
    compareExactStrings(JSON.stringify(left.references), JSON.stringify(right.references)) ||
    compareExactStrings(JSON.stringify(left.details), JSON.stringify(right.details))
  );
};

/**
 * Deduplicates and sorts normalized evidence from every completed adapter.
 * @param candidates The normalized evidence items to combine.
 * @returns A frozen deterministic evidence collection.
 */
export const normalizeFrameworkAdapterEvidence = (
  candidates: readonly IFrameworkAdapterEvidence[],
): readonly IFrameworkAdapterEvidence[] => {
  const evidence = new Map<string, IFrameworkAdapterEvidence>();

  for (const item of candidates) {
    evidence.set(JSON.stringify(item), item);
  }

  return freezeRecursively([...evidence.values()].sort(compareEvidence));
};

/**
 * Validates and normalizes one untrusted framework adapter result.
 * @param candidate The result returned by the adapter implementation.
 * @param context The invoking adapter scope, project, reader, limits, and signal.
 * @returns A promise resolving to frozen deterministic evidence and diagnostics.
 * @throws
 * - INVALID_REPOSITORY_PATH: An adapter repository reference path is invalid.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during validation.
 * - INVALID_SOURCE_DATA: The repository reader returned invalid contract data.
 * - RESOURCE_LIMIT_EXCEEDED: A Core or repository resource limit was exceeded.
 * - ABORTED: Adapter validation or a repository operation was aborted.
 * - ADAPTER_EXECUTION_FAILED: The adapter result violates its public contract.
 */
export const validateFrameworkAdapterResult = async (
  candidate: unknown,
  context: IAdapterValidationContext,
): Promise<IValidatedFrameworkAdapterResult> => {
  let diagnostics: readonly IAdapterDiagnostic[];
  let evidence: readonly IFrameworkAdapterEvidence[];
  let validationState: IAdapterValidationState;

  try {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, ADAPTER_RESULT_KEYS)) {
      return invalidAdapterResult(context.adapterId);
    }

    const evidenceValue: unknown = candidate['evidence'];
    const diagnosticsValue: unknown = candidate['diagnostics'];

    if (!Array.isArray(evidenceValue) || !Array.isArray(diagnosticsValue)) {
      return invalidAdapterResult(context.adapterId);
    }

    const evidenceCandidates: readonly unknown[] = evidenceValue;
    const diagnosticCandidates: readonly unknown[] = diagnosticsValue;
    validationState = {
      ...context,
      agentsById: new Map(context.agents.map((agent) => [agent.id, agent])),
      decisionIds: new Set(context.project.decisions.map(({ decision }) => decision.id)),
    };
    diagnostics = diagnosticCandidates.map((diagnostic) =>
      normalizeDiagnostic(diagnostic, validationState),
    );
    evidence = normalizeFrameworkAdapterEvidence(
      evidenceCandidates.map((evidenceCandidate) =>
        normalizeEvidence(evidenceCandidate, validationState),
      ),
    );
  } catch {
    return invalidAdapterResult(context.adapterId);
  }

  try {
    await validateEvidenceReferences(evidence, validationState);

    return freezeRecursively({
      diagnostics: normalizeDiagnostics(diagnostics, context.limits, 'validate-adapter'),
      evidence,
    });
  } catch (error: unknown) {
    if (
      error instanceof RepositoryPathException ||
      error instanceof RepositorySourceException ||
      error instanceof CoreOperationException
    ) {
      throw error;
    }

    return invalidAdapterResult(context.adapterId);
  }
};
