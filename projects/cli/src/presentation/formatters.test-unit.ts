// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type { ICoreDiagnostic } from '@moldea.ai/core';
import { parseRepositoryPath } from '@moldea.ai/repository';

import {
  MOLDEA_CLI_COMMAND_HELP,
  MOLDEA_CLI_GIT_WORKING_TREE_SOURCE,
  MOLDEA_CLI_TOP_LEVEL_HELP,
} from './constants.js';
import { createMoldeaCliOwnedError } from './errors.js';
import {
  formatMoldeaCliHelp,
  formatMoldeaCliHumanError,
  formatMoldeaCliHumanInspectResult,
  formatMoldeaCliHumanValidateResult,
  formatMoldeaCliJsonError,
  formatMoldeaCliJsonInspectResult,
  formatMoldeaCliJsonValidateResult,
} from './formatters.js';
import { createMoldeaCliInspectResult } from './transformers.js';

/** Creates one complete Core diagnostic for presentation tests. */
const createDiagnostic = (overrides: Partial<ICoreDiagnostic> = {}): ICoreDiagnostic => ({
  code: 'MOLDEA_MANIFEST_MISSING',
  details: Object.freeze({}),
  entity: null,
  message: 'The project manifest is missing.',
  path: parseRepositoryPath('/moldea/moldea.yaml'),
  pointer: null,
  range: null,
  source: 'core',
  ...overrides,
});

