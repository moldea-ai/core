import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import {
  ANTHROPIC_ADAPTER_ID,
  ANTHROPIC_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
} from '../constants/index.js';
import { inspectAnthropic } from '../inspection/index.js';

// immutable official Anthropic runtime adapter singleton
export const anthropicAdapter: IRuntimeAdapter = Object.freeze({
  id: ANTHROPIC_ADAPTER_ID,
  inspect: inspectAnthropic,
  supportedRepositoryFormatVersions: ANTHROPIC_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
});
