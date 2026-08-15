import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';
import { openAiAdapter } from '@moldea.ai/adapter-openai';

const adapter: IRuntimeAdapter = openAiAdapter;

void adapter;
