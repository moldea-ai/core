import { parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import type {
  IContentDigest,
  IContentDigestResult,
  ICoreResourceLimits,
  INormalizedText,
  ITextDocumentInput,
  ITextNormalizationResult,
} from './contracts.js';
import type { ICoreDiagnostic, ICoreDiagnosticCode, ISourceRange } from './diagnostics.js';
import { CoreOperationException, type ICoreOperation } from './exceptions.js';
import { createNullPrototypeRecord, freezeRecursively } from './immutable.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

const TEXT_DIAGNOSTIC_MESSAGES = {
  MOLDEA_TEXT_INVALID_UNICODE:
    'The text document contains an invalid Unicode scalar representation.',
  MOLDEA_TEXT_INVALID_UTF8: 'The text document is not valid UTF-8.',
  MOLDEA_TEXT_NUL_FORBIDDEN: 'The text document contains a forbidden NUL character.',
} as const satisfies Readonly<
  Record<
    'MOLDEA_TEXT_INVALID_UNICODE' | 'MOLDEA_TEXT_INVALID_UTF8' | 'MOLDEA_TEXT_NUL_FORBIDDEN',
    string
  >
>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/**
 * Measures valid scalar UTF-8 bytes and stops once the operation budget is exceeded.
 * @param value The decoded string to measure without lossy replacement.
 * @param maximumByteLength The threshold after which measurement may stop early.
 * @returns The measured bytes, a value above the threshold, or `null` for invalid Unicode.
 */
const measureScalarUtf8ByteLength = (value: string, maximumByteLength: number): number | null => {
  let byteLength = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) {
        return null;
      }

      const nextCodeUnit = value.charCodeAt(index + 1);

      if (nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) {
        return null;
      }

      byteLength += 4;

      if (byteLength > maximumByteLength) {
        return byteLength;
      }

      index += 1;
      continue;
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return null;
    }

    byteLength += codeUnit <= 0x7f ? 1 : codeUnit <= 0x7ff ? 2 : 3;

    if (byteLength > maximumByteLength) {
      return byteLength;
    }
  }

  return byteLength;
};

const countUnicodeScalars = (value: string): number => {
  let count = 0;

  for (let index = 0; index < value.length; count += 1) {
    const codePoint = value.codePointAt(index);

    if (codePoint === undefined) {
      break;
    }

    index += codePoint > 0xffff ? 2 : 1;
  }

  return count;
};

/**
 * Collects every normalized NUL location or rejects when the diagnostic budget is exhausted.
 * @param value The normalized scalar text to inspect.
 * @param path The logical document path attached to each diagnostic.
 * @param limits The immutable Core resource limits.
 * @param operation The public operation requesting validation.
 * @returns Frozen structural diagnostics for every NUL scalar.
 * @throws
 * - RESOURCE_LIMIT_EXCEEDED: A Core resource limit was exceeded.
 */
const collectNulDiagnostics = (
  value: string,
  path: IRepositoryPath,
  limits: ICoreResourceLimits,
  operation: ICoreOperation,
): readonly ICoreDiagnostic[] => {
  const diagnostics: ICoreDiagnostic[] = [];
  let column = 1;
  let line = 1;
  let offset = 0;

  for (const scalar of value) {
    if (scalar === '\0') {
      if (diagnostics.length >= limits.maxDiagnostics) {
        throw new CoreOperationException({
          code: 'RESOURCE_LIMIT_EXCEEDED',
          limit: 'maxDiagnostics',
          operation,
          retryable: false,
        });
      }

      diagnostics.push(
        createDiagnostic('MOLDEA_TEXT_NUL_FORBIDDEN', path, {
          end: { column: column + 1, line, offset: offset + 1 },
          start: { column, line, offset },
        }),
      );
    }

    if (scalar === '\n') {
      column = 1;
      line += 1;
    } else {
      column += 1;
    }

    offset += 1;
  }

  return diagnostics;
};

const createDiagnostic = (
  code: ICoreDiagnosticCode,
  path: IRepositoryPath,
  range: ISourceRange | null = null,
): ICoreDiagnostic => {
  const message = TEXT_DIAGNOSTIC_MESSAGES[code as keyof typeof TEXT_DIAGNOSTIC_MESSAGES];

  if (message === undefined) {
    throw new Error('The requested text diagnostic is not implemented.');
  }

  return freezeRecursively({
    code,
    details: createNullPrototypeRecord([]),
    entity: null,
    message,
    path,
    pointer: null,
    range,
    source: 'core' as const,
  });
};

const invalidArgument = (operation: ICoreOperation): never => {
  throw new CoreOperationException({
    code: 'INVALID_ARGUMENT',
    operation,
    retryable: false,
  });
};

const enforceFileLimit = (
  byteLength: number,
  limits: ICoreResourceLimits,
  operation: ICoreOperation,
): void => {
  if (byteLength <= limits.maxFileBytes) {
    return;
  }

  throw new CoreOperationException({
    code: 'RESOURCE_LIMIT_EXCEEDED',
    limit: 'maxFileBytes',
    operation,
    retryable: false,
  });
};

