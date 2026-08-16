import type {
  IAdapterDistribution,
  IAdapterImplementationKind,
  IAdapterImplementationStatus,
  IBindingSubject,
  IEvidenceKind,
  IPackageEcosystem,
  IPackageRole,
  IPatternKind,
  IPatternSupport,
  IProviderLimitKind,
  IProviderLimitSubject,
  IRuntimeGuidanceExpectation,
  IRuntimeTargetKind,
  IRuntimeTargetSupportLevel,
} from './types.ts';

// canonical repository paths used by matrix tooling
export const RUNTIME_COMPATIBILITY_SOURCE_PATH = 'compatibility/runtimes.yaml';
export const RUNTIME_COMPATIBILITY_DOCUMENT_PATH = 'docs/runtime-compatibility.md';
export const MOLDEA_CLI_RELEASE_METADATA_PATH =
  'projects/cli/src/release-metadata/release-metadata.generated.ts';

// complete official adapter-to-package identity map for matrix version 1
export const OFFICIAL_RUNTIME_ADAPTER_PACKAGES = {
  anthropic: '@moldea.ai/adapter-anthropic',
  'claude-agent-sdk': '@moldea.ai/adapter-claude-agent-sdk',
  'cloudflare-agents': '@moldea.ai/adapter-cloudflare-agents',
  custom: '@moldea.ai/core',
  eve: '@moldea.ai/adapter-eve',
  'google-genai': '@moldea.ai/adapter-google-genai',
  langchain: '@moldea.ai/adapter-langchain',
  langgraph: '@moldea.ai/adapter-langgraph',
  openai: '@moldea.ai/adapter-openai',
  'openai-agents-sdk': '@moldea.ai/adapter-openai-agents-sdk',
  'vercel-ai-sdk': '@moldea.ai/adapter-vercel-ai-sdk',
} as const;

// fixed matrix version 1 vocabularies
export const ADAPTER_DISTRIBUTIONS = [
  'private',
  'public',
] as const satisfies readonly IAdapterDistribution[];
export const ADAPTER_IMPLEMENTATION_KINDS = [
  'built-in',
  'package',
] as const satisfies readonly IAdapterImplementationKind[];
export const ADAPTER_IMPLEMENTATION_STATUSES = [
  'available',
  'deprecated',
  'in-development',
  'planned',
] as const satisfies readonly IAdapterImplementationStatus[];
export const BINDING_SUBJECTS = [
  'runtime-agent',
  'input-schema',
  'output-schema',
  'instruction-loader',
  'variable-provider',
  'tool-implementation',
  'tool-registration',
  'tool-input-schema',
  'tool-output-schema',
  'skill-implementation',
  'skill-registration',
] as const satisfies readonly IBindingSubject[];
export const EVIDENCE_KINDS = [
  'runtime-package',
  'language',
  'agent-definition',
  'instruction-loader',
  'schema',
  'tool-registration',
  'skill-registration',
  'handoff-registration',
  'variable-provider',
  'runtime-pattern',
] as const satisfies readonly IEvidenceKind[];
export const PACKAGE_ECOSYSTEMS = ['npm'] as const satisfies readonly IPackageEcosystem[];
export const PACKAGE_ROLES = ['primary', 'companion'] as const satisfies readonly IPackageRole[];
export const PATTERN_KINDS = [
  'agent',
  'tool',
  'skill',
  'schema',
  'instruction-loader',
  'variable-provider',
  'routing',
  'runtime',
] as const satisfies readonly IPatternKind[];
export const PATTERN_SUPPORT_LEVELS = [
  'full',
  'partial',
  'unsupported',
  'ambiguous',
] as const satisfies readonly IPatternSupport[];
export const PROVIDER_LIMIT_KINDS = [
  'max-unicode-scalars',
  'max-utf8-bytes',
  'pattern',
  'allowed-values',
  'other',
] as const satisfies readonly IProviderLimitKind[];
export const PROVIDER_LIMIT_SUBJECTS = [
  'agent-description',
  'handoff-description',
  'tool-name',
  'tool-description',
  'skill-name',
  'skill-description',
  'schema',
  'other',
] as const satisfies readonly IProviderLimitSubject[];
export const RUNTIME_GUIDANCE_EXPECTATIONS = [
  'optional',
  'recommended',
  'required',
] as const satisfies readonly IRuntimeGuidanceExpectation[];
export const RUNTIME_TARGET_KINDS = [
  'package',
  'custom',
] as const satisfies readonly IRuntimeTargetKind[];
export const RUNTIME_TARGET_SUPPORT_LEVELS = [
  'experimental',
  'supported',
  'deprecated',
] as const satisfies readonly IRuntimeTargetSupportLevel[];

// exact Unicode White_Space and line-break sets inherited from Repository Format version 1
export const REPOSITORY_FORMAT_WHITESPACE_RANGES = [
  [0x0009, 0x000d],
  [0x0020, 0x0020],
  [0x0085, 0x0085],
  [0x00a0, 0x00a0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
] as const;
export const REPOSITORY_FORMAT_LINE_BREAKS = new Set([0x000a, 0x000d, 0x0085, 0x2028, 0x2029]);
