import type { IRepositoryFormatVersion } from '@moldea.ai/core/format';

// immutable adapter and verified-target identity
export const VERCEL_AI_SDK_ADAPTER_ID = 'vercel-ai-sdk';
export const VERCEL_AI_SDK_PACKAGE_NAME = 'ai';
export const VERCEL_AI_SDK_SUPPORTED_RANGE = '>=7.0.66 <8.0.0';
export const VERCEL_AI_SDK_TOOL_LOOP_AGENT_TARGET_ID = 'typescript-tool-loop-agent-7';
export const VERCEL_AI_SDK_GENERATION_TARGET_ID = 'typescript-generate-stream-text-7';
export const VERCEL_AI_SDK_SUPPORTED_REPOSITORY_FORMAT_VERSIONS = Object.freeze([
  1,
] satisfies readonly IRepositoryFormatVersion[]);