const invalidResult = (
  diagnostics: readonly ICoreDiagnostic[],
  limits: ICoreResourceLimits,
  operation: ICoreOperation,
): ITextNormalizationResult => {
  if (diagnostics.length > limits.maxDiagnostics) {
    throw new CoreOperationException({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxDiagnostics',
      operation,
      retryable: false,
    });
  }

  return freezeRecursively({
    diagnostics: [...diagnostics],
    text: null,
    valid: false,
  });
};

/**
 * Validates one public text input, enforces its source-byte budget, and decodes strict UTF-8.
 * @param input The untrusted public text-document input.
 * @param limits The immutable Core resource limits.
 * @param operation The public operation requesting the input.
 * @returns Decoded text or a frozen structural failure result.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - INVALID_ARGUMENT: The Core operation received an invalid argument.
 * - RESOURCE_LIMIT_EXCEEDED: A Core resource limit was exceeded.
 */
const readInput = (
  input: ITextDocumentInput,
  limits: ICoreResourceLimits,
  operation: ICoreOperation,
): { readonly path: IRepositoryPath; readonly value: string } | ITextNormalizationResult => {
  if (!isRecord(input)) {
    return invalidArgument(operation);
  }

  const pathCandidate = input['path'];
  const content = input['content'];

  if (
    typeof pathCandidate !== 'string' ||
    (typeof content !== 'string' && !(content instanceof Uint8Array))
  ) {
    return invalidArgument(operation);
  }

  const path = parseRepositoryPath(pathCandidate);

  if (typeof content === 'string') {
    const byteLength = measureScalarUtf8ByteLength(content, limits.maxFileBytes);

    if (byteLength === null) {
      return invalidResult(
        [createDiagnostic('MOLDEA_TEXT_INVALID_UNICODE', path)],
        limits,
        operation,
      );
    }

    enforceFileLimit(byteLength, limits, operation);
    return { path, value: content };
  }

  enforceFileLimit(content.byteLength, limits, operation);
  const bytes = new Uint8Array(content);

  try {
    return { path, value: decoder.decode(bytes) };
  } catch {
    return invalidResult([createDiagnostic('MOLDEA_TEXT_INVALID_UTF8', path)], limits, operation);
  }
};

/**
 * Validates and normalizes one text document under an operation-specific resource budget.
 * @param input The logical path and decoded string or exact source bytes.
 * @param limits The immutable Core resource limits.
 * @param operation The public Core operation requesting normalization.
 * @returns A frozen normalized result or structural text diagnostics.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - INVALID_ARGUMENT: The Core operation received an invalid argument.
 * - RESOURCE_LIMIT_EXCEEDED: A Core resource limit was exceeded.
 */
export const normalizeTextDocument = (
  input: ITextDocumentInput,
  limits: ICoreResourceLimits,
  operation: ICoreOperation,
): ITextNormalizationResult => {
  const decoded = readInput(input, limits, operation);

  if ('valid' in decoded) {
    return decoded;
  }

  const withoutLeadingBom = decoded.value.startsWith('\ufeff')
    ? decoded.value.slice(1)
    : decoded.value;
  const value = withoutLeadingBom.replace(/\r\n?/gu, '\n');
  const diagnostics = collectNulDiagnostics(value, decoded.path, limits, operation);

  if (diagnostics.length > 0) {
    return invalidResult(diagnostics, limits, operation);
  }

  const text: INormalizedText = freezeRecursively({
    scalarLength: countUnicodeScalars(value),
    utf8ByteLength: encoder.encode(value).byteLength,
    value,
  });

  return freezeRecursively({
    diagnostics: [],
    text,
    valid: true,
  });
};

const toLowercaseHex = (bytes: Uint8Array): string => {
  let value = '';

  for (const byte of bytes) {
    value += byte.toString(16).padStart(2, '0');
  }

  return value;
};

/**
 * Calculates the normalized SHA-256 digest for one text document.
 * @param input The logical path and decoded string or exact source bytes.
 * @param limits The immutable Core resource limits.
 * @returns A promise resolving to a frozen digest result or structural text diagnostics.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - INVALID_ARGUMENT: The Core operation received an invalid argument.
 * - RESOURCE_LIMIT_EXCEEDED: A Core resource limit was exceeded.
 */
export const calculateContentDigest = async (
  input: ITextDocumentInput,
  limits: ICoreResourceLimits,
): Promise<IContentDigestResult> => {
  const normalized = normalizeTextDocument(input, limits, 'calculate-content-digest');

  if (!normalized.valid || normalized.text === null) {
    return freezeRecursively({
      diagnostics: normalized.diagnostics,
      digest: null,
      text: null,
      valid: false,
    });
  }

  const bytes = encoder.encode(normalized.text.value);
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  const digest = `sha256:${toLowercaseHex(hash)}` as IContentDigest;

  return freezeRecursively({
    diagnostics: [],
    digest,
    text: normalized.text,
    valid: true,
  });
};
