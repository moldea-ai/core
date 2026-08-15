import type { IRepositoryFormatVersion } from '@moldea.ai/core/format';

// immutable adapter and verified-target identity
export const OPENAI_ADAPTER_ID = 'openai';
export const OPENAI_RESPONSES_RUNTIME_NAME = 'responses.create';
export const OPENAI_SDK_PACKAGE_NAME = 'openai';
export const OPENAI_SDK_SUPPORTED_RANGE = '>=7.4.0 <8.0.0';
export const OPENAI_SUPPORTED_REPOSITORY_FORMAT_VERSIONS = Object.freeze([
  1,
] satisfies readonly IRepositoryFormatVersion[]);

// supported TypeScript ESM source extensions
export const OPENAI_TYPESCRIPT_SOURCE_EXTENSIONS = Object.freeze(['.mts', '.ts', '.tsx']);

// package dependency fields inspected in deterministic priority order
export const PACKAGE_DEPENDENCY_FIELDS = Object.freeze([
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'devDependencies',
] as const);
