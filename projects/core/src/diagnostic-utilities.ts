import type { IRepositoryPath } from '@moldea.ai/repository';

import type { ICoreResourceLimits } from './contracts.js';
import type {
  ICoreDiagnostic,
  ICoreDiagnosticCode,
  IDiagnosticDetails,
  IDiagnosticEntity,
  ISourceRange,
} from './diagnostics.js';
import { CoreOperationException, type ICoreOperation } from './exceptions.js';
import { compareExactStrings } from './format-validation.js';
import { createNullPrototypeRecord, freezeRecursively } from './immutable.js';

const CORE_DIAGNOSTIC_MESSAGES: Partial<Record<ICoreDiagnosticCode, string>> = {
  MOLDEA_AGENT_HANDOFF_DESCRIPTION_INVALID: 'The agent handoff description is invalid.',
  MOLDEA_CAPABILITY_DESCRIPTION_INVALID: 'The capability description is invalid.',
  MOLDEA_CAPABILITY_DESCRIPTION_MISSING: 'The capability description is missing.',
  MOLDEA_CONTEXT_PATH_INVALID: 'The context relationship path is invalid.',
  MOLDEA_CONTEXT_RELATIONSHIP_EMPTY: 'The declared relationship has no bindings or impact paths.',
  MOLDEA_DECISION_FILENAME_INVALID: 'The decision path or filename is invalid.',
  MOLDEA_FRAMEWORK_ADAPTER_FORMAT_UNSUPPORTED:
    'The configured framework adapter does not support the repository format version.',
  MOLDEA_FRAMEWORK_ADAPTER_UNAVAILABLE: 'The declared framework adapter is unavailable.',
  MOLDEA_FRAMEWORK_ID_INVALID: 'The framework adapter ID is invalid.',
  MOLDEA_GLOB_INVALID: 'The impact pattern is invalid.',
  MOLDEA_ID_DUPLICATE: 'An ID is duplicated within its required scope.',
  MOLDEA_ID_INVALID: 'The ID is invalid.',
  MOLDEA_ID_RESERVED: 'The ID uses a reserved filesystem name.',
  MOLDEA_MANIFEST_PATH_INVALID: 'The manifest path is not the canonical manifest path.',
  MOLDEA_MANIFEST_PROPERTY_UNKNOWN: 'The manifest contains an unknown property.',
  MOLDEA_MANIFEST_ROOT_INVALID: 'The manifest root is not a mapping.',
  MOLDEA_MANIFEST_VALUE_INVALID: 'The manifest value is invalid.',
  MOLDEA_MANIFEST_VERSION_INVALID: 'The manifest version is not a valid integer major version.',
  MOLDEA_MANIFEST_VERSION_MISSING: 'The manifest version is missing.',
  MOLDEA_MANIFEST_VERSION_UNSUPPORTED: 'The manifest version is unsupported.',
  MOLDEA_MIRROR_PATH_DUPLICATE: 'The mirror path is assigned more than once.',
  MOLDEA_MIRROR_PATH_INSIDE_MOLDEA: 'The mirror path is inside /moldea.',
  MOLDEA_MIRROR_PATH_INVALID: 'The mirror path is invalid.',
  MOLDEA_PATH_DUPLICATE: 'The path is duplicated.',
  MOLDEA_PATH_INVALID: 'The manifest logical path is invalid.',
  MOLDEA_PATTERN_DUPLICATE: 'The impact pattern is duplicated.',
  MOLDEA_SKILL_IMPLEMENTATION_MISSING: 'The registered skill implementation is missing.',
  MOLDEA_SYMBOL_FORBIDDEN: 'A canonical moldea reference must not include a symbol.',
  MOLDEA_SYMBOL_INVALID: 'The repository-reference symbol is invalid.',
  MOLDEA_TEXT_INVALID_UNICODE:
    'The text document contains an invalid Unicode scalar representation.',
  MOLDEA_TEXT_INVALID_UTF8: 'The text document is not valid UTF-8.',
  MOLDEA_TEXT_NUL_FORBIDDEN: 'The text document contains a forbidden NUL character.',
  MOLDEA_TOOL_IMPLEMENTATION_MISSING: 'The registered tool implementation is missing.',
  MOLDEA_VARIABLE_ID_INVALID: 'The runtime-variable ID is invalid.',
  MOLDEA_VARIABLE_PROVIDER_UNDECLARED:
    'A variable-provider binding exists for an undeclared variable.',
  MOLDEA_YAML_DUPLICATE_KEY: 'The YAML document contains a duplicate mapping key.',
  MOLDEA_YAML_FEATURE_UNSUPPORTED: 'The YAML document uses an unsupported feature.',
  MOLDEA_YAML_MALFORMED: 'The YAML document is malformed.',
  MOLDEA_YAML_MULTIPLE_DOCUMENTS: 'The YAML stream contains more than one document.',
};

const ENTITY_KEYS = [
  'agentId',
  'capabilityKind',
  'capabilityId',
  'decisionId',
  'variableId',
  'adapterId',
] as const satisfies readonly (keyof IDiagnosticEntity)[];

// private normalized diagnostic construction contracts
export interface ICoreDiagnosticInput {
  readonly code: ICoreDiagnosticCode;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
  readonly entity?: IDiagnosticEntity | null;
  readonly path: IRepositoryPath | null;
  readonly pointer?: string | null;
  readonly range?: ISourceRange | null;
}

export interface ICoreDiagnosticCollector {
  add(input: ICoreDiagnosticInput): void;
  finalize(): readonly ICoreDiagnostic[];
  readonly size: number;
}

