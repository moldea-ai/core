import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';

import { CLOUDFLARE_AGENTS_ADAPTER_ID } from '../constants/index.js';
import type {
  ICloudflareAgentsAdapterDiagnosticCode,
  ICloudflareAgentsDiagnosticInput,
} from '../contracts/index.js';

// stable Cloudflare Agents adapter diagnostic code and message catalog
export const CLOUDFLARE_AGENTS_ADAPTER_DIAGNOSTICS = Object.freeze({
  CLOUDFLARE_AGENTS_AGENT_OUTPUT_SCHEMA_NOT_WIRED:
    'The declared agent output schema is not wired to the detected AIChatAgent structured output.',
  CLOUDFLARE_AGENTS_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared agent output-schema symbol was not found.',
  CLOUDFLARE_AGENTS_HANDOFF_ROUTING_DESCRIPTION_MISSING:
    'The detected Cloudflare agent-tool routing description is missing.',
  CLOUDFLARE_AGENTS_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED:
    "The detected Cloudflare agent-tool routing description is not wired to the target agent's effective routing description.",
  CLOUDFLARE_AGENTS_HANDOFF_TARGET_AMBIGUOUS:
    'The detected Cloudflare agent-tool target maps to more than one registered agent.',
  CLOUDFLARE_AGENTS_INSTRUCTION_LOADER_NOT_WIRED:
    'The declared instruction loader is not wired to a supported configured Cloudflare agent instruction source.',
  CLOUDFLARE_AGENTS_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND:
    'The declared instruction-loader symbol was not found.',
  CLOUDFLARE_AGENTS_PACKAGE_MANIFEST_INVALID:
    'The owning package manifest is invalid for Cloudflare Agents dependency detection.',
  CLOUDFLARE_AGENTS_RUNTIME_AGENT_SYMBOL_NOT_FOUND:
    'The declared runtime-agent symbol was not found.',
  CLOUDFLARE_AGENTS_RUNTIME_VERSION_UNSUPPORTED:
    'The observed Cloudflare Agents dependency range is disjoint from the supported target.',
  CLOUDFLARE_AGENTS_SOURCE_SYNTAX_INVALID:
    'The referenced Cloudflare Agents source file contains invalid TypeScript syntax.',
  CLOUDFLARE_AGENTS_SOURCE_TEXT_INVALID:
    'The referenced Cloudflare Agents source file is not valid normalized text.',
  CLOUDFLARE_AGENTS_TOOL_IMPLEMENTATION_NOT_WIRED:
    'The declared tool implementation is not wired to the detected Cloudflare agent function tool.',
  CLOUDFLARE_AGENTS_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND:
    'The declared tool-implementation symbol was not found.',
  CLOUDFLARE_AGENTS_TOOL_INPUT_SCHEMA_NOT_WIRED:
    'The declared tool input schema is not wired to the detected Cloudflare agent function tool.',
  CLOUDFLARE_AGENTS_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared tool input-schema symbol was not found.',
  CLOUDFLARE_AGENTS_TOOL_NAME_MISMATCH:
    'The declared tool name does not match the detected Cloudflare agent tools-map key.',
  CLOUDFLARE_AGENTS_TOOL_OUTPUT_SCHEMA_NOT_WIRED:
    'The declared tool output schema is not wired to the detected Cloudflare agent function tool.',
  CLOUDFLARE_AGENTS_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared tool output-schema symbol was not found.',
  CLOUDFLARE_AGENTS_TOOL_REGISTRATION_NOT_WIRED:
    'The declared tool registration is not wired to the detected Cloudflare agent tools map.',
  CLOUDFLARE_AGENTS_TOOL_REGISTRATION_SYMBOL_NOT_FOUND:
    'The declared tool-registration symbol was not found.',
} as const satisfies Readonly<Record<ICloudflareAgentsAdapterDiagnosticCode, string>>);

/** Creates one frozen, safely namespaced Cloudflare Agents adapter diagnostic. */
export const createCloudflareAgentsDiagnostic = (
  input: ICloudflareAgentsDiagnosticInput,
): IAdapterDiagnostic =>
  Object.freeze({
    ...input,
    details: Object.freeze({ ...input.details }),
    entity: input.entity === null ? null : Object.freeze({ ...input.entity }),
    message: CLOUDFLARE_AGENTS_ADAPTER_DIAGNOSTICS[input.code],
    source: CLOUDFLARE_AGENTS_ADAPTER_ID,
  });
