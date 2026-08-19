import type { IRepositoryFormatVersion } from '@moldea.ai/core/format';

// immutable adapter and verified-target identity
export const CLAUDE_AGENT_SDK_ADAPTER_ID = 'claude-agent-sdk';
export const CLAUDE_AGENT_SDK_PACKAGE_NAME = '@anthropic-ai/claude-agent-sdk';
export const CLAUDE_AGENT_SDK_SUPPORTED_RANGE = '>=0.3.234 <0.4.0';
export const CLAUDE_AGENT_SDK_TARGET_ID = 'typescript-query-subagents-0-3';
export const CLAUDE_AGENT_SDK_SUPPORTED_REPOSITORY_FORMAT_VERSIONS = Object.freeze([
  1,
] satisfies readonly IRepositoryFormatVersion[]);

// query-level server keys that require no SDK runtime normalization
export const CLAUDE_AGENT_SDK_MCP_SERVER_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
