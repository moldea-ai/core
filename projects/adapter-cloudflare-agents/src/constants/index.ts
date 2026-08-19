import type { IRepositoryFormatVersion } from '@moldea.ai/core/format';

// immutable adapter, package, target, and compatibility identities
export const CLOUDFLARE_AGENTS_ADAPTER_ID = 'cloudflare-agents';
export const CLOUDFLARE_AGENTS_PACKAGE_NAME = 'agents';
export const CLOUDFLARE_AI_CHAT_PACKAGE_NAME = '@cloudflare/ai-chat';
export const CLOUDFLARE_THINK_PACKAGE_NAME = '@cloudflare/think';
export const AI_SDK_PACKAGE_NAME = 'ai';
export const CLOUDFLARE_THINK_TARGET_ID = 'typescript-think-0-16-ai-sdk-7';
export const CLOUDFLARE_AI_CHAT_TARGET_ID = 'typescript-ai-chat-agent-0-10-ai-sdk-7';
export const CLOUDFLARE_THINK_SUPPORTED_RANGE = '>=0.16.0 <0.17.0';
export const CLOUDFLARE_AI_CHAT_SUPPORTED_RANGE = '>=0.10.2 <0.11.0';
export const CLOUDFLARE_AGENTS_SUPPORTED_RANGE = '>=0.21.0 <0.22.0';
export const AI_SDK_SUPPORTED_RANGE = '>=7.0.0 <8.0.0';
export const CLOUDFLARE_AGENTS_SUPPORTED_REPOSITORY_FORMAT_VERSIONS = Object.freeze([
  1,
] satisfies readonly IRepositoryFormatVersion[]);
