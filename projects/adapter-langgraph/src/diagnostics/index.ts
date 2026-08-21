import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';

import { LANGGRAPH_ADAPTER_ID } from '../constants/index.js';
import type {
  ILangGraphAdapterDiagnosticCode,
  ILangGraphDiagnosticInput,
} from '../contracts/index.js';

// stable LangGraph adapter diagnostic messages
export const LANGGRAPH_ADAPTER_DIAGNOSTICS = Object.freeze({
  LANGGRAPH_AGENT_INPUT_SCHEMA_NOT_WIRED:
    'The declared agent input schema is not wired to the detected LangGraph input schema.',
  LANGGRAPH_AGENT_INPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared agent input-schema symbol was not found.',
  LANGGRAPH_AGENT_OUTPUT_SCHEMA_NOT_WIRED:
    'The declared agent output schema is not wired to the detected LangGraph output schema.',
  LANGGRAPH_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND:
    'The declared agent output-schema symbol was not found.',
  LANGGRAPH_PACKAGE_MANIFEST_INVALID:
    'The owning package manifest is invalid for LangGraph dependency detection.',
  LANGGRAPH_RUNTIME_AGENT_SYMBOL_NOT_FOUND: 'The declared runtime-agent symbol was not found.',
  LANGGRAPH_SOURCE_SYNTAX_INVALID:
    'The referenced LangGraph source file contains invalid TypeScript syntax.',
  LANGGRAPH_SOURCE_TEXT_INVALID:
    'The referenced LangGraph source file is not valid normalized text.',
  LANGGRAPH_VERSION_UNSUPPORTED:
    'The observed LangGraph target package ranges are disjoint from the supported target.',
} as const satisfies Readonly<Record<ILangGraphAdapterDiagnosticCode, string>>);

/** Creates one deeply immutable LangGraph diagnostic. */
export const createLangGraphDiagnostic = (input: ILangGraphDiagnosticInput): IAdapterDiagnostic =>
  Object.freeze({
    ...input,
    details: Object.freeze({ ...input.details }),
    message: LANGGRAPH_ADAPTER_DIAGNOSTICS[input.code],
    source: LANGGRAPH_ADAPTER_ID,
  });
