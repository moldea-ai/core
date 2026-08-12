import { MOLDEA_CLI_COMMANDS } from '../command-line/index.js';

// stable safe messages for the CLI-owned errors implemented by this foundation
export const MOLDEA_CLI_ERROR_MESSAGES = {
  INTERNAL_ERROR: 'The command could not be completed.',
  INVALID_ARGUMENT: 'The command invocation is invalid.',
  RESOURCE_LIMIT_CONFIGURATION_INVALID: 'The resource-limit configuration is invalid.',
} as const;

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
