import type { IRepositoryPath } from '@moldea.ai/repository';

import type { ICoreResourceLimits, IIndexedTextAsset } from './contracts.js';
import {
  createCoreDiagnosticCollector,
  escapeJsonPointerSegment,
  type ICoreDiagnosticCollector,
} from './diagnostic-utilities.js';
import type { ICoreDiagnostic, ISourceRange } from './diagnostics.js';
import { compareExactStrings, isVariableId } from './format-validation.js';
import type { IRuntimeVariableManifestEntry } from './format.js';
import { createSourceLocator } from './source-location.js';

// internal malformed classifications and valid-placeholder aggregation
type IMalformedPlaceholderReason =
  | 'invalid-opening-delimiter'
  | 'invalid-closing-delimiter'
  | 'nested-opening'
  | 'unmatched-opening'
  | 'unmatched-closing'
  | 'invalid-variable-id';

interface IPlaceholderOccurrence {
  count: number;
  readonly firstRange: ISourceRange;
}

const readBraceRunEnd = (content: string, startOffset: number, brace: '{' | '}'): number => {
  let endOffset = startOffset + 1;

  while (content[endOffset] === brace) {
    endOffset += 1;
  }

  return endOffset;
};

/** Finds the end of the next closing-delimiter run without rescanning prior content. */
const findClosingRunEnd = (content: string, startOffset: number): number => {
  let cursor = startOffset;

  while (cursor < content.length) {
    if (content[cursor] !== '}') {
      cursor += 1;
      continue;
    }

    const runEnd = readBraceRunEnd(content, cursor, '}');
    if (runEnd - cursor >= 2) {
      return runEnd;
    }

    cursor = runEnd;
  }

  return content.length;
};

/** Adds one malformed-placeholder diagnostic for an exact normalized source span. */
const addMalformedDiagnostic = (
  collector: ICoreDiagnosticCollector,
  instruction: IIndexedTextAsset,
  agentId: string,
  reason: IMalformedPlaceholderReason,
  range: ISourceRange,
): void => {
  collector.add({
    code: 'MOLDEA_VARIABLE_PLACEHOLDER_MALFORMED',
    details: { reason },
    entity: { agentId },
    path: instruction.path,
    range,
  });
};

/** Records a valid placeholder occurrence and its first normalized source range. */
const recordOccurrence = (
  occurrences: Map<string, IPlaceholderOccurrence>,
  variableId: string,
  range: ISourceRange,
): void => {
  const occurrence = occurrences.get(variableId);

  if (occurrence === undefined) {
    occurrences.set(variableId, { count: 1, firstRange: range });
    return;
  }

  occurrence.count += 1;
};

/**
 * Validates runtime-variable placeholders in one normalized canonical agent instruction.
 * @param manifestPath The canonical manifest path containing variable declarations.
 * @param agentId The owning agent ID.
 * @param instruction The normalized non-empty canonical instruction asset.
 * @param declaredVariables The owning agent's normalized variable declarations.
 * @param limits The resource limits applied to emitted diagnostics.
 * @returns Frozen deterministic placeholder diagnostics.
 * @throws
 * - RESOURCE_LIMIT_EXCEEDED: The repository-level diagnostic budget was exceeded.
 */
