import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import { EVE_ADAPTER_ID, EVE_SUPPORTED_REPOSITORY_FORMAT_VERSIONS } from '../constants/index.js';
import { inspectEve } from '../inspection/index.js';

// immutable official Eve runtime adapter singleton
export const eveAdapter: IRuntimeAdapter = Object.freeze({
  id: EVE_ADAPTER_ID,
  inspect: inspectEve,
  supportedRepositoryFormatVersions: EVE_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
});
