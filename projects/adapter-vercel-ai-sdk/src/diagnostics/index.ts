import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';

import { VERCEL_AI_SDK_ADAPTER_ID } from '../constants/index.js';
import type {
  IVercelAiSdkAdapterDiagnosticCode,
  IVercelAiSdkDiagnosticInput,
} from '../contracts/index.js';

// stable Vercel AI SDK adapter diagnostic code and message catalog
export const VERCEL_AI_SDK_ADAPTER_DIAGNOSTICS = Object.freeze({
  VERCEL_AI_SDK_AGENT_INPUT_SCHEMA_NOT_WIRED:
    'The declared agent input schema is not wired to the detected ToolLoopAgent call-options schema.',
  VERCEL_AI_SDK_AGENT_INPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared agent input-schema symbol was not found.',
  VERCEL_AI_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED:
    'The declared agent output schema is not wired to the detected Vercel AI SDK structured output.',
  VERCEL_AI_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared agent output-schema symbol was not found.',
  VERCEL_AI_SDK_INSTRUCTION_LOADER_NOT_WIRED:
    'The declared instruction loader is not wired to the detected Vercel AI SDK instructions.',
  VERCEL_AI_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND:
    'The declared instruction-loader symbol was not found.',
  VERCEL_AI_SDK_PACKAGE_MANIFEST_INVALID:
    'The owning package manifest is invalid for Vercel AI SDK dependency detection.',
  VERCEL_AI_SDK_RUNTIME_AGENT_SYMBOL_NOT_FOUND: 'The declared runtime-agent symbol was not found.',
  VERCEL_AI_SDK_SOURCE_SYNTAX_INVALID:
    'The referenced Vercel AI SDK source file contains invalid TypeScript syntax.',
  VERCEL_AI_SDK_SOURCE_TEXT_INVALID:
    'The referenced Vercel AI SDK source file is not valid normalized text.',
  VERCEL_AI_SDK_TOOL_IMPLEMENTATION_NOT_WIRED:
    'The declared tool implementation is not wired to the detected Vercel AI SDK function tool.',
  VERCEL_AI_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND:
    'The declared tool-implementation symbol was not found.',
  VERCEL_AI_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED:
    'The declared tool input schema is not wired to the detected Vercel AI SDK function tool.',
  VERCEL_AI_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared tool input-schema symbol was not found.',
  VERCEL_AI_SDK_TOOL_NAME_MISMATCH:
    'The declared tool name does not match the detected Vercel AI SDK tools-map key.',
  VERCEL_AI_SDK_TOOL_OUTPUT_SCHEMA_NOT_WIRED:
    'The declared tool output schema is not wired to the detected Vercel AI SDK function tool.',
  VERCEL_AI_SDK_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared tool output-schema symbol was not found.',
  VERCEL_AI_SDK_TOOL_REGISTRATION_NOT_WIRED:
    'The declared tool registration is not wired to the detected Vercel AI SDK tools map.',
  VERCEL_AI_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND:
    'The declared tool-registration symbol was not found.',
  VERCEL_AI_SDK_VERSION_UNSUPPORTED:
    'The observed Vercel AI SDK dependency range is disjoint from the supported range.',
} as const satisfies Readonly<Record<IVercelAiSdkAdapterDiagnosticCode, string>>);

/**
 * Creates one frozen, safely namespaced Vercel AI SDK adapter diagnostic.
 * @param input The complete code, location, entity, and safe scalar details.
 * @returns The immutable adapter diagnostic.
 */
export const createVercelAiSdkDiagnostic = (
  input: IVercelAiSdkDiagnosticInput,
): IAdapterDiagnostic =>
  Object.freeze({
    ...input,
    details: Object.freeze({ ...input.details }),
    entity: input.entity === null ? null : Object.freeze({ ...input.entity }),
    message: VERCEL_AI_SDK_ADAPTER_DIAGNOSTICS[input.code],
    source: VERCEL_AI_SDK_ADAPTER_ID,
  });
