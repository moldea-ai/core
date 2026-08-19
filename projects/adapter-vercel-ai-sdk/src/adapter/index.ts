import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import {
  VERCEL_AI_SDK_ADAPTER_ID,
  VERCEL_AI_SDK_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
} from '../constants/index.js';
import { inspectVercelAiSdk } from '../inspection/index.js';

// immutable official Vercel AI SDK runtime adapter singleton
export const vercelAiSdkAdapter: IRuntimeAdapter = Object.freeze({
  id: VERCEL_AI_SDK_ADAPTER_ID,
  inspect: inspectVercelAiSdk,
  supportedRepositoryFormatVersions: VERCEL_AI_SDK_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
});
