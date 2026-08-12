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
});