describe('CLI presentation formatters', () => {
  test('returns exact top-level and command help', () => {
    expect(formatMoldeaCliHelp(null)).toBe(MOLDEA_CLI_TOP_LEVEL_HELP);
    expect(formatMoldeaCliHelp('validate')).toBe(MOLDEA_CLI_COMMAND_HELP.validate);
    expect(formatMoldeaCliHelp('inspect')).toBe(MOLDEA_CLI_COMMAND_HELP.inspect);
    expect(formatMoldeaCliHelp('compatibility')).toBe(MOLDEA_CLI_COMMAND_HELP.compatibility);
  });

  test('formats one safe human error line', () => {
    expect(formatMoldeaCliHumanError(createMoldeaCliOwnedError('INVALID_ARGUMENT'))).toBe(
      'cli:INVALID_ARGUMENT The command invocation is invalid.\n',
    );
  });

  test('formats one compact deterministic JSON error document', () => {
    expect(
      formatMoldeaCliJsonError(createMoldeaCliOwnedError('INVALID_ARGUMENT'), null, '0.0.1'),
    ).toBe(
      '{"cliVersion":"0.0.1","command":null,"error":{"code":"INVALID_ARGUMENT","details":{},"message":"The command invocation is invalid.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
    );
  });

  test('formats the safe non-retryable resource-limit error', () => {
    expect(formatMoldeaCliHumanError(createMoldeaCliOwnedError('RESOURCE_LIMIT_EXCEEDED'))).toBe(
      'cli:RESOURCE_LIMIT_EXCEEDED A resource limit was exceeded.\n',
    );
    expect(
      formatMoldeaCliJsonError(
        createMoldeaCliOwnedError('RESOURCE_LIMIT_EXCEEDED'),
        'inspect',
        '0.0.1',
      ),
    ).toContain('"retryable":false,"source":"cli"');
  });

  test('formats the safe retryable working-tree instability error', () => {
    expect(formatMoldeaCliHumanError(createMoldeaCliOwnedError('WORKING_TREE_UNSTABLE'))).toBe(
      'cli:WORKING_TREE_UNSTABLE The working tree did not remain stable.\n',
    );
    expect(
      formatMoldeaCliJsonError(
        createMoldeaCliOwnedError('WORKING_TREE_UNSTABLE'),
        'validate',
        '0.0.1',
      ),
    ).toContain('"retryable":true,"source":"cli"');
  });

  test.each([
    ['GIT_NOT_FOUND', 'git:GIT_NOT_FOUND The Git executable is unavailable.\n', false],
    ['GIT_OUTPUT_INVALID', 'git:GIT_OUTPUT_INVALID Git returned invalid output.\n', false],
    [
      'GIT_REPOSITORY_NOT_FOUND',
      'git:GIT_REPOSITORY_NOT_FOUND The selected path is not inside a Git repository.\n',
      false,
    ],
    [
      'GIT_SPARSE_CHECKOUT_UNSUPPORTED',
      'git:GIT_SPARSE_CHECKOUT_UNSUPPORTED Sparse Git checkouts are unsupported.\n',
      false,
    ],
    ['GIT_VERSION_INVALID', 'git:GIT_VERSION_INVALID The Git version output is invalid.\n', false],
    [
      'GIT_VERSION_UNSUPPORTED',
      'git:GIT_VERSION_UNSUPPORTED The installed Git version is unsupported.\n',
      false,
    ],
    ['GIT_ACCESS_DENIED', 'git:GIT_ACCESS_DENIED Git access was denied.\n', true],
    ['GIT_COMMAND_FAILED', 'git:GIT_COMMAND_FAILED The Git command failed.\n', true],
    [
      'GIT_WORK_TREE_REQUIRED',
      'git:GIT_WORK_TREE_REQUIRED A usable Git working tree is required.\n',
      false,
    ],
  ] as const)('formats safe Git error %s', (code, expectedHumanError, isRetryable) => {
    const error = createMoldeaCliOwnedError(code);

    expect(formatMoldeaCliHumanError(error)).toBe(expectedHumanError);
    expect(formatMoldeaCliJsonError(error, 'validate', '0.0.1')).toContain(
      `"retryable":${String(isRetryable)},"source":"git"`,
    );
  });

  test('preserves a complete package-owned error in deterministic JSON output', () => {
    expect(
      formatMoldeaCliJsonError(
        Object.freeze({
          code: 'ENTRY_NOT_FOUND',
          details: Object.freeze({}),
          message: 'The requested repository entry was not found.',
          path: '/moldea/project.md',
          retryable: false,
          source: 'repository',
        }),
        'inspect',
        '0.0.1',
      ),
    ).toBe(
      '{"cliVersion":"0.0.1","command":"inspect","error":{"code":"ENTRY_NOT_FOUND","details":{},"message":"The requested repository entry was not found.","path":"/moldea/project.md","retryable":false,"source":"repository"},"result":null,"schemaVersion":1,"status":"error"}\n',
    );
  });

  test('formats exact valid human and JSON validation results', () => {
    const result = Object.freeze({
      diagnostics: Object.freeze([]),
      formatVersion: 1 as const,
      source: MOLDEA_CLI_GIT_WORKING_TREE_SOURCE,
    });

    expect(formatMoldeaCliHumanValidateResult(result)).toBe(
      'The moldea project is valid.\nRepository format: 1\n',
    );
    expect(formatMoldeaCliJsonValidateResult(result, '0.0.1')).toBe(
      '{"cliVersion":"0.0.1","command":"validate","error":null,"result":{"diagnostics":[],"formatVersion":1,"source":{"kind":"git-working-tree"}},"schemaVersion":1,"status":"valid"}\n',
    );
  });

  test('formats invalid diagnostics in supplied order with actionable locations and entities', () => {
    const manifestDiagnostic = createDiagnostic();
    const agentDiagnostic = createDiagnostic({
      code: 'MOLDEA_AGENT_INSTRUCTION_EMPTY',
      entity: Object.freeze({
        adapterId: 'openai',
        agentId: 'alpha',
        capabilityId: 'inspect',
        capabilityKind: 'tool',
        decisionId: '1767225600000',
        variableId: 'REGION',
      }),
      message: 'The agent instruction file is empty.',
      path: parseRepositoryPath('/moldea/agents/alpha/instruction.md'),
      pointer: '/agents/alpha/instruction',
      range: Object.freeze({
        end: Object.freeze({ column: 4, line: 2, offset: 8 }),
        start: Object.freeze({ column: 3, line: 2, offset: 7 }),
      }),
    });
    const result = Object.freeze({
      diagnostics: Object.freeze([manifestDiagnostic, agentDiagnostic]),
      formatVersion: 1 as const,
      source: MOLDEA_CLI_GIT_WORKING_TREE_SOURCE,
    });

    expect(formatMoldeaCliHumanValidateResult(result)).toBe(
      `The moldea project is invalid.
Repository format: 1
core:MOLDEA_MANIFEST_MISSING /moldea/moldea.yaml The project manifest is missing.
core:MOLDEA_AGENT_INSTRUCTION_EMPTY /moldea/agents/alpha/instruction.md:2:3 The agent instruction file is empty.
  pointer: /agents/alpha/instruction
  entity: agentId=alpha, capabilityKind=tool, capabilityId=inspect, decisionId=1767225600000, variableId=REGION, adapterId=openai
2 diagnostics.
`,
    );
  });

  test('omits an unavailable format and uses the singular diagnostic count', () => {
    const diagnostic = createDiagnostic({ path: null });
    const result = Object.freeze({
      diagnostics: Object.freeze([diagnostic]),
      formatVersion: null,
      source: MOLDEA_CLI_GIT_WORKING_TREE_SOURCE,
    });

    expect(formatMoldeaCliHumanValidateResult(result)).toBe(
      'The moldea project is invalid.\ncore:MOLDEA_MANIFEST_MISSING The project manifest is missing.\n1 diagnostic.\n',
    );
    expect(formatMoldeaCliJsonValidateResult(result, '0.0.1')).toBe(
      '{"cliVersion":"0.0.1","command":"validate","error":null,"result":{"diagnostics":[{"code":"MOLDEA_MANIFEST_MISSING","details":{},"entity":null,"message":"The project manifest is missing.","path":null,"pointer":null,"range":null,"source":"core"}],"formatVersion":null,"source":{"kind":"git-working-tree"}},"schemaVersion":1,"status":"invalid"}\n',
    );
  });

  test('formats invalid inspection evidence and diagnostics without exposing partial project data', () => {
    const manifestDiagnostic = createDiagnostic();
    const projectDiagnostic = createDiagnostic({
      code: 'MOLDEA_PROJECT_FILE_MISSING',
      message: 'The project file is missing.',
      path: parseRepositoryPath('/moldea/project.md'),
    });
    const result = createMoldeaCliInspectResult(
      Object.freeze({
        diagnostics: Object.freeze([manifestDiagnostic, projectDiagnostic]),
        evidence: Object.freeze([
          Object.freeze({
            agentId: 'alpha',
            capabilityId: null,
            capabilityKind: null,
            details: Object.freeze({ package: '@example/runtime' }),
            kind: 'runtime-package' as const,
            references: Object.freeze([]),
            runtimeName: 'example-runtime',
            source: 'example',
          }),
        ]),
        formatVersion: 1,
        project: null,
        valid: false,
      }),
    );

    expect(formatMoldeaCliHumanInspectResult(result)).toBe(
      `The moldea project is invalid.
Repository format: 1
Adapter evidence item: 1
core:MOLDEA_MANIFEST_MISSING /moldea/moldea.yaml The project manifest is missing.
core:MOLDEA_PROJECT_FILE_MISSING /moldea/project.md The project file is missing.
2 diagnostics.
`,
    );
    expect(formatMoldeaCliJsonInspectResult(result, '0.0.1')).toBe(
      '{"cliVersion":"0.0.1","command":"inspect","error":null,"result":{"inspection":{"diagnostics":[{"code":"MOLDEA_MANIFEST_MISSING","details":{},"entity":null,"message":"The project manifest is missing.","path":"/moldea/moldea.yaml","pointer":null,"range":null,"source":"core"},{"code":"MOLDEA_PROJECT_FILE_MISSING","details":{},"entity":null,"message":"The project file is missing.","path":"/moldea/project.md","pointer":null,"range":null,"source":"core"}],"evidence":[{"agentId":"alpha","capabilityId":null,"capabilityKind":null,"details":{"package":"@example/runtime"},"kind":"runtime-package","references":[],"runtimeName":"example-runtime","source":"example"}],"formatVersion":1,"project":null,"valid":false},"source":{"kind":"git-working-tree"}},"schemaVersion":1,"status":"invalid"}\n',
    );
  });
});
