import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';
import { anthropicAdapter } from '@moldea.ai/adapter-anthropic';
import { openAiAdapter } from '@moldea.ai/adapter-openai';

// package-backed runtime adapters active in this CLI release
export const ACTIVE_RUNTIME_ADAPTERS: readonly IRuntimeAdapter[] = Object.freeze([
  anthropicAdapter,
  openAiAdapter,
]);
