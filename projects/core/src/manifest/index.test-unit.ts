// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { parseRepositoryPath, RepositoryPathException } from '@moldea.ai/repository';

import type { IRuntimeAdapterResult } from '../adapter/index.js';
import { createCore } from '../core/index.js';
import { CoreOperationException } from '../exceptions/index.js';

interface IInvalidManifestCase {
  readonly name: string;
  readonly content: string;
  readonly expectedDiagnostics: readonly unknown[];
}

const fixtureDirectory = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'fixtures',
  'core',
  'manifest',
);
const manifestPath = parseRepositoryPath('/moldea/moldea.yaml');
const readFixture = (fileName: string): string =>
  readFileSync(path.join(fixtureDirectory, fileName), 'utf8');
const invalidCases = JSON.parse(
  readFixture('invalid-cases.json'),
) as readonly IInvalidManifestCase[];
const toJsonValue = (candidate: unknown): unknown =>
  JSON.parse(JSON.stringify(candidate)) as unknown;

describe('Core manifest parsing', () => {
  test('parses the minimal manifest into a frozen normalized asset', async () => {
    const content = readFixture('valid-minimal.yaml');
    const normalizedContent = content.replace(/\r\n?/gu, '\n');
    const result = await createCore().parseManifest({ content, path: manifestPath });

    expect(result).toStrictEqual({
      asset: {
        content: normalizedContent,
        digest: 'sha256:09bfcc6a14b83e2192b8673677725c84883ee9cd0c70e45c9ec09daa8f2b2847',
        path: manifestPath,
        scalarLength: 11,
        utf8ByteLength: 11,
      },
      diagnostics: [],
      manifest: { version: 1 },
      valid: true,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.asset)).toBe(true);
    expect(Object.isFrozen(result.manifest)).toBe(true);
  });

  test('normalizes every version 1 field with canonical map and array ordering', async () => {
    const content = readFixture('valid-complete.yaml');
    const expected = JSON.parse(readFixture('valid-complete.expected.json')) as unknown;
    const result = await createCore().parseManifest({ content, path: manifestPath });

    expect(result.valid).toBe(true);
    expect(JSON.parse(JSON.stringify(result.manifest))).toStrictEqual(expected);
    expect(Object.keys(result.manifest?.agents ?? {})).toStrictEqual(['customer-support']);
    expect(Object.getPrototypeOf(result.manifest?.agents)).toBeNull();
    expect(Object.getPrototypeOf(result.manifest?.agents?.['customer-support']?.tools)).toBeNull();
    expect(Object.isFrozen(result.manifest?.agents?.['customer-support']?.bindings)).toBe(true);
  });

  test('normalizes equivalent mapping and array orders to equal manifest values', async () => {
    const left = await createCore().parseManifest({
      content: [
        'version: 1',
        'agents:',
        '  zeta:',
        '    runtime: { id: custom }',
        '    affectedBy: [/z/**, /a/**]',
        '  alpha:',
        '    runtime: { id: custom }',
        '',
      ].join('\n'),
      path: manifestPath,
    });
    const right = await createCore().parseManifest({
      content: [
        'agents:',
        '  alpha:',
        '    runtime:',
        '      id: custom',
        '  zeta:',
        '    affectedBy:',
        '      - /a/**',
        '      - /z/**',
        '    runtime:',
        '      id: custom',
        'version: 1',
        '',
      ].join('\n'),
      path: manifestPath,
    });

    expect(left.valid).toBe(true);
    expect(right.valid).toBe(true);
    expect(left.manifest).toStrictEqual(right.manifest);
    expect(Object.keys(left.manifest?.agents ?? {})).toStrictEqual(['alpha', 'zeta']);
    expect(left.manifest?.agents?.['zeta']?.affectedBy).toStrictEqual(['/a/**', '/z/**']);
  });

  test('does not rely on JavaScript property order for integer-like stable IDs', async () => {
    const createContent = (agentIds: readonly string[]): string => {
      return [
        'version: 1',
        'agents:',
        ...agentIds.flatMap((agentId) => [`  '${agentId}':`, '    runtime: { id: custom }']),
        '',
      ].join('\n');
    };
    const left = await createCore().parseManifest({
      content: createContent(['10', '2']),
      path: manifestPath,
    });
    const right = await createCore().parseManifest({
      content: createContent(['2', '10']),
      path: manifestPath,
    });

    expect(left.valid).toBe(true);
    expect(right.valid).toBe(true);
    expect(left.manifest).toStrictEqual(right.manifest);
    expect(Object.hasOwn(left.manifest?.agents ?? {}, '10')).toBe(true);
    expect(Object.hasOwn(left.manifest?.agents ?? {}, '2')).toBe(true);
  });

  test('preserves prototype-colliding record keys as inert own properties', async () => {
    const result = await createCore().parseManifest({
      content: [
        'version: 1',
        'unresolved:',
        '  constructor:',
        '    category: policy',
        '    effect: warning',
        '    description: The policy is unresolved.',
        '    resolution: Resolve the policy.',
        '',
      ].join('\n'),
      path: manifestPath,
    });

    expect(result.valid).toBe(true);
    expect(Object.getPrototypeOf(result.manifest?.unresolved)).toBeNull();
    expect(Object.hasOwn(result.manifest?.unresolved ?? {}, 'constructor')).toBe(true);
    expect(result.manifest?.unresolved?.['constructor']).toMatchObject({ category: 'policy' });
  });

  test('rejects capability and unresolved IDs duplicated within one agent scope', async () => {
    const result = await createCore().parseManifest({
      content: [
        'version: 1',
        'agents:',
        '  agent:',
        '    runtime: { id: custom }',
        '    tools:',
        '      shared:',
        '        name: shared',
        '        description: Performs the shared operation.',
        '        implementation: { path: /src/tool.ts }',
        '    skills:',
        '      shared:',
        '        name: shared',
        '        description: Applies the shared process.',
        '        implementation: { path: /skills/shared.md }',
        '',
      ].join('\n'),
      path: manifestPath,
    });

    expect(result.diagnostics).toMatchObject([
      {
        code: 'MOLDEA_ID_DUPLICATE',
        entity: { agentId: 'agent' },
        pointer: '/agents/agent/skills/shared',
      },
    ]);
  });

  test.each(invalidCases)(
    'returns all-or-nothing diagnostics for $name',
    async ({ content, expectedDiagnostics }) => {
      const result = await createCore().parseManifest({ content, path: manifestPath });

      expect(result.valid).toBe(false);
      expect(result.asset).toBeNull();
      expect(result.manifest).toBeNull();
      expect(toJsonValue(result.diagnostics)).toStrictEqual(expectedDiagnostics);
    },
  );

  test('rejects non-canonical manifest paths as content diagnostics', async () => {
    const path = parseRepositoryPath('/other.yaml');
    const result = await createCore().parseManifest({ content: 'version: 1\n', path });

    expect(result).toMatchObject({
      asset: null,
      diagnostics: [{ code: 'MOLDEA_MANIFEST_PATH_INVALID', path }],
      manifest: null,
      valid: false,
    });
  });

  test('stops schema interpretation after an unsupported version', async () => {
    const result = await createCore().parseManifest({
      content: 'version: 2\nfutureProperty: true\n',
      path: manifestPath,
    });

    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
      'MOLDEA_MANIFEST_VERSION_UNSUPPORTED',
    ]);
  });

  test.each([
    ['empty', ''],
    ['whitespace-only', '   \n'],
    ['comment-only', '# manifest comment\n'],
  ])('reports an invalid manifest root for %s YAML', async (_name, content) => {
    const result = await createCore().parseManifest({ content, path: manifestPath });

    expect(result).toMatchObject({
      asset: null,
      diagnostics: [{ code: 'MOLDEA_MANIFEST_ROOT_INVALID' }],
      manifest: null,
      valid: false,
    });
  });

  test.each([
    ['zero', 'version: 0\n'],
    ['negative', 'version: -1\n'],
    ['quoted', 'version: "1"\n'],
    ['float', 'version: 1.0\n'],
  ])('rejects %s as an invalid major version', async (_name, content) => {
    const result = await createCore().parseManifest({ content, path: manifestPath });

    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
      'MOLDEA_MANIFEST_VERSION_INVALID',
    ]);
  });

  test.each([
    ['signed plain integer', 'version: +1\n'],
    ['explicit double-quoted integer', 'version: !!int "1"\n'],
    ['explicit single-quoted integer', "version: !!int '1'\n"],
  ])('accepts the supported major through %s syntax', async (_name, content) => {
    await expect(
      createCore().parseManifest({ content, path: manifestPath }),
    ).resolves.toMatchObject({ diagnostics: [], manifest: { version: 1 }, valid: true });
  });

  test.each([
    [
      'a top-level relationship',
      `version: 1\ndecisions:\n  /moldea/decisions/1786050123456-${'a'.repeat(65)}.md:\n    affectedBy: [/src/**]\n`,
    ],
    [
      'an agent relationship',
      `version: 1\nagents:\n  agent:\n    runtime: { id: custom }\n    decisions: [/moldea/decisions/1786050123456-${'a'.repeat(65)}.md]\n`,
    ],
  ])('rejects an overlong decision slug in %s', async (_name, content) => {
    const result = await createCore().parseManifest({ content, path: manifestPath });

    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
      'MOLDEA_DECISION_FILENAME_INVALID',
    ]);
  });

  test.each(['/src/file?.ts', '/src/[ab].ts', '/src/{a,b}.ts'])(
    'rejects unsupported affectedBy metacharacters in %s',
    async (affectedPath) => {
      const result = await createCore().parseManifest({
        content: `version: 1\nagents:\n  agent:\n    runtime: { id: custom }\n    affectedBy: [${JSON.stringify(affectedPath)}]\n`,
        path: manifestPath,
      });

      expect(result.diagnostics.map(({ code }) => code)).toStrictEqual(['MOLDEA_GLOB_INVALID']);
    },
  );

  test('rejects mirror paths assigned to more than one agent', async () => {
    const result = await createCore().parseManifest({
      content: [
        'version: 1',
        'agents:',
        '  alpha:',
        '    runtime: { id: custom }',
        '    mirrors: [/generated/instruction.md]',
        '  beta:',
        '    runtime: { id: custom }',
        '    mirrors: [/generated/instruction.md]',
        '',
      ].join('\n'),
      path: manifestPath,
    });

    expect(result.diagnostics).toMatchObject([
      {
        code: 'MOLDEA_MIRROR_PATH_DUPLICATE',
        entity: { agentId: 'beta' },
        pointer: '/agents/beta/mirrors/0',
      },
    ]);
  });

  test('rejects escaped NUL values in symbols and capability descriptions', async () => {
    const result = await createCore().parseManifest({
      content: [
        'version: 1',
        'agents:',
        '  agent:',
        '    runtime: { id: custom }',
        '    tools:',
        '      lookup:',
        '        name: lookup',
        '        description: "escaped\\0nul"',
        '        implementation:',
        '          path: /src/tool.ts',
        '          symbol: "escaped\\0nul"',
        '',
      ].join('\n'),
      path: manifestPath,
    });

    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
      'MOLDEA_CAPABILITY_DESCRIPTION_INVALID',
      'MOLDEA_SYMBOL_INVALID',
    ]);
  });

  test.each([
    ['vertical tab', '\u000b'],
    ['form feed', '\u000c'],
  ])('accepts %s as non-line-breaking capability whitespace', async (_name, whitespace) => {
    const result = await createCore().parseManifest({
      content: [
        'version: 1',
        'agents:',
        '  agent:',
        '    runtime: { id: custom }',
        '    tools:',
        '      lookup:',
        '        name: lookup',
        `        description: ${JSON.stringify(`before${whitespace}after`)}`,
        '        implementation:',
        '          path: /src/tool.ts',
        '',
      ].join('\n'),
      path: manifestPath,
    });

    expect(result.diagnostics).toStrictEqual([]);
  });

  test('recognizes official runtime IDs independently from configured adapters', async () => {
    let inspectionCount = 0;
    const inspect = (): Promise<IRuntimeAdapterResult> => {
      inspectionCount += 1;
      return Promise.resolve({ diagnostics: [], evidence: [] });
    };
    const content = [
      'version: 1',
      'agents:',
      '  assistant:',
      '    runtime:',
      '      id: openai',
      '',
    ].join('\n');
    const unconfigured = await createCore().parseManifest({ content, path: manifestPath });
    const configured = await createCore({
      adapters: [{ id: 'openai', inspect, supportedRepositoryFormatVersions: [1] }],
    }).parseManifest({ content, path: manifestPath });

    expect(unconfigured.valid).toBe(true);
    expect(configured.valid).toBe(true);
    expect(inspectionCount).toBe(0);
  });

  test.each(['external', 'pydantic-ai'])(
    'rejects the unrecognized runtime ID %s',
    async (runtimeId) => {
      const result = await createCore().parseManifest({
        content: `version: 1\nagents:\n  assistant:\n    runtime: { id: ${runtimeId} }\n`,
        path: manifestPath,
      });

      expect(result.diagnostics).toMatchObject([
        {
          code: 'MOLDEA_RUNTIME_ID_INVALID',
          entity: { agentId: 'assistant' },
          pointer: '/agents/assistant/runtime/id',
        },
      ]);
    },
  );

  test('uses the manifest byte limit and operation in resource failures', async () => {
    const core = createCore({ limits: { maxFileBytes: 1, maxManifestBytes: 4 } });

    await expect(
      core.parseManifest({ content: 'version: 1\n', path: manifestPath }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxManifestBytes',
      operation: 'parse-manifest',
      retryable: false,
    });
  });

  test('uses typed failures for invalid arguments and forged logical paths', async () => {
    const core = createCore();

    await expect(core.parseManifest(null as never)).rejects.toBeInstanceOf(CoreOperationException);
    await expect(
      core.parseManifest({ content: 'version: 1\n', path: '/forged/../path' as never }),
    ).rejects.toBeInstanceOf(RepositoryPathException);
  });

  test('copies byte input before asynchronous hashing and returns no parser objects', async () => {
    const bytes = new TextEncoder().encode('version: 1\r\n');
    const promise = createCore().parseManifest({ content: bytes, path: manifestPath });

    bytes.fill(0);
    const result = await promise;

    expect(result).toMatchObject({
      asset: { content: 'version: 1\n' },
      diagnostics: [],
      manifest: { version: 1 },
      valid: true,
    });
    expect(JSON.stringify(result)).not.toContain('srcToken');
  });
});
