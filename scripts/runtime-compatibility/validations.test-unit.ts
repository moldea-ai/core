// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, test } from 'vitest';
import { parse, stringify } from 'yaml';

import { RECOGNIZED_RUNTIME_ADAPTER_IDS } from '../../projects/core/src/constants/index.ts';

import {
  OFFICIAL_RUNTIME_ADAPTER_PACKAGES,
  RUNTIME_COMPATIBILITY_SOURCE_PATH,
} from './constants.ts';
import type { IRuntimeAdapterEntry, IRuntimeCompatibilityMatrix, IRuntimeTarget } from './types.ts';
import { parseRuntimeCompatibilityMatrix } from './validations.ts';

const repositoryRoot = new URL('../../', import.meta.url);
let canonicalSource = '';
let canonicalMatrix: IRuntimeCompatibilityMatrix;
let repositoryReadme = '';

const cloneCanonicalMatrix = (): IRuntimeCompatibilityMatrix => structuredClone(canonicalMatrix);

const createPackageTarget = (
  supportLevel: IRuntimeTarget['supportLevel'] = 'supported',
): IRuntimeTarget => ({
  evidenceKinds: ['runtime-package'],
  id: 'typescript',
  kind: 'package',
  language: 'typescript',
  lastVerifiedAt: '2026-08-12',
  packages: [
    {
      ecosystem: 'npm',
      name: 'openai',
      role: 'primary',
      versionRange: '>=4.0.0 <5.0.0',
    },
  ],
  supportLevel,
});

const publishOpenAi = (
  matrix: IRuntimeCompatibilityMatrix,
  status: 'available' | 'deprecated' = 'available',
): IRuntimeAdapterEntry => {
  const adapter = matrix.adapters['openai'];

  if (adapter === undefined) {
    throw new Error('Canonical matrix is missing the openai adapter.');
  }

  adapter.implementation.versionRange = '^1.0.0';
  adapter.implementationStatus = status;
  adapter.supportedRepositoryFormatVersions = [1];
  adapter.compatibleCoreRange = '^1.0.0';
  adapter.runtimeGuidance = { expectation: 'optional' };
  adapter.targets = [createPackageTarget(status === 'deprecated' ? 'deprecated' : 'supported')];
  adapter.lastVerifiedAt = '2026-08-12';
  return adapter;
};

const expectIssue = (source: string, expectedMessage: string): void => {
  const result = parseRuntimeCompatibilityMatrix(source);

  expect(result.valid).toBe(false);
  if (!result.valid) {
    expect(
      result.issues.some(({ message }) =>
        message.toLocaleLowerCase('en-US').includes(expectedMessage.toLocaleLowerCase('en-US')),
      ),
    ).toBe(true);
  }
};

beforeAll(async () => {
  [canonicalSource, repositoryReadme] = await Promise.all([
    readFile(new URL(RUNTIME_COMPATIBILITY_SOURCE_PATH, repositoryRoot), 'utf8'),
    readFile(new URL('README.md', repositoryRoot), 'utf8'),
  ]);
  canonicalMatrix = parse(canonicalSource) as IRuntimeCompatibilityMatrix;
});

