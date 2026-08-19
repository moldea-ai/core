import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';
import { claudeAgentSdkAdapter } from '@moldea.ai/adapter-claude-agent-sdk';

const adapter: IRuntimeAdapter = claudeAgentSdkAdapter;

void adapter;
