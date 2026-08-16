import type { IRepositoryFormatVersion } from '@moldea.ai/core/format';

// immutable adapter and verified-target identity
export const ANTHROPIC_ADAPTER_ID = 'anthropic';
export const ANTHROPIC_MESSAGES_RUNTIME_NAME = 'messages.create';
export const ANTHROPIC_SDK_PACKAGE_NAME = '@anthropic-ai/sdk';
export const ANTHROPIC_SDK_SUPPORTED_RANGE = '>=0.117.1 <0.118.0';
export const ANTHROPIC_TOOL_NAME_MAX_SCALAR_LENGTH = 128;
export const ANTHROPIC_SUPPORTED_REPOSITORY_FORMAT_VERSIONS = Object.freeze([
  1,
] satisfies readonly IRepositoryFormatVersion[]);

// supported TypeScript ESM source extensions
export const ANTHROPIC_TYPESCRIPT_SOURCE_EXTENSIONS = Object.freeze(['.mts', '.ts', '.tsx']);
