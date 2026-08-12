// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { MOLDEA_CLI_COMMAND_HELP, MOLDEA_CLI_TOP_LEVEL_HELP } from './constants.js';
import {
  formatMoldeaCliHelp,
  formatMoldeaCliHumanError,
  formatMoldeaCliJsonError,
} from './formatters.js';

describe('CLI presentation formatters', () => {
  test('returns exact top-level and command help', () => {
    expect(formatMoldeaCliHelp(null)).toBe(MOLDEA_CLI_TOP_LEVEL_HELP);
    expect(formatMoldeaCliHelp('validate')).toBe(MOLDEA_CLI_COMMAND_HELP.validate);
    expect(formatMoldeaCliHelp('inspect')).toBe(MOLDEA_CLI_COMMAND_HELP.inspect);
    expect(formatMoldeaCliHelp('compatibility')).toBe(MOLDEA_CLI_COMMAND_HELP.compatibility);
  });

  test('formats one safe human error line', () => {
    expect(formatMoldeaCliHumanError('INVALID_ARGUMENT')).toBe(
      'cli:INVALID_ARGUMENT The command invocation is invalid.\n',
    );
  });

  test('formats one compact deterministic JSON error document', () => {
    expect(formatMoldeaCliJsonError('INVALID_ARGUMENT', null, '0.0.1')).toBe(
      '{"cliVersion":"0.0.1","command":null,"error":{"code":"INVALID_ARGUMENT","details":{},"message":"The command invocation is invalid.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
    );
  });

  test.each([
    ['GIT_NOT_FOUND', 'git:GIT_NOT_FOUND The Git executable is unavailable.\n', false],
    ['GIT_VERSION_INVALID', 'git:GIT_VERSION_INVALID The Git version output is invalid.\n', false],
    [
      'GIT_VERSION_UNSUPPORTED',
      'git:GIT_VERSION_UNSUPPORTED The installed Git version is unsupported.\n',
      false,
    ],
    ['GIT_ACCESS_DENIED', 'git:GIT_ACCESS_DENIED Git access was denied.\n', true],
    ['GIT_COMMAND_FAILED', 'git:GIT_COMMAND_FAILED The Git command failed.\n', true],
  ] as const)('formats safe Git error %s', (code, expectedHumanError, isRetryable) => {
    expect(formatMoldeaCliHumanError(code)).toBe(expectedHumanError);
    expect(formatMoldeaCliJsonError(code, 'validate', '0.0.1')).toContain(
      `"retryable":${String(isRetryable)},"source":"git"`,
    );
  });
});
