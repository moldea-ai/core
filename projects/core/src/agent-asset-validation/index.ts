import type {
  ICoreResourceLimits,
  IIndexedDescriptionAsset,
  IIndexedTextAsset,
} from '../contracts/index.js';
import { createCoreDiagnosticCollector } from '../diagnostic-utilities/index.js';
import type { ICoreDiagnostic } from '../diagnostics/index.js';
import { countUnicodeScalars, hasNonWhitespace } from '../format-validation/index.js';
import { freezeRecursively } from '../immutable/index.js';

const DESCRIPTION_EDGE_WHITESPACE_PATTERN = /^\p{White_Space}+|\p{White_Space}+$/gu;
const OPENING_HEADING_PATTERN = /^#{1,6} /u;

// internal description validation result retained for agent reconciliation
export interface IAgentDescriptionValidationResult {
  readonly valid: boolean;
  readonly description: IIndexedDescriptionAsset | null;
  readonly diagnostics: readonly ICoreDiagnostic[];
}

// internal instruction validation result retained for later placeholder checks
export interface IAgentInstructionValidationResult {
  readonly valid: boolean;
  readonly instruction: IIndexedTextAsset | null;
  readonly diagnostics: readonly ICoreDiagnostic[];
}

/** Finds the first nonblank line at or after one normalized line index. */
const findNonblankLine = (lines: readonly string[], startIndex: number): number | null => {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];

    if (line !== undefined && hasNonWhitespace(line)) {
      return index;
    }
  }

  return null;
};

/**
 * Validates the effective value of one agent description asset.
 * @param asset The normalized complete description or handoff-description asset.
 * @param agentId The owning registered agent ID.
 * @param kind The description role determining its diagnostic code.
 * @param limits The Core diagnostic budget.
 * @returns The frozen effective description when every version 1 rule passes.
 * @throws
 * - RESOURCE_LIMIT_EXCEEDED: The repository-level diagnostic budget was exceeded.
 */
export const validateAgentDescription = (
  asset: IIndexedTextAsset,
  agentId: string,
  kind: 'description' | 'handoff-description',
  limits: ICoreResourceLimits,
): IAgentDescriptionValidationResult => {
  const diagnostics = createCoreDiagnosticCollector(limits, 'inspect-project');
  const value = asset.content.replace(DESCRIPTION_EDGE_WHITESPACE_PATTERN, '');
  const scalarLength = countUnicodeScalars(value);
  const code =
    kind === 'description'
      ? 'MOLDEA_AGENT_DESCRIPTION_INVALID'
      : 'MOLDEA_AGENT_HANDOFF_DESCRIPTION_INVALID';

  if (scalarLength === 0) {
    diagnostics.add({ code, details: { reason: 'empty' }, entity: { agentId }, path: asset.path });
  }

  if (scalarLength > 1_000) {
    diagnostics.add({
      code,
      details: { reason: 'too-long' },
      entity: { agentId },
      path: asset.path,
    });
  }

  if (value.includes('{{') || value.includes('}}')) {
    diagnostics.add({
      code,
      details: { reason: 'runtime-variable-delimiter' },
      entity: { agentId },
      path: asset.path,
    });
  }

  const finalizedDiagnostics = diagnostics.finalize();

  return freezeRecursively({
    description: finalizedDiagnostics.length === 0 ? { asset, scalarLength, value } : null,
    diagnostics: finalizedDiagnostics,
    valid: finalizedDiagnostics.length === 0,
  });
};

/**
 * Validates one canonical instruction's non-empty content and opening identity.
 * @param asset The normalized complete instruction asset.
 * @param agentId The owning registered agent ID.
 * @param limits The Core diagnostic budget.
 * @returns The frozen instruction result, retaining non-empty content for later validation.
 * @throws
 * - RESOURCE_LIMIT_EXCEEDED: The repository-level diagnostic budget was exceeded.
 */
export const validateAgentInstruction = (
  asset: IIndexedTextAsset,
  agentId: string,
  limits: ICoreResourceLimits,
): IAgentInstructionValidationResult => {
  const diagnostics = createCoreDiagnosticCollector(limits, 'inspect-project');

  if (!hasNonWhitespace(asset.content)) {
    diagnostics.add({
      code: 'MOLDEA_AGENT_INSTRUCTION_EMPTY',
      entity: { agentId },
      path: asset.path,
    });

    return freezeRecursively({
      diagnostics: diagnostics.finalize(),
      instruction: null,
      valid: false,
    });
  }

  const identityToken = `\`${agentId}\``;
  const lines = asset.content.split('\n');
  const openingIndex = findNonblankLine(lines, 0);
  let identityIndex = openingIndex;

  if (openingIndex !== null && OPENING_HEADING_PATTERN.test(lines[openingIndex] ?? '')) {
    identityIndex = findNonblankLine(lines, openingIndex + 1);
  }

  if (identityIndex === null || !(lines[identityIndex] ?? '').includes(identityToken)) {
    diagnostics.add({
      code: 'MOLDEA_AGENT_IDENTITY_INVALID',
      details: { reason: asset.content.includes(identityToken) ? 'misplaced' : 'missing' },
      entity: { agentId },
      path: asset.path,
    });
  }

  const finalizedDiagnostics = diagnostics.finalize();

  return freezeRecursively({
    diagnostics: finalizedDiagnostics,
    instruction: asset,
    valid: finalizedDiagnostics.length === 0,
  });
};
