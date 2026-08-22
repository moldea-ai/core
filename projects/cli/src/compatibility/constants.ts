// exact first-class package identities required by every CLI release
export const MOLDEA_CLI_FOUNDATIONAL_PACKAGE_NAMES = Object.freeze([
  '@moldea.ai/core',
  '@moldea.ai/repository',
  '@moldea.ai/repository-fs',
] as const);

// stable package and adapter identities used by runtime compatibility validation
export const MOLDEA_CLI_ADAPTER_PACKAGE_PREFIX = '@moldea.ai/adapter-';
export const MOLDEA_CLI_CUSTOM_ADAPTER_ID = 'custom';
