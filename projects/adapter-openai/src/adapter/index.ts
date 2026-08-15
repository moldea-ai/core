import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import {
  OPENAI_ADAPTER_ID,
  OPENAI_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
} from '../constants/index.js';
import { inspectOpenAi } from '../inspection/index.js';

// immutable official OpenAI runtime adapter singleton
export const openAiAdapter: IRuntimeAdapter = Object.freeze({
  id: OPENAI_ADAPTER_ID,
  inspect: inspectOpenAi,
  supportedRepositoryFormatVersions: OPENAI_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
});
