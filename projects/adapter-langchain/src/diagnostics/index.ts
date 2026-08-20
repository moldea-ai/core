import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';

import { LANGCHAIN_ADAPTER_ID } from '../constants/index.js';
import type {
  ILangChainAdapterDiagnosticCode,
  ILangChainDiagnosticInput,
} from '../contracts/index.js';

// stable LangChain adapter diagnostic code and message catalog
export const LANGCHAIN_ADAPTER_DIAGNOSTICS = Object.freeze({
  LANGCHAIN_PACKAGE_MANIFEST_INVALID:
    'The owning package manifest is invalid for LangChain dependency detection.',
  LANGCHAIN_VERSION_UNSUPPORTED:
    'The observed LangChain package ranges are disjoint from the supported target.',
  LANGCHAIN_SOURCE_TEXT_INVALID:
    'The referenced LangChain source file is not valid normalized text.',
  LANGCHAIN_SOURCE_SYNTAX_INVALID:
    'The referenced LangChain source file contains invalid TypeScript syntax.',
  LANGCHAIN_RUNTIME_AGENT_SYMBOL_NOT_FOUND: 'The declared runtime-agent symbol was not found.',
  LANGCHAIN_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND:
    'The declared instruction-loader symbol was not found.',
  LANGCHAIN_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared agent output-schema symbol was not found.',
  LANGCHAIN_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND:
    'The declared tool-implementation symbol was not found.',
  LANGCHAIN_TOOL_REGISTRATION_SYMBOL_NOT_FOUND:
    'The declared tool-registration symbol was not found.',
  LANGCHAIN_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared tool input-schema symbol was not found.',
  LANGCHAIN_INSTRUCTION_LOADER_NOT_WIRED:
    'The declared instruction loader is not wired to the detected LangChain agent.',
  LANGCHAIN_AGENT_OUTPUT_SCHEMA_NOT_WIRED:
    'The declared agent output schema is not wired to the detected LangChain structured-output configuration.',
  LANGCHAIN_TOOL_IMPLEMENTATION_NOT_WIRED:
    'The declared tool implementation is not wired to the detected LangChain function tool.',
  LANGCHAIN_TOOL_REGISTRATION_NOT_WIRED:
    'The declared tool registration is not available to the detected LangChain agent.',
  LANGCHAIN_TOOL_NAME_MISMATCH:
    'The declared tool name does not match the detected LangChain tool name.',
  LANGCHAIN_TOOL_INPUT_SCHEMA_NOT_WIRED:
    'The declared tool input schema is not wired to the detected LangChain function tool.',
} as const satisfies Readonly<Record<ILangChainAdapterDiagnosticCode, string>>);

/** Creates one frozen, safely namespaced LangChain adapter diagnostic. */
export const createLangChainDiagnostic = (input: ILangChainDiagnosticInput): IAdapterDiagnostic =>
  Object.freeze({
    ...input,
    details: Object.freeze({ ...input.details }),
    entity: input.entity === null ? null : Object.freeze({ ...input.entity }),
    message: LANGCHAIN_ADAPTER_DIAGNOSTICS[input.code],
    source: LANGCHAIN_ADAPTER_ID,
  });