export const validateRuntimePlaceholders = (
  manifestPath: IRepositoryPath,
  agentId: string,
  instruction: IIndexedTextAsset,
  declaredVariables: Readonly<Record<string, IRuntimeVariableManifestEntry>>,
  limits: ICoreResourceLimits,
): readonly ICoreDiagnostic[] => {
  const collector = createCoreDiagnosticCollector(limits, 'inspect-project');
  const locator = createSourceLocator(instruction.content);
  const occurrences = new Map<string, IPlaceholderOccurrence>();
  let cursor = 0;

  while (cursor < instruction.content.length) {
    const character = instruction.content[cursor];

    if (character === '}') {
      const runEnd = readBraceRunEnd(instruction.content, cursor, '}');
      const runLength = runEnd - cursor;

      if (runLength >= 2) {
        addMalformedDiagnostic(
          collector,
          instruction,
          agentId,
          runLength === 2 ? 'unmatched-closing' : 'invalid-closing-delimiter',
          locator.locateRange(cursor, runEnd),
        );
      }

      cursor = runEnd;
      continue;
    }

    if (character !== '{') {
      cursor += 1;
      continue;
    }

    const openingEnd = readBraceRunEnd(instruction.content, cursor, '{');
    const openingLength = openingEnd - cursor;

    if (openingLength === 1) {
      cursor = openingEnd;
      continue;
    }

    if (openingLength > 2) {
      addMalformedDiagnostic(
        collector,
        instruction,
        agentId,
        'invalid-opening-delimiter',
        locator.locateRange(cursor, openingEnd),
      );
      cursor = openingEnd;
      continue;
    }

    let candidateCursor = openingEnd;
    let isCandidateComplete = false;

    while (candidateCursor < instruction.content.length) {
      const candidateCharacter = instruction.content[candidateCursor];

      if (candidateCharacter === '{') {
        const nestedOpeningEnd = readBraceRunEnd(instruction.content, candidateCursor, '{');

        if (nestedOpeningEnd - candidateCursor >= 2) {
          const malformedEnd = findClosingRunEnd(instruction.content, nestedOpeningEnd);
          addMalformedDiagnostic(
            collector,
            instruction,
            agentId,
            'nested-opening',
            locator.locateRange(cursor, malformedEnd),
          );
          cursor = malformedEnd;
          isCandidateComplete = true;
          break;
        }

        candidateCursor = nestedOpeningEnd;
        continue;
      }

      if (candidateCharacter !== '}') {
        candidateCursor += 1;
        continue;
      }

      const closingEnd = readBraceRunEnd(instruction.content, candidateCursor, '}');
      const closingLength = closingEnd - candidateCursor;

      if (closingLength === 1) {
        candidateCursor = closingEnd;
        continue;
      }

      if (closingLength > 2) {
        addMalformedDiagnostic(
          collector,
          instruction,
          agentId,
          'invalid-closing-delimiter',
          locator.locateRange(cursor, closingEnd),
        );
        cursor = closingEnd;
        isCandidateComplete = true;
        break;
      }

      const variableId = instruction.content.slice(openingEnd, candidateCursor);
      const placeholderRange = locator.locateRange(cursor, closingEnd);

      if (isVariableId(variableId)) {
        recordOccurrence(occurrences, variableId, placeholderRange);
      } else {
        addMalformedDiagnostic(
          collector,
          instruction,
          agentId,
          'invalid-variable-id',
          placeholderRange,
        );
      }

      cursor = closingEnd;
      isCandidateComplete = true;
      break;
    }

    if (!isCandidateComplete) {
      addMalformedDiagnostic(
        collector,
        instruction,
        agentId,
        'unmatched-opening',
        locator.locateRange(cursor, instruction.content.length),
      );
      cursor = instruction.content.length;
    }
  }

  for (const variableId of [...occurrences.keys()].sort(compareExactStrings)) {
    if (declaredVariables[variableId] !== undefined) {
      continue;
    }

    const occurrence = occurrences.get(variableId);
    if (occurrence === undefined) {
      continue;
    }

    collector.add({
      code: 'MOLDEA_VARIABLE_UNDECLARED',
      details: { occurrences: occurrence.count },
      entity: { agentId, variableId },
      path: instruction.path,
      range: occurrence.firstRange,
    });
  }

  for (const variableId of Object.keys(declaredVariables).sort(compareExactStrings)) {
    if (occurrences.has(variableId)) {
      continue;
    }

    collector.add({
      code: 'MOLDEA_VARIABLE_UNUSED',
      entity: { agentId, variableId },
      path: manifestPath,
      pointer: `/agents/${escapeJsonPointerSegment(agentId)}/variables/${escapeJsonPointerSegment(variableId)}`,
    });
  }

  return collector.finalize();
};
