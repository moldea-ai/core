import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';
import { anthropicAdapter } from '@moldea.ai/adapter-anthropic';
import { claudeAgentSdkAdapter } from '@moldea.ai/adapter-claude-agent-sdk';
import { cloudflareAgentsAdapter } from '@moldea.ai/adapter-cloudflare-agents';
import { googleGenAiAdapter } from '@moldea.ai/adapter-google-genai';
import { openAiAdapter } from '@moldea.ai/adapter-openai';
import { openAiAgentsSdkAdapter } from '@moldea.ai/adapter-openai-agents-sdk';
import { vercelAiSdkAdapter } from '@moldea.ai/adapter-vercel-ai-sdk';

// package-backed runtime adapters active in this CLI release
export const ACTIVE_RUNTIME_ADAPTERS: readonly IRuntimeAdapter[] = Object.freeze([
  anthropicAdapter,
  claudeAgentSdkAdapter,
  cloudflareAgentsAdapter,
  googleGenAiAdapter,
  openAiAdapter,
  openAiAgentsSdkAdapter,
  vercelAiSdkAdapter,
]);
