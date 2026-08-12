import type { ICoreResourceLimits } from '../contracts/index.js';
import type { IRepositoryFormatVersion } from '../format/index.js';

// official runtime adapter IDs recognized by this Core release
export const RECOGNIZED_RUNTIME_ADAPTER_IDS = Object.freeze([
  'anthropic',
  'claude-agent-sdk',
  'cloudflare-agents',
  'custom',
  'eve',
  'google-genai',
  'langchain',
  'langgraph',
  'openai',
  'openai-agents-sdk',
  'pydantic-ai',
  'vercel-ai-sdk',
] as const);

// repository-format major versions interpreted by this Core release
export const SUPPORTED_REPOSITORY_FORMAT_VERSIONS: readonly IRepositoryFormatVersion[] =
  Object.freeze([1]);

// default safety budgets applied independently to each Core operation
export const DEFAULT_CORE_RESOURCE_LIMITS: ICoreResourceLimits = Object.freeze({
  maxDiagnostics: 10_000,
  maxEntries: 100_000,
  maxEvidence: 10_000,
  maxFileBytes: 8_388_608,
  maxManifestBytes: 2_097_152,
  maxTotalBytesRead: 134_217_728,
});
