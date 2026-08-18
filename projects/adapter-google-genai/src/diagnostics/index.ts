import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';

import { GOOGLE_GENAI_ADAPTER_ID } from '../constants/index.js';
import type {
  IGoogleGenAiAdapterDiagnosticCode,
  IGoogleGenAiDiagnosticInput,
} from '../contracts/index.js';

// stable Google Gen AI adapter diagnostic code and message catalog
export const GOOGLE_GENAI_ADAPTER_DIAGNOSTICS = Object.freeze({
  GOOGLE_GENAI_FUNCTION_DECLARATION_LIMIT_EXCEEDED:
    'The detected Google Gen AI function-declaration collection exceeds the supported SDK declaration limit.',
  GOOGLE_GENAI_INSTRUCTION_LOADER_NOT_WIRED:
    'The declared instruction loader is not wired to the detected Google Gen AI generate-content configuration.',
  GOOGLE_GENAI_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND:
    'The declared instruction-loader symbol was not found.',
  GOOGLE_GENAI_PACKAGE_MANIFEST_INVALID:
    'The owning package manifest is invalid for Google Gen AI dependency detection.',
  GOOGLE_GENAI_RUNTIME_AGENT_SYMBOL_NOT_FOUND: 'The declared runtime-agent symbol was not found.',
  GOOGLE_GENAI_SDK_VERSION_UNSUPPORTED:
    'The observed Google Gen AI SDK dependency range is disjoint from the supported range.',
  GOOGLE_GENAI_SOURCE_SYNTAX_INVALID:
    'The referenced Google Gen AI source file contains invalid TypeScript syntax.',
  GOOGLE_GENAI_SOURCE_TEXT_INVALID:
    'The referenced Google Gen AI source file is not valid normalized text.',
  GOOGLE_GENAI_TOOL_INPUT_SCHEMA_NOT_WIRED:
    "The declared tool input schema is not wired to the detected function declaration's parameters JSON schema.",
  GOOGLE_GENAI_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared tool input-schema symbol was not found.',
  GOOGLE_GENAI_TOOL_NAME_INVALID:
    'The detected Google Gen AI function name violates the supported SDK declaration limit.',
  GOOGLE_GENAI_TOOL_NAME_MISMATCH:
    'The declared tool name does not match the detected Google Gen AI function name.',
  GOOGLE_GENAI_TOOL_REGISTRATION_NOT_WIRED:
    'The declared tool registration is not wired to the detected Google Gen AI function-declaration collection.',
  GOOGLE_GENAI_TOOL_REGISTRATION_SYMBOL_NOT_FOUND:
    'The declared tool-registration symbol was not found.',
} as const satisfies Readonly<Record<IGoogleGenAiAdapterDiagnosticCode, string>>);

/**
 * Creates one frozen, safely namespaced Google Gen AI adapter diagnostic.
 * @param input The complete code, location, entity, and safe scalar details.
 * @returns The immutable adapter diagnostic.
 */
export const createGoogleGenAiDiagnostic = (
  input: IGoogleGenAiDiagnosticInput,
): IAdapterDiagnostic =>
  Object.freeze({
    ...input,
    details: Object.freeze({ ...input.details }),
    entity: input.entity === null ? null : Object.freeze({ ...input.entity }),
    message: GOOGLE_GENAI_ADAPTER_DIAGNOSTICS[input.code],
    source: GOOGLE_GENAI_ADAPTER_ID,
  });
