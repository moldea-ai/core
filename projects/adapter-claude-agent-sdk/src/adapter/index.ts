import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import {
  CLAUDE_AGENT_SDK_ADAPTER_ID,
  CLAUDE_AGENT_SDK_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
} from '../constants/index.js';
import { inspectClaudeAgentSdk } from '../inspection/index.js';

// immutable official Claude Agent SDK runtime adapter singleton
export const claudeAgentSdkAdapter: IRuntimeAdapter = Object.freeze({
  id: CLAUDE_AGENT_SDK_ADAPTER_ID,
  inspect: inspectClaudeAgentSdk,
  supportedRepositoryFormatVersions: CLAUDE_AGENT_SDK_SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
});
