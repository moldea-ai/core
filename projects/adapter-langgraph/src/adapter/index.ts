import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import {
  LANGGRAPH_ADAPTER_ID,
  LANGGRAPH_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
} from '../constants/index.js';
import { inspectLangGraph } from '../inspection/index.js';

// immutable official LangGraph runtime adapter singleton
export const langGraphAdapter: IRuntimeAdapter = Object.freeze({
  id: LANGGRAPH_ADAPTER_ID,
  inspect: inspectLangGraph,
  supportedRepositoryFormatVersions: LANGGRAPH_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
});
