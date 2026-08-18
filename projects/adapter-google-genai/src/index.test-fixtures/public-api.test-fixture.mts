import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';
import { googleGenAiAdapter } from '@moldea.ai/adapter-google-genai';

const adapter: IRuntimeAdapter = googleGenAiAdapter;

void adapter;
