// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { createCore } from '@moldea.ai/core';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { googleGenAiAdapter } from '../adapter/index.js';
import { GOOGLE_GENAI_ADAPTER_DIAGNOSTICS } from '../diagnostics/index.js';

interface IGoogleGenAiFixture {
  readonly entries: readonly {
    readonly path: string;
    readonly text: string;
    readonly type: 'file';
  }[];
  readonly manifest: string;
}

type IFixtureReplacement = string | Uint8Array;

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-google-genai/cases.json', import.meta.url),
    'utf8',
  ),
) as IGoogleGenAiFixture;
const expectedEvidence = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-google-genai/evidence.expected.json', import.meta.url),
    'utf8',
  ),
) as readonly unknown[];
const expectedDiagnostics = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-google-genai/diagnostics.expected.json', import.meta.url),
    'utf8',
  ),
) as readonly { readonly code: string; readonly message: string }[];

const createEntries = (
  replacements: Readonly<Record<string, IFixtureReplacement>> = {},
): readonly IMemoryRepositoryEntry[] => [
  {
    content: replacements['/moldea/moldea.yaml'] ?? fixture.manifest,
    path: '/moldea/moldea.yaml',
    type: 'file',
  },
  ...fixture.entries.map((entry): IMemoryRepositoryEntry => ({
    content: replacements[entry.path] ?? entry.text,
    path: entry.path,
    type: 'file',
  })),
];

const inspect = async (replacements: Readonly<Record<string, IFixtureReplacement>> = {}) =>
  createCore({ adapters: [googleGenAiAdapter] }).inspectProject({
    repository: createMemoryRepositoryReader(createEntries(replacements)),
  });

const getFixtureText = (path: string): string => {
  const text = fixture.entries.find((entry) => entry.path === path)?.text;

  if (text === undefined) {
    throw new TypeError(`The ${path} fixture is required.`);
  }

  return text;
};

const createFunctionCollectionSource = (additionalDeclarationCount: number): string =>
  [
    "import { GoogleGenAI } from '@google/genai';",
    "import { findOrderDeclaration as registeredFindOrder } from './find-order.js';",
    "import { loadInstruction } from './instructions.js';",
    'const client = new GoogleGenAI();',
    'export const supportAgent = () => client.models.generateContent({',
    '  config: {',
    '    systemInstruction: loadInstruction(),',
    '    tools: [{',
    `      functionDeclarations: [registeredFindOrder, ${Array.from(
      { length: additionalDeclarationCount },
      (_, index) => `{ name: 'extra_${index}' }`,
    ).join(', ')}],`,
    '    }],',
    '  },',
    '});',
  ].join('\n');

const createDistinctFunctionCollectionSources = (
  additionalDeclarationCount: number,
): Readonly<Record<string, string>> => {
  const declarationNames = Array.from(
    { length: additionalDeclarationCount },
    (_, index) => `extraDeclaration${index}`,
  );

  return {
    '/src/agent.ts': [
      "import { GoogleGenAI } from '@google/genai';",
      `import { findOrderDeclaration as registeredFindOrder, ${declarationNames.join(', ')} } from './find-order.js';`,
      "import { loadInstruction } from './instructions.js';",
      'const client = new GoogleGenAI();',
      'export const supportAgent = () => client.models.generateContent({',
      '  config: {',
      '    systemInstruction: loadInstruction(),',
      `    tools: [{ functionDeclarations: [registeredFindOrder, ${declarationNames.join(', ')}] }],`,
      '  },',
      '});',
    ].join('\n'),
    '/src/find-order.ts': [
      "import { FindOrderInput } from './contracts.js';",
      'export const findOrder = async (orderId: string) => ({ orderId });',
      "export const findOrderDeclaration = { name: 'find_order', parametersJsonSchema: FindOrderInput } as const;",
      ...declarationNames.map(
        (name, index) => `export const ${name} = { name: 'extra_${index}' } as const;`,
      ),
    ].join('\n'),
  };
};

