import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';
import { openAiAgentsSdkAdapter } from '@moldea.ai/adapter-openai-agents-sdk';

const adapter: IRuntimeAdapter = openAiAgentsSdkAdapter;

void adapter;
