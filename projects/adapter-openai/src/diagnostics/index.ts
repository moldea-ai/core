import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';

import { OPENAI_ADAPTER_ID } from '../constants/index.js';
import type { IOpenAiAdapterDiagnosticCode, IOpenAiDiagnosticInput } from '../contracts/index.js';

// stable OpenAI adapter diagnostic code and message catalog
export const OPENAI_ADAPTER_DIAGNOSTICS = Object.freeze({
  OPENAI_INSTRUCTION_LOADER_NOT_WIRED:
    'The declared instruction loader is not wired to the detected Responses API call.',
  OPENAI_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND:
    'The declared instruction-loader symbol was not found.',
  OPENAI_PACKAGE_MANIFEST_INVALID:
    'The owning package manifest is invalid for OpenAI dependency detection.',
  OPENAI_RUNTIME_AGENT_SYMBOL_NOT_FOUND: 'The declared runtime-agent symbol was not found.',
  OPENAI_SDK_VERSION_UNSUPPORTED:
    'The observed OpenAI SDK dependency range is disjoint from the supported range.',
  OPENAI_SOURCE_SYNTAX_INVALID:
    'The referenced OpenAI source file contains invalid TypeScript syntax.',
  OPENAI_SOURCE_TEXT_INVALID: 'The referenced OpenAI source file is not valid normalized text.',
  OPENAI_TOOL_INPUT_SCHEMA_NOT_WIRED:
    'The declared tool input schema is not wired to the detected OpenAI function-tool parameters.',
  OPENAI_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND: 'The declared tool input-schema symbol was not found.',
  OPENAI_TOOL_NAME_MISMATCH:
    'The declared tool name does not match the detected OpenAI function-tool name.',
  OPENAI_TOOL_REGISTRATION_NOT_WIRED:
    'The declared tool registration is not wired to the detected Responses API call.',
  OPENAI_TOOL_REGISTRATION_SYMBOL_NOT_FOUND: 'The declared tool-registration symbol was not found.',
} as const satisfies Readonly<Record<IOpenAiAdapterDiagnosticCode, string>>);

/**
 * Creates one frozen, safely namespaced OpenAI adapter diagnostic.
 * @param input The complete code, location, entity, and safe scalar details.
 * @returns The immutable adapter diagnostic.
 */
export const createOpenAiDiagnostic = (input: IOpenAiDiagnosticInput): IAdapterDiagnostic =>
  Object.freeze({
    ...input,
    details: Object.freeze({ ...input.details }),
    entity: input.entity === null ? null : Object.freeze({ ...input.entity }),
    message: OPENAI_ADAPTER_DIAGNOSTICS[input.code],
    source: OPENAI_ADAPTER_ID,
  });
