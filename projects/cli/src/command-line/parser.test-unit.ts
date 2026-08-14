// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { DEFAULT_MOLDEA_CLI_RESOURCE_LIMITS } from './constants.js';
import { parseMoldeaCliArguments } from './parser.js';

describe('parseMoldeaCliArguments', () => {
  test.each([
    [[], null],
    [['--help'], null],
    [['validate', '--help'], 'validate'],
    [['inspect', '--help'], 'inspect'],
    [['compatibility', '--help'], 'compatibility'],
  ])('parses help arguments %o', (commandLineArguments, expectedCommand) => {
    expect(parseMoldeaCliArguments(commandLineArguments)).toStrictEqual({
      command: expectedCommand,
      kind: 'help',
    });
  });

  test('parses the exact version invocation', () => {
    expect(parseMoldeaCliArguments(['--version'])).toStrictEqual({ kind: 'version' });
  });

  test.each(['validate', 'inspect', 'compatibility'])(
    'parses the %s command with default options',
    (command) => {
      const result = parseMoldeaCliArguments([command]);

      expect(result).toStrictEqual({
        invocation: {
          command,
          options: {
            isColorDisabled: false,
            isJson: false,
            repositoryDirectory: null,
            resourceLimits: DEFAULT_MOLDEA_CLI_RESOURCE_LIMITS,
          },
        },
        kind: 'command',
      });

      if (result.kind !== 'command') {
        throw new TypeError('Expected a normalized command result.');
      }

      expect(Object.isFrozen(result.invocation)).toBe(true);
      expect(Object.isFrozen(result.invocation.options)).toBe(true);
      expect(Object.isFrozen(result.invocation.options.resourceLimits)).toBe(true);
    },
  );

  test('normalizes every inspection option without mutating its input', () => {
    const commandLineArguments = [
      'inspect',
      '--repository',
      './fixture',
      '--json',
      '--no-color',
      '--max-entries',
      '32',
      '--max-file-bytes',
      '8',
      '--max-total-bytes',
      '16',
      '--max-manifest-bytes',
      '4',
      '--max-diagnostics',
      '64',
      '--max-evidence',
      '128',
    ];
    const originalArguments = [...commandLineArguments];

    expect(parseMoldeaCliArguments(commandLineArguments)).toStrictEqual({
      invocation: {
        command: 'inspect',
        options: {
          isColorDisabled: true,
          isJson: true,
          repositoryDirectory: './fixture',
          resourceLimits: {
            maxDiagnostics: 64,
            maxEntries: 32,
            maxEvidence: 128,
            maxFileBytes: 8,
            maxManifestBytes: 4,
            maxTotalBytes: 16,
          },
        },
      },
      kind: 'command',
    });
    expect(commandLineArguments).toStrictEqual(originalArguments);
  });

  test('normalizes every compatibility option', () => {
    expect(parseMoldeaCliArguments(['compatibility', '--json', '--no-color'])).toStrictEqual({
      invocation: {
        command: 'compatibility',
        options: {
          isColorDisabled: true,
          isJson: true,
          repositoryDirectory: null,
          resourceLimits: DEFAULT_MOLDEA_CLI_RESOURCE_LIMITS,
        },
      },
      kind: 'command',
    });
  });

  test.each([
    [['unknown'], null, false],
    [['--json'], null, true],
    [['--help', '--json'], null, true],
    [['--version', '--json'], null, true],
    [['validate', '--help', '--json'], 'validate', true],
    [['validate', '--version'], 'validate', false],
    [['validate', '--unknown'], 'validate', false],
    [['validate', 'extra'], 'validate', false],
    [['validate', '--json', '--json'], 'validate', true],
    [['validate', '--repository'], 'validate', false],
    [['validate', '--repository', '--json'], 'validate', true],
    [['validate', '--repository', ''], 'validate', false],
    [['validate', '--repository', 'before\0after'], 'validate', false],
    [['compatibility', '--repository', '.'], 'compatibility', false],
    [['compatibility', '--max-entries', '1'], 'compatibility', false],
  ])(
    'rejects invalid argument shape %o',
    (commandLineArguments, expectedCommand, expectedIsJson) => {
      expect(parseMoldeaCliArguments(commandLineArguments)).toStrictEqual({
        code: 'INVALID_ARGUMENT',
        command: expectedCommand,
        isJson: expectedIsJson,
        kind: 'error',
      });
    },
  );

  test.each(['0', '-1', '+1', '1.0', '1e3', '1_000', '9007199254740992'])(
    'rejects invalid resource value %s',
    (resourceValue) => {
      expect(parseMoldeaCliArguments(['validate', '--max-entries', resourceValue])).toStrictEqual({
        code: 'RESOURCE_LIMIT_CONFIGURATION_INVALID',
        command: 'validate',
        isJson: false,
        kind: 'error',
      });
    },
  );

  test('rejects duplicate value options and inconsistent byte limits', () => {
    expect(
      parseMoldeaCliArguments(['validate', '--max-entries', '1', '--max-entries', '2']),
    ).toStrictEqual({
      code: 'INVALID_ARGUMENT',
      command: 'validate',
      isJson: false,
      kind: 'error',
    });
    expect(parseMoldeaCliArguments(['validate', '--max-file-bytes', '1'])).toStrictEqual({
      code: 'RESOURCE_LIMIT_CONFIGURATION_INVALID',
      command: 'validate',
      isJson: false,
      kind: 'error',
    });
  });

  test('accepts the maximum safe integer when byte limits remain consistent', () => {
    const maximumSafeInteger = String(Number.MAX_SAFE_INTEGER);
    const result = parseMoldeaCliArguments([
      'validate',
      '--max-manifest-bytes',
      maximumSafeInteger,
      '--max-file-bytes',
      maximumSafeInteger,
      '--max-total-bytes',
      maximumSafeInteger,
    ]);

    expect(result).toMatchObject({
      invocation: {
        options: {
          resourceLimits: {
            maxFileBytes: Number.MAX_SAFE_INTEGER,
            maxManifestBytes: Number.MAX_SAFE_INTEGER,
            maxTotalBytes: Number.MAX_SAFE_INTEGER,
          },
        },
      },
      kind: 'command',
    });
  });
});
