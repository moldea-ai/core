import { MOLDEA_CLI_COMMANDS } from '../command-line/index.js';

// stable safe presentation contracts for errors implemented by the CLI
export const MOLDEA_CLI_ERROR_DEFINITIONS = Object.freeze({
  COMPATIBILITY_STATE_INVALID: Object.freeze({
    message: 'The installed compatibility state is invalid.',
    retryable: false,
    source: 'cli',
  }),
  GIT_ACCESS_DENIED: Object.freeze({
    message: 'Git access was denied.',
    retryable: true,
    source: 'git',
  }),
  GIT_COMMAND_FAILED: Object.freeze({
    message: 'The Git command failed.',
    retryable: true,
    source: 'git',
  }),
  GIT_CONTENT_TRANSFORM_UNSUPPORTED: Object.freeze({
    message: 'The requested file uses an unsupported Git content transformation.',
    retryable: false,
    source: 'git',
  }),
  GIT_NOT_FOUND: Object.freeze({
    message: 'The Git executable is unavailable.',
    retryable: false,
    source: 'git',
  }),
  GIT_OUTPUT_INVALID: Object.freeze({
    message: 'Git returned invalid output.',
    retryable: false,
    source: 'git',
  }),
  GIT_REPOSITORY_NOT_FOUND: Object.freeze({
    message: 'The selected path is not inside a Git repository.',
    retryable: false,
    source: 'git',
  }),
  GIT_SPARSE_CHECKOUT_UNSUPPORTED: Object.freeze({
    message: 'Sparse Git checkouts are unsupported.',
    retryable: false,
    source: 'git',
  }),
  GIT_VERSION_INVALID: Object.freeze({
    message: 'The Git version output is invalid.',
    retryable: false,
    source: 'git',
  }),
  GIT_VERSION_UNSUPPORTED: Object.freeze({
    message: 'The installed Git version is unsupported.',
    retryable: false,
    source: 'git',
  }),
  GIT_WORK_TREE_REQUIRED: Object.freeze({
    message: 'A usable Git working tree is required.',
    retryable: false,
    source: 'git',
  }),
  INTERNAL_ERROR: Object.freeze({
    message: 'The command could not be completed.',
    retryable: false,
    source: 'cli',
  }),
  INVALID_ARGUMENT: Object.freeze({
    message: 'The command invocation is invalid.',
    retryable: false,
    source: 'cli',
  }),
  RESOURCE_LIMIT_CONFIGURATION_INVALID: Object.freeze({
    message: 'The resource-limit configuration is invalid.',
    retryable: false,
    source: 'cli',
  }),
  RESOURCE_LIMIT_EXCEEDED: Object.freeze({
    message: 'A resource limit was exceeded.',
    retryable: false,
    source: 'cli',
  }),
  WORKING_TREE_UNSTABLE: Object.freeze({
    message: 'The working tree did not remain stable.',
    retryable: true,
    source: 'cli',
  }),
} as const);

// source descriptor for results derived from the selected Git working tree
export const MOLDEA_CLI_GIT_WORKING_TREE_SOURCE = Object.freeze({
  kind: 'git-working-tree' as const,
});

// top-level help presented without repository access
export const MOLDEA_CLI_TOP_LEVEL_HELP = `Usage: moldea <command> [options]

Commands:
  validate       Validate the current moldea project.
  inspect        Inspect the current moldea project.
  compatibility  Report the installed CLI compatibility state.

Global options:
  --help     Show top-level help.
  --version  Show the CLI version.

Run "moldea <command> --help" for command-specific options.
`;

const INSPECTION_OPTIONS_HELP = `Options:
  --repository <path>                Select a Git working-tree directory.
  --json                             Emit one machine-readable JSON result.
  --no-color                         Disable ANSI styling in human output.
  --max-entries <integer>            Override the repository entry limit.
  --max-file-bytes <integer>         Override the per-file byte limit.
  --max-total-bytes <integer>        Override the total cached-byte limit.
  --max-manifest-bytes <integer>     Override the manifest byte limit.
  --max-diagnostics <integer>        Override the diagnostic count limit.
  --max-evidence <integer>           Override the adapter evidence count limit.
  --help                             Show this help.
`;

// complete command-specific help keyed by the closed command set
export const MOLDEA_CLI_COMMAND_HELP = {
  [MOLDEA_CLI_COMMANDS.Compatibility]: `Usage: moldea compatibility [options]

Report the installed CLI compatibility state.

Options:
  --json      Emit one machine-readable JSON result.
  --no-color  Disable ANSI styling in human output.
  --help      Show this help.
`,
  [MOLDEA_CLI_COMMANDS.Inspect]: `Usage: moldea inspect [options]

Inspect the current moldea project.

${INSPECTION_OPTIONS_HELP}`,
  [MOLDEA_CLI_COMMANDS.Validate]: `Usage: moldea validate [options]

Validate the current moldea project.

${INSPECTION_OPTIONS_HELP}`,
} as const;
