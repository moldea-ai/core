import {
  executeGitStreamingProcess,
  MAX_GIT_PROCESS_DIAGNOSTIC_BYTES,
  type IGitStreamingProcessExecutor,
  type IGitStreamingProcessFailureReason,
} from '../../git-process/index.js';
import type { IGitInventoryProbeErrorCode } from '../types.js';

import { GIT_CONTENT_TRANSFORMATION_ARGUMENTS } from './constants.js';
import { createGitContentTransformationParser } from './parser.js';
import type {
  IGitContentTransformationClassification,
  IGitContentTransformationClassificationFailedResult,
  IGitContentTransformationClassificationResult,
  IGitContentTransformationClassifier,
} from './types.js';

/** Creates one immutable content-transformation classification failure. */
const createClassificationFailure = (
  errorCode: IGitInventoryProbeErrorCode,
): IGitContentTransformationClassificationFailedResult =>
  Object.freeze({ errorCode, kind: 'failed' });

/** Maps one bounded Git attribute failure to the existing safe inventory contract. */
const mapGitProcessFailure = (
  reason: IGitStreamingProcessFailureReason,
): IGitInventoryProbeErrorCode => {
  switch (reason) {
    case 'not-found':
      return 'GIT_NOT_FOUND';
    case 'access-denied':
      return 'GIT_ACCESS_DENIED';
    case 'repository-not-found':
      return 'GIT_REPOSITORY_NOT_FOUND';
    case 'output-limit-exceeded':
    case 'stdout-limit-exceeded':
      return 'RESOURCE_LIMIT_EXCEEDED';
    case 'stderr-limit-exceeded':
      return 'GIT_OUTPUT_INVALID';
    case 'command-failed':
      return 'GIT_COMMAND_FAILED';
  }
};

/** Determines whether one effective attribute value requires guarded reads. */
const isGuardedAttributeValue = (attributeValue: string): boolean =>
  attributeValue !== 'unset' && attributeValue !== 'unspecified';

/** Encodes exact Git-relative paths as NUL-delimited stdin without shell interpretation. */
const encodePaths = (paths: readonly string[]): Uint8Array | null => {
  const encoder = new TextEncoder();
  const encodedPaths: Uint8Array[] = [];
  let byteLength = 0;

  for (const path of paths) {
    if (path.length === 0 || path.includes('\u0000')) {
      return null;
    }

    const encodedPath = encoder.encode(path);

    if (!Number.isSafeInteger(byteLength + encodedPath.byteLength + 1)) {
      return null;
    }

    encodedPaths.push(encodedPath);
    byteLength += encodedPath.byteLength + 1;
  }

  const stdin = new Uint8Array(byteLength);
  let offset = 0;

  for (const encodedPath of encodedPaths) {
    stdin.set(encodedPath, offset);
    offset += encodedPath.byteLength + 1;
  }

  return stdin;
};

/** Builds the exact retained classification and its conservative read guard. */
const createClassification = (
  filter: string,
  ident: string,
  workingTreeEncoding: string,
): IGitContentTransformationClassification =>
  Object.freeze({
    filter,
    ident,
    isGuarded:
      isGuardedAttributeValue(filter) ||
      isGuardedAttributeValue(ident) ||
      isGuardedAttributeValue(workingTreeEncoding),
    workingTreeEncoding,
  });

/**
 * Creates the effective Git content-transformation classifier around a process boundary.
 * @param processExecutor The sanitized streamed Git process executor.
 * @returns An all-or-nothing bounded classifier for effective inventory entries.
 */
export const createGitContentTransformationClassifier = (
  processExecutor: IGitStreamingProcessExecutor = executeGitStreamingProcess,
): IGitContentTransformationClassifier => {
  return async (input): Promise<IGitContentTransformationClassificationResult> => {
    if (!Number.isSafeInteger(input.maxMetadataBytes) || input.maxMetadataBytes < 0) {
      return createClassificationFailure('RESOURCE_LIMIT_EXCEEDED');
    }

    if (input.entries.length === 0) {
      return Object.freeze({ entries: Object.freeze([]), gitMetadataBytes: 0, kind: 'classified' });
    }

    const paths = input.entries.map((entry) => entry.path);
    const stdin = encodePaths(paths);

    if (stdin === null) {
      return createClassificationFailure('GIT_OUTPUT_INVALID');
    }

    const parser = createGitContentTransformationParser({ paths });
    let consumedStdoutBytes = 0;
    const processResult = await processExecutor({
      arguments: ['-C', input.repositoryRoot, ...GIT_CONTENT_TRANSFORMATION_ARGUMENTS],
      consumeStdout: (chunk): void => {
        consumedStdoutBytes += chunk.byteLength;
        parser.consume(chunk);
      },
      maxStderrBytes: MAX_GIT_PROCESS_DIAGNOSTIC_BYTES,
      maxStdoutBytes: input.maxMetadataBytes,
      stdin,
    });

    if (processResult.kind === 'failed') {
      return createClassificationFailure(mapGitProcessFailure(processResult.reason));
    }

    if (
      processResult.stderr.byteLength > 0 ||
      processResult.stdoutBytes !== consumedStdoutBytes ||
      processResult.stdoutBytes > input.maxMetadataBytes
    ) {
      return createClassificationFailure('GIT_OUTPUT_INVALID');
    }

    const parserResult = parser.finish();

    if (parserResult.kind === 'failed' || parserResult.attributes.length !== input.entries.length) {
      return createClassificationFailure('GIT_OUTPUT_INVALID');
    }

    const entries = input.entries.map((entry, index) => {
      const attributes = parserResult.attributes[index];

      if (attributes === undefined || attributes.path !== entry.path) {
        return null;
      }

      return Object.freeze({
        ...entry,
        contentTransformation: createClassification(
          attributes.filter,
          attributes.ident,
          attributes.workingTreeEncoding,
        ),
      });
    });

    if (entries.some((entry) => entry === null)) {
      return createClassificationFailure('GIT_OUTPUT_INVALID');
    }

    return Object.freeze({
      entries: Object.freeze(entries.filter((entry) => entry !== null)),
      gitMetadataBytes: processResult.stdoutBytes,
      kind: 'classified',
    });
  };
};

// default effective Git content-transformation classifier used by inventory probing
export const classifyGitContentTransformations = createGitContentTransformationClassifier();
