// immutable adapter and verified target identities
export const EVE_ADAPTER_ID = 'eve';
export const EVE_PACKAGE_NAME = 'eve';
export const EVE_SUPPORTED_PACKAGE_RANGE = '>=0.39.1 <0.40.0';
export const EVE_TARGET_ID = 'typescript-filesystem-agent-0-39';
export const EVE_SUPPORTED_REPOSITORY_FORMAT_VERSIONS = Object.freeze([1] as const);

// Eve-authored module extensions used only for filesystem-slot preflight
export const EVE_AUTHORED_MODULE_EXTENSIONS = Object.freeze([
  '.cts',
  '.mts',
  '.cjs',
  '.mjs',
  '.ts',
  '.js',
] as const);

// runtime-visible names and grammars established by Eve 0.39.1
export const EVE_TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
export const EVE_RESERVED_TOOL_NAME = 'Workflow';
export const EVE_ALWAYS_RESERVED_TOOL_NAME = 'load_skill';
export const EVE_FRAMEWORK_TOOL_NAMES = Object.freeze([
  'ask_question',
  'bash',
  'glob',
  'grep',
  'read_file',
  'write_file',
  'todo',
  'web_fetch',
  'web_search',
  'agent',
  'connection_search',
  EVE_ALWAYS_RESERVED_TOOL_NAME,
] as const);
