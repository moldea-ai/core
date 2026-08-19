import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';

import { OPENAI_AGENTS_SDK_ADAPTER_ID } from '../constants/index.js';
import type {
  IOpenAiAgentsSdkAdapterDiagnosticCode,
  IOpenAiAgentsSdkDiagnosticInput,
} from '../contracts/index.js';

// stable OpenAI Agents SDK adapter diagnostic code and message catalog
export const OPENAI_AGENTS_SDK_ADAPTER_DIAGNOSTICS = Object.freeze({
  OPENAI_AGENTS_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED:
    'The declared agent output schema is not wired to the detected OpenAI Agents SDK agent output type.',
  OPENAI_AGENTS_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared agent output-schema symbol was not found.',
  OPENAI_AGENTS_SDK_HANDOFF_ROUTING_DESCRIPTION_MISSING:
    'The detected OpenAI Agents SDK handoff registration is missing its effective routing description.',
  OPENAI_AGENTS_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED:
    "The detected OpenAI Agents SDK handoff registration does not use the target agent's effective routing description.",
  OPENAI_AGENTS_SDK_HANDOFF_TARGET_AMBIGUOUS:
    'The detected OpenAI Agents SDK handoff target matches more than one registered moldea agent.',
  OPENAI_AGENTS_SDK_INSTRUCTION_LOADER_NOT_WIRED:
    'The declared instruction loader is not wired to the detected OpenAI Agents SDK agent.',
  OPENAI_AGENTS_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND:
    'The declared instruction-loader symbol was not found.',
  OPENAI_AGENTS_SDK_PACKAGE_MANIFEST_INVALID:
    'The owning package manifest is invalid for OpenAI Agents SDK dependency detection.',
  OPENAI_AGENTS_SDK_RUNTIME_AGENT_SYMBOL_NOT_FOUND:
    'The declared runtime-agent symbol was not found.',
  OPENAI_AGENTS_SDK_SOURCE_SYNTAX_INVALID:
    'The referenced OpenAI Agents SDK source file contains invalid TypeScript syntax.',
  OPENAI_AGENTS_SDK_SOURCE_TEXT_INVALID:
    'The referenced OpenAI Agents SDK source file is not valid normalized text.',
  OPENAI_AGENTS_SDK_TOOL_IMPLEMENTATION_NOT_WIRED:
    'The declared tool implementation is not wired to the detected OpenAI Agents SDK function tool.',
  OPENAI_AGENTS_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND:
    'The declared tool-implementation symbol was not found.',
  OPENAI_AGENTS_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED:
    'The declared tool input schema is not wired to the detected OpenAI Agents SDK function tool.',
  OPENAI_AGENTS_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared tool input-schema symbol was not found.',
  OPENAI_AGENTS_SDK_TOOL_NAME_MISMATCH:
    'The declared tool name does not match the detected OpenAI Agents SDK function-tool name.',
  OPENAI_AGENTS_SDK_TOOL_OUTPUT_SCHEMA_NOT_WIRED:
    'The declared tool output schema is not wired to the detected OpenAI Agents SDK function tool.',
  OPENAI_AGENTS_SDK_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared tool output-schema symbol was not found.',
  OPENAI_AGENTS_SDK_TOOL_REGISTRATION_NOT_WIRED:
    'The declared tool registration is not wired to the detected OpenAI Agents SDK agent.',
  OPENAI_AGENTS_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND:
    'The declared tool-registration symbol was not found.',
  OPENAI_AGENTS_SDK_VERSION_UNSUPPORTED:
    'The observed OpenAI Agents SDK dependency range is disjoint from the supported range.',
} as const satisfies Readonly<Record<IOpenAiAgentsSdkAdapterDiagnosticCode, string>>);

/**
 * Creates one frozen, safely namespaced OpenAI Agents SDK adapter diagnostic.
 * @param input The complete code, location, entity, and safe scalar details.
 * @returns The immutable adapter diagnostic.
 */
export const createOpenAiAgentsSdkDiagnostic = (
  input: IOpenAiAgentsSdkDiagnosticInput,
): IAdapterDiagnostic =>
  Object.freeze({
    ...input,
    details: Object.freeze({ ...input.details }),
    entity: input.entity === null ? null : Object.freeze({ ...input.entity }),
    message: OPENAI_AGENTS_SDK_ADAPTER_DIAGNOSTICS[input.code],
    source: OPENAI_AGENTS_SDK_ADAPTER_ID,
  });
