import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';

import { CLAUDE_AGENT_SDK_ADAPTER_ID } from '../constants/index.js';
import type {
  IClaudeAgentSdkAdapterDiagnosticCode,
  IClaudeAgentSdkDiagnosticInput,
} from '../contracts/index.js';

// stable Claude Agent SDK adapter diagnostic code and message catalog
export const CLAUDE_AGENT_SDK_ADAPTER_DIAGNOSTICS = Object.freeze({
  CLAUDE_AGENT_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED:
    'The declared agent output schema is not wired to the detected Claude Agent SDK query output format.',
  CLAUDE_AGENT_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared agent output-schema symbol was not found.',
  CLAUDE_AGENT_SDK_HANDOFF_ROUTING_DESCRIPTION_MISSING:
    'The detected Claude Agent SDK subagent registration has no supported routing description.',
  CLAUDE_AGENT_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED:
    "The detected Claude Agent SDK subagent routing description does not use the target agent's effective routing description.",
  CLAUDE_AGENT_SDK_HANDOFF_TARGET_AMBIGUOUS:
    'The detected Claude Agent SDK subagent target matches more than one registered moldea agent.',
  CLAUDE_AGENT_SDK_INSTRUCTION_LOADER_NOT_WIRED:
    'The declared instruction loader is not wired to the detected Claude Agent SDK agent.',
  CLAUDE_AGENT_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND:
    'The declared instruction-loader symbol was not found.',
  CLAUDE_AGENT_SDK_PACKAGE_MANIFEST_INVALID:
    'The owning package manifest is invalid for Claude Agent SDK dependency detection.',
  CLAUDE_AGENT_SDK_RUNTIME_AGENT_SYMBOL_NOT_FOUND:
    'The declared runtime-agent symbol was not found.',
  CLAUDE_AGENT_SDK_SOURCE_SYNTAX_INVALID:
    'The referenced Claude Agent SDK source file contains invalid TypeScript syntax.',
  CLAUDE_AGENT_SDK_SOURCE_TEXT_INVALID:
    'The referenced Claude Agent SDK source file is not valid normalized text.',
  CLAUDE_AGENT_SDK_TOOL_IMPLEMENTATION_NOT_WIRED:
    'The declared tool implementation is not wired to the detected Claude Agent SDK custom tool.',
  CLAUDE_AGENT_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND:
    'The declared tool-implementation symbol was not found.',
  CLAUDE_AGENT_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED:
    'The declared tool input schema is not wired to the detected Claude Agent SDK custom tool.',
  CLAUDE_AGENT_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared tool input-schema symbol was not found.',
  CLAUDE_AGENT_SDK_TOOL_NAME_MISMATCH:
    'The declared tool name does not match the detected Claude Agent SDK MCP tool name.',
  CLAUDE_AGENT_SDK_MCP_SERVER_KEY_UNSUPPORTED:
    'The detected Claude Agent SDK MCP server key cannot establish a canonical runtime-name segment.',
  CLAUDE_AGENT_SDK_TOOL_REGISTRATION_NOT_WIRED:
    'The declared tool registration is not available to the detected Claude Agent SDK agent.',
  CLAUDE_AGENT_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND:
    'The declared tool-registration symbol was not found.',
  CLAUDE_AGENT_SDK_VERSION_UNSUPPORTED:
    'The observed Claude Agent SDK dependency range is disjoint from the supported range.',
} as const satisfies Readonly<Record<IClaudeAgentSdkAdapterDiagnosticCode, string>>);

/**
 * Creates one frozen, safely namespaced Claude Agent SDK adapter diagnostic.
 * @param input The complete code, location, entity, and safe scalar details.
 * @returns The immutable adapter diagnostic.
 */
export const createClaudeAgentSdkDiagnostic = (
  input: IClaudeAgentSdkDiagnosticInput,
): IAdapterDiagnostic =>
  Object.freeze({
    ...input,
    details: Object.freeze({ ...input.details }),
    entity: input.entity === null ? null : Object.freeze({ ...input.entity }),
    message: CLAUDE_AGENT_SDK_ADAPTER_DIAGNOSTICS[input.code],
    source: CLAUDE_AGENT_SDK_ADAPTER_ID,
  });
