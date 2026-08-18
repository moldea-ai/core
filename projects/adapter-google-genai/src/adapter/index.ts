import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import {
  GOOGLE_GENAI_ADAPTER_ID,
  GOOGLE_GENAI_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
} from '../constants/index.js';
import { inspectGoogleGenAi } from '../inspection/index.js';

// immutable official Google Gen AI runtime adapter singleton
export const googleGenAiAdapter: IRuntimeAdapter = Object.freeze({
  id: GOOGLE_GENAI_ADAPTER_ID,
  inspect: inspectGoogleGenAi,
  supportedRepositoryFormatVersions: GOOGLE_GENAI_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
});
