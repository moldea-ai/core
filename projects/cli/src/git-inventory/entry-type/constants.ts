// fixed read-only query for the effective selected-repository symlink behavior
export const GIT_SYMLINK_CONFIGURATION_ARGUMENTS = [
  'config',
  '--type=bool',
  '--default=true',
  '--get',
  'core.symlinks',
] as const;
