import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import {
  LANGCHAIN_ADAPTER_ID,
  LANGCHAIN_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
} from '../constants/index.js';
import { inspectLangChain } from '../inspection/index.js';

// immutable official LangChain runtime adapter singleton
export const langChainAdapter: IRuntimeAdapter = Object.freeze({
  id: LANGCHAIN_ADAPTER_ID,
  inspect: inspectLangChain,
  supportedRepositoryFormatVersions: LANGCHAIN_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
});
