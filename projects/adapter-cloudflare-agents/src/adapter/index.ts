import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import {
  CLOUDFLARE_AGENTS_ADAPTER_ID,
  CLOUDFLARE_AGENTS_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
} from '../constants/index.js';
import { inspectCloudflareAgents } from '../inspection/index.js';

// immutable official Cloudflare Agents runtime adapter singleton
export const cloudflareAgentsAdapter: IRuntimeAdapter = Object.freeze({
  id: CLOUDFLARE_AGENTS_ADAPTER_ID,
  inspect: inspectCloudflareAgents,
  supportedRepositoryFormatVersions: CLOUDFLARE_AGENTS_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
});
