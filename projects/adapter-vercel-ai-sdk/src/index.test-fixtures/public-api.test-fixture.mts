import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';
import { vercelAiSdkAdapter } from '@moldea.ai/adapter-vercel-ai-sdk';

const adapter: IRuntimeAdapter = vercelAiSdkAdapter;

void adapter;