describe('runtime compatibility matrix validation', () => {
  test('accepts and normalizes the canonical adapter inventory', () => {
    const result = parseRuntimeCompatibilityMatrix(canonicalSource);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(Object.keys(result.matrix.adapters)).toStrictEqual([
        ...RECOGNIZED_RUNTIME_ADAPTER_IDS,
      ]);
      expect(Object.keys(result.matrix.adapters)).toStrictEqual(
        Object.keys(OFFICIAL_RUNTIME_ADAPTER_PACKAGES),
      );
      for (const [adapterId, packageName] of Object.entries(OFFICIAL_RUNTIME_ADAPTER_PACKAGES)) {
        if (adapterId !== 'custom') {
          expect(repositoryReadme).toContain(`| \`adapter-${adapterId}\``);
        }
        expect(repositoryReadme).toContain(`\`${packageName}\``);
      }
    }
  });

  test.each(['planned', 'in-development'] as const)(
    'accepts %s only without support claims',
    (status) => {
      const matrix = cloneCanonicalMatrix();
      const adapter = matrix.adapters['claude-agent-sdk'];

      if (adapter === undefined) {
        throw new Error('Canonical matrix is missing the Claude Agent SDK adapter.');
      }

      adapter.implementationStatus = status;
      expect(parseRuntimeCompatibilityMatrix(stringify(matrix)).valid).toBe(true);

      adapter.compatibleCoreRange = '^1.0.0';
      expectIssue(stringify(matrix), `${status} adapters must omit support fields`);
    },
  );

  test('accepts complete available and deprecated package-backed states', () => {
    const available = cloneCanonicalMatrix();
    publishOpenAi(available);
    expect(parseRuntimeCompatibilityMatrix(stringify(available)).valid).toBe(true);

    const deprecated = cloneCanonicalMatrix();
    publishOpenAi(deprecated, 'deprecated');
    expect(parseRuntimeCompatibilityMatrix(stringify(deprecated)).valid).toBe(true);
  });

  test('accepts the exact available built-in custom target contract', () => {
    const matrix = cloneCanonicalMatrix();
    const adapter = matrix.adapters['custom'];

    if (adapter === undefined) {
      throw new Error('Canonical matrix is missing the custom adapter.');
    }

    adapter.implementationStatus = 'available';
    adapter.supportedRepositoryFormatVersions = [1];
    adapter.compatibleCoreRange = '^1.0.0';
    adapter.runtimeGuidance = { expectation: 'optional' };
    adapter.targets = [
      {
        id: 'custom',
        kind: 'custom',
        language: 'any',
        lastVerifiedAt: '2026-08-12',
        patterns: [
          {
            description: 'Universal Core validation of explicit repository relationships.',
            id: 'explicit-repository-relationships',
            kind: 'runtime',
            support: 'full',
          },
        ],
        supportLevel: 'supported',
      },
    ];
    adapter.lastVerifiedAt = '2026-08-12';

    expect(parseRuntimeCompatibilityMatrix(stringify(matrix)).valid).toBe(true);
  });

  test.each([
    [
      'directive',
      (source: string) => `%YAML 1.2\n---\n${source}`,
      'YAML directives are prohibited',
    ],
    ['duplicate key', (source: string) => `${source}\nversion: 1\n`, 'Map keys must be unique'],
    [
      'multiple documents',
      (source: string) => `${source}\n---\nversion: 1\nadapters: {}\n`,
      'exactly one YAML document',
    ],
    [
      'anchor',
      (source: string) => source.replace('implementation:', 'implementation: &implementation'),
      'anchors are prohibited',
    ],
    [
      'alias',
      (source: string) =>
        source.replace('implementationStatus: planned', 'implementationStatus: *status'),
      'aliases are prohibited',
    ],
    [
      'custom tag',
      (source: string) => source.replace('version: 1', 'version: !custom 1'),
      'custom YAML tag',
    ],
    [
      'merge key',
      (source: string) => `${source}\nbase: &base {}\nmerged:\n  <<: *base\n`,
      'merge keys are prohibited',
    ],
    [
      'explicit null',
      (source: string) =>
        source.replace('implementationStatus: planned', 'implementationStatus: null'),
      'null values are prohibited',
    ],
    [
      'non-finite number',
      (source: string) => source.replace('version: 1', 'version: .nan'),
      'Non-finite numeric values are prohibited',
    ],
  ])('rejects strict YAML violation: %s', (_name, createSource, expectedMessage) => {
    expectIssue(createSource(canonicalSource), expectedMessage);
  });

  test('rejects unknown properties and incomplete official inventories', () => {
    const unknownProperty = cloneCanonicalMatrix();
    Object.assign(unknownProperty, { unexpected: true });
    expectIssue(stringify(unknownProperty), 'Unknown property');

    const incomplete = cloneCanonicalMatrix();
    delete incomplete.adapters['anthropic'];
    expectIssue(stringify(incomplete), 'complete official adapter set');
  });

  test('enforces exact package identity, version ranges, and one primary package', () => {
    const matrix = cloneCanonicalMatrix();
    const adapter = publishOpenAi(matrix);
    adapter.implementation.package = '@moldea.ai/adapter-wrong';
    adapter.implementation.versionRange = 'not a range';
    const target = adapter.targets?.[0];

    if (target?.packages === undefined) {
      throw new Error('Published test target is missing package requirements.');
    }

    target.packages.push({ ...target.packages[0]!, role: 'primary' });
    const result = parseRuntimeCompatibilityMatrix(stringify(matrix));

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.map(({ message }) => message)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Expected owning package'),
          expect.stringContaining('node-semver'),
          expect.stringContaining('exactly one primary'),
          expect.stringContaining('Duplicate value'),
        ]),
      );
    }
  });

  test('requires npm node-semver ranges and positive target capabilities', () => {
    const matrix = cloneCanonicalMatrix();
    const adapter = publishOpenAi(matrix);
    const target = adapter.targets?.[0];

    if (target?.packages === undefined) {
      throw new Error('Published test target is missing package requirements.');
    }

    target.packages[0] = {
      // @ts-expect-error verifies that runtime validation rejects non-npm matrix input
      ecosystem: 'pypi',
      name: 'openai',
      role: 'primary',
      versionRange: '>=2.0,<3.0',
    };
    delete target.evidenceKinds;
    const result = parseRuntimeCompatibilityMatrix(stringify(matrix));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.map(({ message }) => message)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Expected one of: npm'),
          expect.stringContaining('positive deterministic capability'),
        ]),
      );
    }

    const invalidName = cloneCanonicalMatrix();
    const invalidNameTarget = publishOpenAi(invalidName).targets?.[0];

    if (invalidNameTarget?.packages === undefined) {
      throw new Error('Published test target is missing package requirements.');
    }

    invalidNameTarget.packages[0]!.name = '@Invalid Scope/openai';
    expectIssue(stringify(invalidName), 'valid npm package name');
  });

  test('validates binding levels, provider-limit values, and date ordering', () => {
    const matrix = cloneCanonicalMatrix();
    const adapter = publishOpenAi(matrix);
    const target = adapter.targets?.[0];

    if (target === undefined) {
      throw new Error('Published test adapter is missing its target.');
    }

    target.bindingSupport = {
      'runtime-agent': { relationship: 'partial', symbol: 'full' },
    };
    target.providerLimits = [
      {
        description: 'Tool name length.',
        id: 'tool-name-limit',
        kind: 'max-unicode-scalars',
        subject: 'tool-name',
        value: 0,
      },
    ];
    target.lastVerifiedAt = '2026-08-13';
    const result = parseRuntimeCompatibilityMatrix(stringify(matrix));

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.map(({ message }) => message)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('cannot exceed'),
          expect.stringContaining('positive safe integer'),
          expect.stringContaining('must not be earlier'),
        ]),
      );
    }
  });

  test('accepts every verified pattern state and provider-limit value kind', () => {
    const matrix = cloneCanonicalMatrix();
    const adapter = publishOpenAi(matrix);
    const target = adapter.targets?.[0];

    if (target === undefined) {
      throw new Error('Published test adapter is missing its target.');
    }

    target.supportLevel = 'experimental';
    target.bindingSupport = {
      'runtime-agent': { relationship: 'full', symbol: 'partial' },
    };
    target.patterns = (['full', 'partial', 'unsupported', 'ambiguous'] as const).map((support) => ({
      description: `The ${support} runtime pattern.`,
      id: `${support}-pattern`,
      kind: 'runtime',
      support,
    }));
    target.providerLimits = [
      {
        description: 'Maximum tool-name scalar count.',
        id: 'max-scalars',
        kind: 'max-unicode-scalars',
        subject: 'tool-name',
        value: 64,
      },
      {
        description: 'Maximum schema byte count.',
        id: 'max-bytes',
        kind: 'max-utf8-bytes',
        subject: 'schema',
        value: 1024,
      },
      {
        description: 'Tool-name pattern.',
        id: 'name-pattern',
        kind: 'pattern',
        subject: 'tool-name',
        value: '^[a-z]+$',
      },
      {
        description: 'Allowed skill names.',
        id: 'allowed-names',
        kind: 'allowed-values',
        subject: 'skill-name',
        value: ['zeta', 'alpha'],
      },
      {
        description: 'Whether the runtime supports strict mode.',
        id: 'strict-mode',
        kind: 'other',
        subject: 'other',
        value: true,
      },
    ];
    target.knownLimitations = ['Generated registrations without source maps are not resolved.'];
    const result = parseRuntimeCompatibilityMatrix(stringify(matrix));

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.matrix.adapters['openai']?.targets?.[0]?.supportLevel).toBe('experimental');
      expect(
        result.matrix.adapters['openai']?.targets?.[0]?.providerLimits?.find(
          ({ id }) => id === 'allowed-names',
        )?.value,
      ).toStrictEqual(['alpha', 'zeta']);
    }
  });

  test('prohibits deprecated custom and invalid available custom targets', () => {
    const deprecated = cloneCanonicalMatrix();
    const deprecatedAdapter = deprecated.adapters['custom'];

    if (deprecatedAdapter === undefined) {
      throw new Error('Canonical matrix is missing the custom adapter.');
    }

    deprecatedAdapter.implementationStatus = 'deprecated';
    expectIssue(stringify(deprecated), 'custom adapter cannot be deprecated');

    const invalidAvailable = cloneCanonicalMatrix();
    const invalidAvailableAdapter = invalidAvailable.adapters['custom'];

    if (invalidAvailableAdapter === undefined) {
      throw new Error('Canonical matrix is missing the custom adapter.');
    }

    invalidAvailableAdapter.implementationStatus = 'available';
    invalidAvailableAdapter.supportedRepositoryFormatVersions = [1];
    invalidAvailableAdapter.compatibleCoreRange = '^1.0.0';
    invalidAvailableAdapter.runtimeGuidance = { expectation: 'required' };
    invalidAvailableAdapter.lastVerifiedAt = '2026-08-12';
    invalidAvailableAdapter.targets = [createPackageTarget('experimental')];
    expectIssue(stringify(invalidAvailable), 'custom adapter may contain only a custom target');
  });

  test('requires deprecated replacements to identify a different available adapter', () => {
    const matrix = cloneCanonicalMatrix();
    const adapter = publishOpenAi(matrix, 'deprecated');
    adapter.replacement = 'openai';
    expectIssue(stringify(matrix), 'cannot replace itself');

    adapter.replacement = 'claude-agent-sdk';
    expectIssue(stringify(matrix), 'Replacement must identify an available adapter');
  });

  test('uses exact version 1 whitespace and line-break predicates in matrix strings', () => {
    const valid = cloneCanonicalMatrix();
    valid.adapters['openai']!.notes = '\ufeffVisible\ufeff';
    expect(parseRuntimeCompatibilityMatrix(stringify(valid)).valid).toBe(true);

    const surroundingWhitespace = cloneCanonicalMatrix();
    const adapter = publishOpenAi(surroundingWhitespace);
    adapter.runtimeGuidance = { expectation: 'optional', notes: '\u2000Invalid' };
    expectIssue(stringify(surroundingWhitespace), 'without surrounding whitespace');

    adapter.runtimeGuidance.notes = 'Invalid\u0085line';
    expectIssue(stringify(surroundingWhitespace), 'single-line');
  });
});
