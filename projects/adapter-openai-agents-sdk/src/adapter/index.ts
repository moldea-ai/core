import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import {
  OPENAI_AGENTS_SDK_ADAPTER_ID,
  OPENAI_AGENTS_SDK_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
} from '../constants/index.js';
import { inspectOpenAiAgentsSdk } from '../inspection/index.js';

// immutable official OpenAI Agents SDK runtime adapter singleton
export const openAiAgentsSdkAdapter: IRuntimeAdapter = Object.freeze({
  id: OPENAI_AGENTS_SDK_ADAPTER_ID,
  inspect: inspectOpenAiAgentsSdk,
  supportedRepositoryFormatVersions: OPENAI_AGENTS_SDK_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
});
