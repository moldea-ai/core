import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';
import { anthropicAdapter } from '@moldea.ai/adapter-anthropic';

const adapter: IRuntimeAdapter = anthropicAdapter;

void adapter;
