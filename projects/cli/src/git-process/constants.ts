// arguments applied to every Git subprocess
export const GIT_PROCESS_GLOBAL_ARGUMENTS = [
  '--no-pager',
  '-c',
  'color.ui=false',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'submodule.recurse=false',
] as const;

// maximum bytes retained from Git stderr for safe failure classification
export const MAX_GIT_PROCESS_DIAGNOSTIC_BYTES = 4096;

// exact environment variables removed before executing Git
export const GIT_PROCESS_REMOVED_ENVIRONMENT_NAMES = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_CEILING_DIRECTORIES',
  'GIT_DISCOVERY_ACROSS_FILESYSTEM',
  'GIT_NAMESPACE',
  'GIT_SHALLOW_FILE',
  'GIT_CONFIG',
  'GIT_CONFIG_SYSTEM',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_NOSYSTEM',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_EXEC_PATH',
  'GIT_LITERAL_PATHSPECS',
  'GIT_GLOB_PATHSPECS',
  'GIT_NOGLOB_PATHSPECS',
  'GIT_ICASE_PATHSPECS',
] as const;

// environment-variable prefixes removed before executing Git
export const GIT_PROCESS_REMOVED_ENVIRONMENT_PREFIXES = [
  'GIT_CONFIG_KEY_',
  'GIT_CONFIG_VALUE_',
  'GIT_TRACE',
] as const;

// deterministic non-interactive environment applied to every Git subprocess
export const GIT_PROCESS_ENVIRONMENT_OVERRIDES = Object.freeze({
  LC_ALL: 'C',
  LANG: 'C',
  LANGUAGE: 'C',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_PAGER: '',
  PAGER: '',
  GIT_TERMINAL_PROMPT: '0',
  NO_COLOR: '1',
});
