import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';

import { ANTHROPIC_ADAPTER_ID } from '../constants/index.js';
import type {
  IAnthropicAdapterDiagnosticCode,
  IAnthropicDiagnosticInput,
} from '../contracts/index.js';

// stable Anthropic adapter diagnostic code and message catalog
export const ANTHROPIC_ADAPTER_DIAGNOSTICS = Object.freeze({
  ANTHROPIC_INSTRUCTION_LOADER_NOT_WIRED:
    'The declared instruction loader is not wired to the detected Anthropic Messages API call.',
  ANTHROPIC_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND:
    'The declared instruction-loader symbol was not found.',
  ANTHROPIC_PACKAGE_MANIFEST_INVALID:
    'The owning package manifest is invalid for Anthropic dependency detection.',
  ANTHROPIC_RUNTIME_AGENT_SYMBOL_NOT_FOUND: 'The declared runtime-agent symbol was not found.',
  ANTHROPIC_SDK_VERSION_UNSUPPORTED:
    'The observed Anthropic SDK dependency range is disjoint from the supported range.',
  ANTHROPIC_SOURCE_SYNTAX_INVALID:
    'The referenced Anthropic source file contains invalid TypeScript syntax.',
  ANTHROPIC_SOURCE_TEXT_INVALID:
    'The referenced Anthropic source file is not valid normalized text.',
  ANTHROPIC_TOOL_INPUT_SCHEMA_NOT_WIRED:
    'The declared tool input schema is not wired to the detected Anthropic client-tool input schema.',
  ANTHROPIC_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared tool input-schema symbol was not found.',
  ANTHROPIC_TOOL_NAME_MISMATCH:
    'The declared tool name does not match the detected Anthropic client-tool name.',
  ANTHROPIC_TOOL_NAME_INVALID:
    'The detected Anthropic client-tool name violates the supported provider limit.',
  ANTHROPIC_TOOL_REGISTRATION_NOT_WIRED:
    'The declared tool registration is not wired to the detected Anthropic Messages API call.',
  ANTHROPIC_TOOL_REGISTRATION_SYMBOL_NOT_FOUND:
    'The declared tool-registration symbol was not found.',
} as const satisfies Readonly<Record<IAnthropicAdapterDiagnosticCode, string>>);

/**
 * Creates one frozen, safely namespaced Anthropic adapter diagnostic.
 * @param input The complete code, location, entity, and safe scalar details.
 * @returns The immutable adapter diagnostic.
 */
export const createAnthropicDiagnostic = (input: IAnthropicDiagnosticInput): IAdapterDiagnostic =>
  Object.freeze({
    ...input,
    details: Object.freeze({ ...input.details }),
    entity: input.entity === null ? null : Object.freeze({ ...input.entity }),
    message: ANTHROPIC_ADAPTER_DIAGNOSTICS[input.code],
    source: ANTHROPIC_ADAPTER_ID,
  });
