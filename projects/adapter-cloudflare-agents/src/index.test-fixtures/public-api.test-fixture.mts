import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';
import { cloudflareAgentsAdapter } from '@moldea.ai/adapter-cloudflare-agents';

const adapter: IRuntimeAdapter = cloudflareAgentsAdapter;

void adapter;
