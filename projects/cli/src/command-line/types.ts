import type { MOLDEA_CLI_COMMANDS } from './constants.js';

// command names in the closed version 1 grammar
export type IMoldeaCliCommand = (typeof MOLDEA_CLI_COMMANDS)[keyof typeof MOLDEA_CLI_COMMANDS];

// effective resource configuration normalized from command-line overrides
export interface IMoldeaCliResourceLimits {
  readonly maxDiagnostics: number;
  readonly maxEntries: number;
  readonly maxEvidence: number;
  readonly maxFileBytes: number;
  readonly maxManifestBytes: number;
  readonly maxTotalBytes: number;
}

// normalized options shared by executable command handlers
export interface IMoldeaCliCommandOptions {
  readonly isColorDisabled: boolean;
  readonly isJson: boolean;
  readonly repositoryDirectory: string | null;
  readonly resourceLimits: IMoldeaCliResourceLimits;
}

// one supported command ready for private execution dispatch
export interface IMoldeaCliCommandInvocation {
  readonly command: IMoldeaCliCommand;
  readonly options: IMoldeaCliCommandOptions;
}

// CLI-owned errors produced while interpreting invocation syntax
export type IMoldeaCliArgumentErrorCode =
  'INVALID_ARGUMENT' | 'RESOURCE_LIMIT_CONFIGURATION_INVALID';

// discriminated parser outcomes for usage failures, commands, help, and version
export interface IMoldeaCliArgumentError {
  readonly code: IMoldeaCliArgumentErrorCode;
  readonly command: IMoldeaCliCommand | null;
  readonly isJson: boolean;
  readonly kind: 'error';
}

export interface IMoldeaCliCommandParseResult {
  readonly invocation: IMoldeaCliCommandInvocation;
  readonly kind: 'command';
}

export interface IMoldeaCliHelpParseResult {
  readonly command: IMoldeaCliCommand | null;
  readonly kind: 'help';
}

export interface IMoldeaCliVersionParseResult {
  readonly kind: 'version';
}

// complete result of parsing one process argument list
export type IMoldeaCliParseResult =
  | IMoldeaCliArgumentError
  | IMoldeaCliCommandParseResult
  | IMoldeaCliHelpParseResult
  | IMoldeaCliVersionParseResult;
