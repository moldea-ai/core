import type { IRepositoryFormatVersion } from '@moldea.ai/core/format';

// immutable adapter and verified-target identity
export const OPENAI_AGENTS_SDK_ADAPTER_ID = 'openai-agents-sdk';
export const OPENAI_AGENTS_SDK_PACKAGE_NAME = '@openai/agents';
export const OPENAI_AGENTS_SDK_SUPPORTED_RANGE = '>=0.16.1 <0.17.0';
export const OPENAI_AGENTS_SDK_TARGET_ID = 'typescript-agent-handoffs-0-16';
export const OPENAI_AGENTS_SDK_SUPPORTED_REPOSITORY_FORMAT_VERSIONS = Object.freeze([
  1,
] satisfies readonly IRepositoryFormatVersion[]);

// normalized explicit function-tool names supported by the initial target
export const OPENAI_AGENTS_SDK_TOOL_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
