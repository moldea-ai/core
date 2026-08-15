import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';
import { openAiAdapter } from '@moldea.ai/adapter-openai';

// package-backed runtime adapters active in this CLI release
export const ACTIVE_RUNTIME_ADAPTERS: readonly IRuntimeAdapter[] = Object.freeze([openAiAdapter]);
