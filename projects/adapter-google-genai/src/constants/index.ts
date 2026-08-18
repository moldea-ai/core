import type { IRepositoryFormatVersion } from '@moldea.ai/core/format';

// immutable adapter and verified-target identity
export const GOOGLE_GENAI_ADAPTER_ID = 'google-genai';
export const GOOGLE_GENAI_GENERATE_CONTENT_RUNTIME_NAME = 'models.generateContent';
export const GOOGLE_GENAI_SDK_PACKAGE_NAME = '@google/genai';
export const GOOGLE_GENAI_SDK_SUPPORTED_RANGE = '>=2.17.1 <3.0.0';
export const GOOGLE_GENAI_SUPPORTED_REPOSITORY_FORMAT_VERSIONS = Object.freeze([
  1,
] satisfies readonly IRepositoryFormatVersion[]);

// provider declaration limits verified against @google/genai 2.17.1
export const GOOGLE_GENAI_FUNCTION_DECLARATION_LIMIT = 512;
export const GOOGLE_GENAI_FUNCTION_NAME_LIMIT = 128;
export const GOOGLE_GENAI_FUNCTION_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