const compareNullableStrings = (left: string | null, right: string | null): number => {
  if (left === null) {
    return right === null ? 0 : -1;
  }

  return right === null ? 1 : compareExactStrings(left, right);
};

const normalizeDetails = (
  details: Readonly<Record<string, string | number | boolean | null>> | undefined,
): IDiagnosticDetails => {
  const entries = Object.entries(details ?? {})
    .sort(([left], [right]) => compareExactStrings(left, right))
    .map(
      ([key, value]) =>
        [key, typeof value === 'number' && Object.is(value, -0) ? 0 : value] as const,
    );

  return freezeRecursively(createNullPrototypeRecord(entries));
};

const normalizeEntity = (
  entity: IDiagnosticEntity | null | undefined,
): IDiagnosticEntity | null => {
  if (entity === undefined || entity === null) {
    return null;
  }

  const entries = ENTITY_KEYS.flatMap((key) => {
    const value = entity[key];
    return value === undefined ? [] : ([[key, value]] as const);
  });

  return freezeRecursively(createNullPrototypeRecord(entries) as IDiagnosticEntity);
};

const serializeDiagnostic = (diagnostic: ICoreDiagnostic): string => {
  return JSON.stringify({
    code: diagnostic.code,
    details: diagnostic.details,
    entity: diagnostic.entity,
    message: diagnostic.message,
    path: diagnostic.path,
    pointer: diagnostic.pointer,
    range: diagnostic.range,
    source: diagnostic.source,
  });
};

const compareRanges = (left: ISourceRange | null, right: ISourceRange | null): number => {
  if (left === null) {
    return right === null ? 0 : -1;
  }

  if (right === null) {
    return 1;
  }

  return (
    left.start.line - right.start.line ||
    left.start.column - right.start.column ||
    left.start.offset - right.start.offset
  );
};

const readEntityValue = (
  entity: IDiagnosticEntity | null,
  key: keyof IDiagnosticEntity,
): string => {
  return entity?.[key] ?? '';
};

const compareDiagnostics = (left: ICoreDiagnostic, right: ICoreDiagnostic): number => {
  return (
    compareNullableStrings(left.path, right.path) ||
    compareRanges(left.range, right.range) ||
    compareNullableStrings(left.pointer, right.pointer) ||
    compareExactStrings(left.source, right.source) ||
    compareExactStrings(left.code, right.code) ||
    compareExactStrings(
      readEntityValue(left.entity, 'agentId'),
      readEntityValue(right.entity, 'agentId'),
    ) ||
    compareExactStrings(
      readEntityValue(left.entity, 'capabilityKind'),
      readEntityValue(right.entity, 'capabilityKind'),
    ) ||
    compareExactStrings(
      readEntityValue(left.entity, 'capabilityId'),
      readEntityValue(right.entity, 'capabilityId'),
    ) ||
    compareExactStrings(
      readEntityValue(left.entity, 'decisionId'),
      readEntityValue(right.entity, 'decisionId'),
    ) ||
    compareExactStrings(
      readEntityValue(left.entity, 'variableId'),
      readEntityValue(right.entity, 'variableId'),
    ) ||
    compareExactStrings(
      readEntityValue(left.entity, 'adapterId'),
      readEntityValue(right.entity, 'adapterId'),
    ) ||
    compareExactStrings(JSON.stringify(left.details), JSON.stringify(right.details)) ||
    compareExactStrings(left.message, right.message)
  );
};

/**
 * Creates one normalized, immutable Core diagnostic.
 * @param input The trusted Core-owned diagnostic fields to normalize.
 * @returns A deeply immutable public diagnostic value.
 */
export const createCoreDiagnostic = (input: ICoreDiagnosticInput): ICoreDiagnostic => {
  const message = CORE_DIAGNOSTIC_MESSAGES[input.code];

  if (message === undefined) {
    throw new TypeError('The requested Core diagnostic is not implemented.');
  }

  return freezeRecursively({
    code: input.code,
    details: normalizeDetails(input.details),
    entity: normalizeEntity(input.entity),
    message,
    path: input.path,
    pointer: input.pointer ?? null,
    range: input.range ?? null,
    source: 'core' as const,
  });
};

/**
 * Creates a deterministic, deduplicating diagnostic collector for one operation.
 * @param limits The Core resource limits governing diagnostic output.
 * @param operation The operation reported by resource failures.
 * @returns A collector that freezes and sorts its final diagnostic array.
 */
export const createCoreDiagnosticCollector = (
  limits: ICoreResourceLimits,
  operation: ICoreOperation,
): ICoreDiagnosticCollector => {
  const diagnostics = new Map<string, ICoreDiagnostic>();

  return {
    add: (input): void => {
      const diagnostic = createCoreDiagnostic(input);
      const key = serializeDiagnostic(diagnostic);

      if (diagnostics.has(key)) {
        return;
      }

      if (diagnostics.size >= limits.maxDiagnostics) {
        throw new CoreOperationException({
          code: 'RESOURCE_LIMIT_EXCEEDED',
          limit: 'maxDiagnostics',
          operation,
          retryable: false,
        });
      }

      diagnostics.set(key, diagnostic);
    },
    finalize: (): readonly ICoreDiagnostic[] =>
      freezeRecursively([...diagnostics.values()].sort(compareDiagnostics)),
    get size(): number {
      return diagnostics.size;
    },
  };
};

/**
 * Escapes one JSON Pointer reference token.
 * @param value The decoded mapping key or array index token.
 * @returns The RFC 6901 escaped token.
 */
export const escapeJsonPointerSegment = (value: string): string => {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
};
