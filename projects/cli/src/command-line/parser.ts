import {
  DEFAULT_MOLDEA_CLI_RESOURCE_LIMITS,
  MOLDEA_CLI_COMMANDS,
  MOLDEA_CLI_OPTIONS,
} from './constants.js';
import type {
  IMoldeaCliArgumentError,
  IMoldeaCliArgumentErrorCode,
  IMoldeaCliCommand,
  IMoldeaCliCommandOptions,
  IMoldeaCliParseResult,
  IMoldeaCliResourceLimits,
} from './types.js';
import {
  areMoldeaCliResourceLimitsConsistent,
  isRepositoryDirectoryInputValid,
  parsePositiveSafeInteger,
} from './validations.js';

const COMMAND_NAMES = new Set<IMoldeaCliCommand>(Object.values(MOLDEA_CLI_COMMANDS));
const RESOURCE_OPTION_FIELDS = {
  [MOLDEA_CLI_OPTIONS.MaxDiagnostics]: 'maxDiagnostics',
  [MOLDEA_CLI_OPTIONS.MaxEntries]: 'maxEntries',
  [MOLDEA_CLI_OPTIONS.MaxEvidence]: 'maxEvidence',
  [MOLDEA_CLI_OPTIONS.MaxFileBytes]: 'maxFileBytes',
  [MOLDEA_CLI_OPTIONS.MaxManifestBytes]: 'maxManifestBytes',
  [MOLDEA_CLI_OPTIONS.MaxTotalBytes]: 'maxTotalBytes',
} as const satisfies Readonly<Record<string, keyof IMoldeaCliResourceLimits>>;

// mutable construction shape frozen before the normalized invocation is returned
type IMutableMoldeaCliResourceLimits = {
  -readonly [Key in keyof IMoldeaCliResourceLimits]: IMoldeaCliResourceLimits[Key];
};

const createArgumentError = (
  code: IMoldeaCliArgumentErrorCode,
  command: IMoldeaCliCommand | null,
  isJson: boolean,
): IMoldeaCliArgumentError => ({ code, command, isJson, kind: 'error' });

const isMoldeaCliCommand = (input: string | undefined): input is IMoldeaCliCommand => {
  return input !== undefined && COMMAND_NAMES.has(input as IMoldeaCliCommand);
};

/**
 * Parses the complete version 1 command grammar without mutating caller arguments.
 * @param commandLineArguments The process arguments after the executable path.
 * @returns A normalized command, informational request, or safe invocation error.
 */
export const parseMoldeaCliArguments = (
  commandLineArguments: readonly string[],
): IMoldeaCliParseResult => {
  const isJson = commandLineArguments.includes(MOLDEA_CLI_OPTIONS.Json);

  if (commandLineArguments.length === 0) {
    return { command: null, kind: 'help' };
  }

  const firstArgument = commandLineArguments[0];

  if (firstArgument === MOLDEA_CLI_OPTIONS.Help) {
    return commandLineArguments.length === 1
      ? { command: null, kind: 'help' }
      : createArgumentError('INVALID_ARGUMENT', null, isJson);
  }

  if (firstArgument === MOLDEA_CLI_OPTIONS.Version) {
    return commandLineArguments.length === 1
      ? { kind: 'version' }
      : createArgumentError('INVALID_ARGUMENT', null, isJson);
  }

  const command = isMoldeaCliCommand(firstArgument) ? firstArgument : null;

  if (command === null) {
    return createArgumentError('INVALID_ARGUMENT', null, isJson);
  }

  if (commandLineArguments.length === 2 && commandLineArguments[1] === MOLDEA_CLI_OPTIONS.Help) {
    return { command, kind: 'help' };
  }

  const seenOptions = new Set<string>();
  const resourceLimits: IMutableMoldeaCliResourceLimits = {
    ...DEFAULT_MOLDEA_CLI_RESOURCE_LIMITS,
  };
  let isColorDisabled = false;
  let repositoryDirectory: string | null = null;

  for (let index = 1; index < commandLineArguments.length; index += 1) {
    const option = commandLineArguments[index];

    if (option === undefined || seenOptions.has(option)) {
      return createArgumentError('INVALID_ARGUMENT', command, isJson);
    }

    seenOptions.add(option);

    if (option === MOLDEA_CLI_OPTIONS.Json) {
      continue;
    }

    if (option === MOLDEA_CLI_OPTIONS.NoColor) {
      isColorDisabled = true;
      continue;
    }

    if (option === MOLDEA_CLI_OPTIONS.Help || option === MOLDEA_CLI_OPTIONS.Version) {
      return createArgumentError('INVALID_ARGUMENT', command, isJson);
    }

    const resourceField = RESOURCE_OPTION_FIELDS[option as keyof typeof RESOURCE_OPTION_FIELDS];
    const isRepositoryOption = option === MOLDEA_CLI_OPTIONS.Repository;

    if (resourceField === undefined && !isRepositoryOption) {
      return createArgumentError('INVALID_ARGUMENT', command, isJson);
    }

    if (command === MOLDEA_CLI_COMMANDS.Compatibility) {
      return createArgumentError('INVALID_ARGUMENT', command, isJson);
    }

    const optionValue = commandLineArguments[index + 1];

    if (optionValue === undefined || optionValue.startsWith('--')) {
      return createArgumentError('INVALID_ARGUMENT', command, isJson);
    }

    index += 1;

    if (isRepositoryOption) {
      if (!isRepositoryDirectoryInputValid(optionValue)) {
        return createArgumentError('INVALID_ARGUMENT', command, isJson);
      }

      repositoryDirectory = optionValue;
      continue;
    }

    const parsedLimit = parsePositiveSafeInteger(optionValue);

    if (parsedLimit === null || resourceField === undefined) {
      return createArgumentError('RESOURCE_LIMIT_CONFIGURATION_INVALID', command, isJson);
    }

    resourceLimits[resourceField] = parsedLimit;
  }

  if (!areMoldeaCliResourceLimitsConsistent(resourceLimits)) {
    return createArgumentError('RESOURCE_LIMIT_CONFIGURATION_INVALID', command, isJson);
  }

  const options: IMoldeaCliCommandOptions = {
    isColorDisabled,
    isJson,
    repositoryDirectory,
    resourceLimits: Object.freeze({ ...resourceLimits }),
  };

  return {
    invocation: Object.freeze({ command, options: Object.freeze(options) }),
    kind: 'command',
  };
};