describe('googleGenAiAdapter Core integration', () => {
  test('keeps the diagnostic catalog synchronized with its conformance golden', () => {
    expect(
      Object.entries(GOOGLE_GENAI_ADAPTER_DIAGNOSTICS)
        .map(([code, message]) => ({ code, message }))
        .sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0)),
    ).toStrictEqual(expectedDiagnostics);
  });

  test('emits the complete normalized evidence for the supported target', async () => {
    const result = await inspect();

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.valid).toBe(true);
    expect(result.evidence).toEqual(expectedEvidence);
    expect(result.project).not.toBeNull();
  });

  test('produces deterministic evidence for reversed entry order and concurrent inspections', async () => {
    const reversed = await createCore({ adapters: [googleGenAiAdapter] }).inspectProject({
      repository: createMemoryRepositoryReader([...createEntries()].reverse()),
    });
    const concurrent = await Promise.all([inspect(), inspect(), inspect(), inspect()]);

    expect(reversed.evidence).toEqual(expectedEvidence);
    expect(concurrent.every(({ valid }) => valid)).toBe(true);
    expect(concurrent.map(({ evidence }) => evidence)).toEqual([
      expectedEvidence,
      expectedEvidence,
      expectedEvidence,
      expectedEvidence,
    ]);
  });

  test.each([
    ['GOOGLE_GENAI_PACKAGE_MANIFEST_INVALID', '/package.json', '{'],
    [
      'GOOGLE_GENAI_SDK_VERSION_UNSUPPORTED',
      '/package.json',
      '{"dependencies":{"@google/genai":"2.16.0"}}',
    ],
    ['GOOGLE_GENAI_SOURCE_TEXT_INVALID', '/src/agent.ts', Uint8Array.from([0xff])],
    ['GOOGLE_GENAI_SOURCE_SYNTAX_INVALID', '/src/agent.ts', 'export const supportAgent = (;'],
    [
      'GOOGLE_GENAI_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
      '/src/agent.ts',
      'export const anotherAgent = () => undefined;\n',
    ],
    [
      'GOOGLE_GENAI_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
      '/src/instructions.ts',
      "export const anotherLoader = () => 'instruction';\n",
    ],
    [
      'GOOGLE_GENAI_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
      '/src/find-order.ts',
      'export const findOrder = async () => undefined;\nexport const anotherDeclaration = {};\n',
    ],
    [
      'GOOGLE_GENAI_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/src/contracts.ts',
      'export const AnotherInput = {};\n',
    ],
  ] as const)('emits %s for the proved invalid state', async (expectedCode, path, replacement) => {
    const result = await inspect({ [path]: replacement });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toContain(expectedCode);
    expect(result.diagnostics.find(({ code }) => code === expectedCode)).toMatchObject({
      details: {},
      path,
      source: 'google-genai',
    });
  });

  test('emits independent instruction, name, and schema relationship diagnostics', async () => {
    const instructionResult = await inspect({
      '/src/agent.ts': getFixtureText('/src/agent.ts').replace(
        'systemInstruction: await readInstruction()',
        "systemInstruction: 'static'",
      ),
    });
    const nameResult = await inspect({
      '/src/find-order.ts': getFixtureText('/src/find-order.ts').replace(
        "name: 'find_order'",
        "name: '1 invalid name'",
      ),
    });
    const schemaResult = await inspect({
      '/src/find-order.ts': getFixtureText('/src/find-order.ts').replace(
        '  parametersJsonSchema: FindOrderInput,\n',
        '',
      ),
    });

    expect(instructionResult.diagnostics.map(({ code }) => code)).toStrictEqual([
      'GOOGLE_GENAI_INSTRUCTION_LOADER_NOT_WIRED',
    ]);
    expect(nameResult.diagnostics.map(({ code }) => code)).toStrictEqual([
      'GOOGLE_GENAI_TOOL_NAME_INVALID',
      'GOOGLE_GENAI_TOOL_NAME_MISMATCH',
    ]);
    expect(schemaResult.diagnostics.map(({ code }) => code)).toStrictEqual([
      'GOOGLE_GENAI_TOOL_INPUT_SCHEMA_NOT_WIRED',
    ]);
  });

  test('classifies omitted input schemas through existential and ambiguity rules', async () => {
    const registrationWithoutSchema = getFixtureText('/src/find-order.ts').replace(
      '  parametersJsonSchema: FindOrderInput,\n',
      '',
    );
    const manifestWithoutInputSchema = fixture.manifest.replace(
      '        inputSchema:\n          path: /src/contracts.ts\n          symbol: FindOrderInput\n',
      '',
    );
    const withoutManifestSchema = await inspect({
      '/moldea/moldea.yaml': manifestWithoutInputSchema,
      '/src/find-order.ts': registrationWithoutSchema,
    });
    const closedOmission = await inspect({
      '/src/find-order.ts': registrationWithoutSchema,
    });
    const wiredAlongsideOmission = await inspect({
      '/src/agent.ts': getFixtureText('/src/agent.ts').replace(
        'functionDeclarations: [registeredFindOrder]',
        "functionDeclarations: [registeredFindOrder, { name: 'without_parameters' }]",
      ),
    });
    const omittedAlongsideDynamicCandidate = await inspect({
      '/src/agent.ts': getFixtureText('/src/agent.ts').replace(
        'functionDeclarations: [registeredFindOrder]',
        'functionDeclarations: [registeredFindOrder, createDynamicDeclaration()]',
      ),
      '/src/find-order.ts': registrationWithoutSchema,
    });

    expect(withoutManifestSchema.diagnostics).toStrictEqual([]);
    expect(withoutManifestSchema.evidence.some(({ kind }) => kind === 'tool-registration')).toBe(
      true,
    );
    expect(withoutManifestSchema.evidence.some(({ kind }) => kind === 'schema')).toBe(false);
    expect(closedOmission.diagnostics.map(({ code }) => code)).toStrictEqual([
      'GOOGLE_GENAI_TOOL_INPUT_SCHEMA_NOT_WIRED',
    ]);
    expect(closedOmission.evidence.some(({ kind }) => kind === 'schema')).toBe(false);
    expect(wiredAlongsideOmission.diagnostics).toStrictEqual([]);
    expect(wiredAlongsideOmission.evidence.some(({ kind }) => kind === 'schema')).toBe(true);
    expect(omittedAlongsideDynamicCandidate.diagnostics).toStrictEqual([]);
    expect(
      omittedAlongsideDynamicCandidate.evidence.some(({ kind }) => kind === 'tool-registration'),
    ).toBe(true);
    expect(omittedAlongsideDynamicCandidate.evidence.some(({ kind }) => kind === 'schema')).toBe(
      false,
    );
  });

  test('distinguishes different static and unresolved dynamic schema values', async () => {
    const differentStaticSchema = await inspect({
      '/src/find-order.ts': getFixtureText('/src/find-order.ts').replace(
        'parametersJsonSchema: FindOrderInput',
        "parametersJsonSchema: { type: 'object' }",
      ),
    });
    const dynamicSchema = await inspect({
      '/src/find-order.ts': getFixtureText('/src/find-order.ts').replace(
        'parametersJsonSchema: FindOrderInput',
        'parametersJsonSchema: createSchema()',
      ),
    });

    expect(differentStaticSchema.diagnostics.map(({ code }) => code)).toStrictEqual([
      'GOOGLE_GENAI_TOOL_INPUT_SCHEMA_NOT_WIRED',
    ]);
    expect(differentStaticSchema.evidence.some(({ kind }) => kind === 'schema')).toBe(false);
    expect(dynamicSchema.diagnostics).toStrictEqual([]);
    expect(
      dynamicSchema.evidence.some(({ kind }) => kind === 'schema' || kind === 'tool-registration'),
    ).toBe(false);
  });

  test('recognizes safe module-local tool, container, and declaration collections', async () => {
    const result = await inspect({
      '/src/agent.ts': [
        "import { GoogleGenAI } from '@google/genai';",
        "import { findOrderDeclaration as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction } from './instructions.js';",
        'const client = new GoogleGenAI();',
        'const declarations = [registeredFindOrder];',
        'const functions = { functionDeclarations: declarations, googleSearch: dynamicSearch };',
        'const tools = [functions];',
        'tools.slice();',
        'export const supportAgent = () => client.models.generateContent({',
        '  config: { systemInstruction: loadInstruction(), tools },',
        '});',
      ].join('\n'),
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(['instruction-loader', 'tool-registration', 'schema']),
    );
  });

  test.each([
    ['an array mutation', 'tools.push(functions);'],
    ['an array alias', 'const aliasedTools = tools;'],
    ['an array escape', 'consume(tools);'],
    ['a dynamic tool', 'tools.push(createTool());'],
  ])('suppresses a false not-wired diagnostic for %s', async (_description, statement) => {
    const result = await inspect({
      '/src/agent.ts': [
        "import { GoogleGenAI } from '@google/genai';",
        "import { loadInstruction } from './instructions.js';",
        'const client = new GoogleGenAI();',
        'const functions = { functionDeclarations: [] };',
        'const tools = [functions];',
        statement,
        'export const supportAgent = () => client.models.generateContent({',
        '  config: { systemInstruction: loadInstruction(), tools },',
        '});',
      ].join('\n'),
    });

    expect(
      result.diagnostics.map(({ code }) => code).some((code) => code.endsWith('NOT_WIRED')),
    ).toBe(false);
    expect(result.evidence.some(({ kind }) => kind === 'tool-registration')).toBe(false);
  });

  test('keeps a mutated exported registration unresolved without false relationship evidence', async () => {
    const result = await inspect({
      '/src/find-order.ts': `${getFixtureText('/src/find-order.ts')}\nfindOrderDeclaration.name = 'changed';\n`,
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(({ kind }) => kind === 'schema' || kind === 'tool-registration'),
    ).toBe(false);
  });

  test('enforces the 512-function boundary for inline, repeated, and distinct declarations', async () => {
    const withinLimit = await inspect({ '/src/agent.ts': createFunctionCollectionSource(511) });
    const overLimit = await inspect({ '/src/agent.ts': createFunctionCollectionSource(512) });
    const repeated = await inspect({
      '/src/agent.ts': createFunctionCollectionSource(0).replace(
        'functionDeclarations: [registeredFindOrder, ],',
        `functionDeclarations: [${Array.from({ length: 513 }, () => 'registeredFindOrder').join(', ')}],`,
      ),
    });
    const distinct = await inspect(createDistinctFunctionCollectionSources(512));

    expect(withinLimit.diagnostics).toStrictEqual([]);
    expect(overLimit.diagnostics.map(({ code }) => code)).toStrictEqual([
      'GOOGLE_GENAI_FUNCTION_DECLARATION_LIMIT_EXCEEDED',
    ]);
    expect(repeated.diagnostics.map(({ code }) => code)).toStrictEqual([
      'GOOGLE_GENAI_FUNCTION_DECLARATION_LIMIT_EXCEEDED',
    ]);
    expect(distinct.diagnostics.map(({ code }) => code)).toStrictEqual([
      'GOOGLE_GENAI_FUNCTION_DECLARATION_LIMIT_EXCEEDED',
    ]);
  });

  test('keeps dynamic request and configuration candidates conservative', async () => {
    const result = await inspect({
      '/src/agent.ts': [
        "import { GoogleGenAI } from '@google/genai';",
        'const client = new GoogleGenAI();',
        'export const supportAgent = () => {',
        '  client.models.generateContent({ config: {} });',
        '  return client.models.generateContent(dynamicRequest);',
        '};',
      ].join('\n'),
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toStrictEqual([
      'language',
      'runtime-package',
      'runtime-pattern',
      'schema',
    ]);
  });

  test('propagates cancellation without returning partial success', async () => {
    const controller = new AbortController();
    controller.abort(new Error('test cancellation'));

    await expect(
      createCore({ adapters: [googleGenAiAdapter] }).inspectProject({
        repository: createMemoryRepositoryReader(createEntries()),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
