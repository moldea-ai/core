// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { createCore } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import { parseRepositoryPath, type IRepositoryReader } from '@moldea.ai/repository';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { anthropicAdapter } from '../adapter/index.js';
import { ANTHROPIC_ADAPTER_DIAGNOSTICS } from '../diagnostics/index.js';

interface IAnthropicFixture {
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
    new URL('../../../../fixtures/adapter-anthropic/cases.json', import.meta.url),
    'utf8',
  ),
) as IAnthropicFixture;
const expectedEvidence = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-anthropic/evidence.expected.json', import.meta.url),
    'utf8',
  ),
) as readonly unknown[];
const expectedDiagnostics = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-anthropic/diagnostics.expected.json', import.meta.url),
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

const inspectEntries = async (entries: readonly IMemoryRepositoryEntry[]) =>
  createCore({ adapters: [anthropicAdapter] }).inspectProject({
    repository: createMemoryRepositoryReader(entries),
  });

const inspect = async (replacements: Readonly<Record<string, IFixtureReplacement>> = {}) =>
  inspectEntries(createEntries(replacements));

const createNullPrototypeRecord = <Value extends object>(value: Value): Value =>
  Object.assign(Object.create(null) as Value, value);

const createExpectedDiagnostic = (
  code: keyof typeof ANTHROPIC_ADAPTER_DIAGNOSTICS,
  path: string,
  range: IAdapterDiagnostic['range'],
  capabilityId?: string,
): IAdapterDiagnostic => ({
  code,
  details: createNullPrototypeRecord({}),
  entity: createNullPrototypeRecord({
    agentId: 'support',
    ...(capabilityId === undefined ? {} : { capabilityId, capabilityKind: 'tool' as const }),
    adapterId: 'anthropic',
  }),
  message: ANTHROPIC_ADAPTER_DIAGNOSTICS[code],
  path: parseRepositoryPath(path),
  pointer: null,
  range,
  source: 'anthropic',
});

describe('anthropicAdapter Core integration', () => {
  test('keeps the diagnostic catalog synchronized with its conformance golden', () => {
    expect(
      Object.entries(ANTHROPIC_ADAPTER_DIAGNOSTICS)
        .map(([code, message]) => ({ code, message }))
        .sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0)),
    ).toStrictEqual(expectedDiagnostics);
  });

  test('emits the complete normalized evidence for the supported target', async () => {
    const result = await inspect();

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.valid).toBe(true);
    // JSON goldens cannot encode Core's null-prototype details records.
    expect(result.evidence).toEqual(expectedEvidence);
    expect(result.project).not.toBeNull();
  });

  test('produces identical evidence for reversed repository entry order', async () => {
    const result = await inspectEntries([...createEntries()].reverse());

    expect(result.valid).toBe(true);
    // JSON goldens cannot encode Core's null-prototype details records.
    expect(result.evidence).toEqual(expectedEvidence);
  });

  test.each([
    ['ANTHROPIC_PACKAGE_MANIFEST_INVALID', '/package.json', '{', null, undefined],
    [
      'ANTHROPIC_SDK_VERSION_UNSUPPORTED',
      '/package.json',
      '{"dependencies":{"@anthropic-ai/sdk":"0.116.0"}}',
      null,
      undefined,
    ],
    ['ANTHROPIC_SOURCE_TEXT_INVALID', '/src/agent.ts', Uint8Array.from([0xff]), null, undefined],
    [
      'ANTHROPIC_SOURCE_TEXT_INVALID',
      '/src/find-order.ts',
      Uint8Array.from([0xff]),
      null,
      'find-order',
    ],
    [
      'ANTHROPIC_SOURCE_SYNTAX_INVALID',
      '/src/agent.ts',
      'export const supportAgent = (;',
      {
        end: { column: 31, line: 1, offset: 30 },
        start: { column: 30, line: 1, offset: 29 },
      },
      undefined,
    ],
    [
      'ANTHROPIC_SOURCE_SYNTAX_INVALID',
      '/src/contracts.ts',
      'export const FindOrderInput = (;',
      {
        end: { column: 33, line: 1, offset: 32 },
        start: { column: 32, line: 1, offset: 31 },
      },
      'find-order',
    ],
    [
      'ANTHROPIC_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
      '/src/agent.ts',
      "import Anthropic from '@anthropic-ai/sdk';\nconst client = new Anthropic();\nexport const anotherAgent = () => client.messages.create({ input: 'x' });\n",
      null,
      undefined,
    ],
    [
      'ANTHROPIC_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
      '/src/instructions.ts',
      "export const anotherLoader = () => 'instruction';\n",
      null,
      undefined,
    ],
    [
      'ANTHROPIC_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
      '/src/find-order.ts',
      'export const findOrder = async () => undefined;\nexport const anotherTool = {};\n',
      null,
      'find-order',
    ],
    [
      'ANTHROPIC_INSTRUCTION_LOADER_NOT_WIRED',
      '/src/agent.ts',
      fixture.entries
        .find(({ path }) => path === '/src/agent.ts')
        ?.text.replace('system: readInstruction()', "system: 'static'") ?? '',
      {
        end: { column: 21, line: 12, offset: 396 },
        start: { column: 13, line: 12, offset: 388 },
      },
      undefined,
    ],
    [
      'ANTHROPIC_TOOL_REGISTRATION_NOT_WIRED',
      '/src/agent.ts',
      fixture.entries
        .find(({ path }) => path === '/src/agent.ts')
        ?.text.replace('tools: [registeredFindOrder]', 'tools: []') ?? '',
      {
        end: { column: 14, line: 14, offset: 453 },
        start: { column: 12, line: 14, offset: 451 },
      },
      'find-order',
    ],
    [
      'ANTHROPIC_TOOL_NAME_MISMATCH',
      '/src/find-order.ts',
      fixture.entries
        .find(({ path }) => path === '/src/find-order.ts')
        ?.text.replace("name: 'find_order'", "name: 'lookup_order'") ?? '',
      {
        end: { column: 23, line: 7, offset: 189 },
        start: { column: 9, line: 7, offset: 175 },
      },
      'find-order',
    ],
    [
      'ANTHROPIC_TOOL_INPUT_SCHEMA_NOT_WIRED',
      '/src/find-order.ts',
      fixture.entries
        .find(({ path }) => path === '/src/find-order.ts')
        ?.text.replace('input_schema: FindOrderInput', 'input_schema: {}') ?? '',
      {
        end: { column: 19, line: 9, offset: 264 },
        start: { column: 17, line: 9, offset: 262 },
      },
      'find-order',
    ],
    [
      'ANTHROPIC_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/src/contracts.ts',
      'export const AnotherInput = {};\n',
      null,
      'find-order',
    ],
  ] as const)(
    'emits only %s with its exact normalized location and entity',
    async (expectedCode, path, replacement, range, capabilityId) => {
      const result = await inspect({ [path]: replacement });

      expect(result.diagnostics).toStrictEqual([
        createExpectedDiagnostic(expectedCode, path, range, capabilityId),
      ]);
      expect(result.valid).toBe(false);
    },
  );

  test('reports an absent same-file input-schema symbol independently from registration shape', async () => {
    const registration = fixture.entries
      .find(({ path }) => path === '/src/find-order.ts')
      ?.text.replace("import { FindOrderInput } from './contracts.js';\n\n", '')
      .replace('input_schema: FindOrderInput', 'input_schema: MissingInput');

    if (registration === undefined) {
      throw new TypeError('The registration fixture is required.');
    }

    const result = await inspect({
      '/moldea/moldea.yaml': fixture.manifest.replace(
        'path: /src/contracts.ts\n          symbol: FindOrderInput',
        'path: /src/find-order.ts\n          symbol: MissingInput',
      ),
      '/src/find-order.ts': registration,
    });

    expect(result.diagnostics).toStrictEqual([
      createExpectedDiagnostic(
        'ANTHROPIC_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
        '/src/find-order.ts',
        null,
        'find-order',
      ),
    ]);
    expect(result.valid).toBe(false);
  });

  test('preserves package diagnostics independently from source-analysis failures', async () => {
    const result = await inspect({
      '/package.json': '{',
      '/src/find-order.ts': Uint8Array.from([0xff]),
    });

    expect(result.diagnostics).toStrictEqual([
      createExpectedDiagnostic('ANTHROPIC_PACKAGE_MANIFEST_INVALID', '/package.json', null),
      createExpectedDiagnostic(
        'ANTHROPIC_SOURCE_TEXT_INVALID',
        '/src/find-order.ts',
        null,
        'find-order',
      ),
    ]);
    expect(result.valid).toBe(false);
  });

  test.each([
    ['invalid UTF-8', Uint8Array.from([0xff])],
    ['NUL', new TextEncoder().encode('{"dependencies":{}}\0')],
  ])(
    'maps a package manifest with %s only to the package diagnostic',
    async (_description, content) => {
      const result = await inspect({ '/package.json': content });

      expect(result.diagnostics).toStrictEqual([
        createExpectedDiagnostic('ANTHROPIC_PACKAGE_MANIFEST_INVALID', '/package.json', null),
      ]);
      expect(result.valid).toBe(false);
    },
  );

  test('returns no false runtime diagnostic when the bound pattern is indirect', async () => {
    const result = await inspect({
      '/src/agent.ts': [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        "const request = { input: 'x' };",
        'export const supportAgent = () => client.messages.create(request);',
      ].join('\n'),
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toStrictEqual(['language', 'runtime-package']);
  });

  test('returns no runtime-pattern evidence for a shadowed Anthropic client', async () => {
    const result = await inspect({
      '/src/agent.ts': [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        'export const supportAgent = (client: Anthropic) =>',
        "  client.messages.create({ input: 'x' });",
      ].join('\n'),
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toStrictEqual(['language', 'runtime-package']);
  });

  test('rejects instruction and tool evidence through shadowed imports', async () => {
    const result = await inspect({
      '/src/agent.ts': [
        "import Anthropic from '@anthropic-ai/sdk';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        "import { registeredFindOrder } from './find-order.js';",
        'const client = new Anthropic();',
        'export const supportAgent = (readInstruction: () => string, registeredFindOrder: object) =>',
        '  client.messages.create({',
        '    system: readInstruction(),',
        '    tools: [registeredFindOrder],',
        '  });',
      ].join('\n'),
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
      'ANTHROPIC_INSTRUCTION_LOADER_NOT_WIRED',
    ]);
    expect(result.evidence.map(({ kind }) => kind)).toStrictEqual([
      'language',
      'runtime-package',
      'runtime-pattern',
      'schema',
    ]);
  });

  test('does not compare the manifest description with the Anthropic tool description', async () => {
    const registration = fixture.entries
      .find(({ path }) => path === '/src/find-order.ts')
      ?.text.replace(
        "description: 'Retrieves one order by its identifier.'",
        "description: 'Provider-specific wording.'",
      );

    if (registration === undefined) {
      throw new TypeError('The registration fixture is required.');
    }

    const result = await inspect({ '/src/find-order.ts': registration });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toContain('tool-registration');
  });

  test.each([
    ['one ASCII character', 'a'],
    ['64 ASCII characters', 'a'.repeat(64)],
    ['ASCII letters, digits, underscores, hyphens, and a leading digit', '42_Find-Order'],
  ])('accepts a client-tool name at %s', async (_description, toolName) => {
    const registration = fixture.entries
      .find(({ path }) => path === '/src/find-order.ts')
      ?.text.replace("name: 'find_order'", `name: '${toolName}'`);

    if (registration === undefined) {
      throw new TypeError('The registration fixture is required.');
    }

    const result = await inspect({
      '/moldea/moldea.yaml': fixture.manifest.replace('name: find_order', `name: ${toolName}`),
      '/src/find-order.ts': registration,
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toContain('tool-registration');
  });

  test('diagnoses an empty client-tool name and its independent mismatch', async () => {
    const registration = fixture.entries
      .find(({ path }) => path === '/src/find-order.ts')
      ?.text.replace("name: 'find_order'", "name: ''");

    if (registration === undefined) {
      throw new TypeError('The registration fixture is required.');
    }

    const result = await inspect({ '/src/find-order.ts': registration });

    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
      'ANTHROPIC_TOOL_NAME_INVALID',
      'ANTHROPIC_TOOL_NAME_MISMATCH',
    ]);
  });

  test.each([
    ['65 ASCII characters', 'a'.repeat(65)],
    ['whitespace', 'find order'],
    ['unsupported punctuation', 'find.order'],
    ['composed non-ASCII characters', 'café'],
    ['decomposed non-ASCII characters', 'cafe\u0301'],
  ])('rejects a client-tool name with %s', async (_description, toolName) => {
    const registration = fixture.entries
      .find(({ path }) => path === '/src/find-order.ts')
      ?.text.replace("name: 'find_order'", `name: '${toolName}'`);

    if (registration === undefined) {
      throw new TypeError('The registration fixture is required.');
    }

    const result = await inspect({
      '/moldea/moldea.yaml': fixture.manifest.replace('name: find_order', `name: ${toolName}`),
      '/src/find-order.ts': registration,
    });

    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
      'ANTHROPIC_TOOL_NAME_INVALID',
    ]);
    expect(result.evidence.map(({ kind }) => kind)).not.toContain('tool-registration');
  });

  test('diagnoses a client-tool name containing an unpaired surrogate escape', async () => {
    const registration = fixture.entries
      .find(({ path }) => path === '/src/find-order.ts')
      ?.text.replace("name: 'find_order'", String.raw`name: '\uD800'`);

    if (registration === undefined) {
      throw new TypeError('The registration fixture is required.');
    }

    const result = await inspect({ '/src/find-order.ts': registration });

    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
      'ANTHROPIC_TOOL_NAME_INVALID',
      'ANTHROPIC_TOOL_NAME_MISMATCH',
    ]);
    expect(result.evidence.map(({ kind }) => kind)).not.toContain('tool-registration');
  });

  test.each([
    ['omitted optional fields', ["  type: 'custom',\n", '  strict: true,\n'].join('')],
    ['a null type', "  type: 'custom',", '  type: null,'],
  ])('accepts a client tool with %s', async (_description, searchValue, replacement = '') => {
    const registration = fixture.entries
      .find(({ path }) => path === '/src/find-order.ts')
      ?.text.replace(searchValue, replacement);

    if (registration === undefined) {
      throw new TypeError('The registration fixture is required.');
    }

    const result = await inspect({ '/src/find-order.ts': registration });

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(['schema', 'tool-registration']),
    );
  });

  test('leaves a provider/server tool type unsupported', async () => {
    const registration = fixture.entries
      .find(({ path }) => path === '/src/find-order.ts')
      ?.text.replace("type: 'custom'", "type: 'computer_20241022'");

    if (registration === undefined) {
      throw new TypeError('The registration fixture is required.');
    }

    const result = await inspect({ '/src/find-order.ts': registration });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(({ kind }) => kind === 'schema' || kind === 'tool-registration'),
    ).toBe(false);
  });

  test('tolerates additional client-tool fields without interpreting their values', async () => {
    const registration = fixture.entries
      .find(({ path }) => path === '/src/find-order.ts')
      ?.text.replace(
        '  strict: true,\n',
        [
          '  strict: true,',
          '  allowed_callers: resolveAllowedCallers(),',
          '  cache_control: buildCacheControl(),',
          '  defer_loading: shouldDeferLoading(),',
          '  eager_input_streaming: shouldStreamInput(),',
          '  input_examples: buildInputExamples(),',
          '',
        ].join('\n'),
      );

    if (registration === undefined) {
      throw new TypeError('The registration fixture is required.');
    }

    const result = await inspect({ '/src/find-order.ts': registration });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(['schema', 'tool-registration']),
    );
  });

  test.each([
    ['an unknown property', '  unsupported_property: true,\n'],
    ['a shorthand property', '  allowed_callers,\n'],
    ['a computed property', "  ['allowed_callers']: [],\n"],
    ['a spread property', '  ...additionalProperties,\n'],
    ['a method', '  allowed_callers() { return []; },\n'],
    ['a getter', '  get allowed_callers() { return []; },\n'],
    ['a setter', '  set allowed_callers(value) {},\n'],
  ])('silently leaves a client tool with %s unsupported', async (_description, property) => {
    const registration = fixture.entries
      .find(({ path }) => path === '/src/find-order.ts')
      ?.text.replace('  strict: true,\n', `  strict: true,\n${property}`);

    if (registration === undefined) {
      throw new TypeError('The registration fixture is required.');
    }

    const result = await inspect({ '/src/find-order.ts': registration });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(({ kind }) => kind === 'schema' || kind === 'tool-registration'),
    ).toBe(false);
  });

  test('silently leaves a present but unsupported input-schema symbol unestablished', async () => {
    const result = await inspect({
      '/src/contracts.ts': 'export function FindOrderInput() { return {}; }\n',
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).not.toContain('schema');
    expect(result.evidence.map(({ kind }) => kind)).toContain('tool-registration');
  });

  test('leaves dynamically constructed registration input_schema unestablished', async () => {
    const registration = fixture.entries
      .find(({ path }) => path === '/src/find-order.ts')
      ?.text.replace(
        'export const findOrder = async',
        'const DynamicInput = buildSchema();\n\nexport const findOrder = async',
      )
      .replace('input_schema: FindOrderInput', 'input_schema: DynamicInput');

    if (registration === undefined) {
      throw new TypeError('The registration fixture is required.');
    }

    const result = await inspect({ '/src/find-order.ts': registration });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(({ kind }) => kind === 'schema' || kind === 'tool-registration'),
    ).toBe(false);
  });

  test('ignores unrelated dynamic request properties for both relationships', async () => {
    const agent = fixture.entries
      .find(({ path }) => path === '/src/agent.ts')
      ?.text.replace("model: 'claude-test'", 'model: selectModel()');

    if (agent === undefined) {
      throw new TypeError('The runtime-agent fixture is required.');
    }

    const result = await inspect({ '/src/agent.ts': agent });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(['instruction-loader', 'tool-registration']),
    );
  });

  test('keeps ambiguity local to the affected request relationship', async () => {
    const result = await inspect({
      '/src/agent.ts': [
        "import Anthropic from '@anthropic-ai/sdk';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new Anthropic();',
        'export const supportAgent = () =>',
        '  client.messages.create({',
        '    system: readInstruction(),',
        '    [dynamicKey]: dynamicValue,',
        '    tools: [registeredFindOrder],',
        '  });',
      ].join('\n'),
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).not.toContain('instruction-loader');
    expect(result.evidence.map(({ kind }) => kind)).toContain('tool-registration');
  });

  test('emits a negative diagnostic despite an unrelated dynamic request property', async () => {
    const result = await inspect({
      '/src/agent.ts': [
        "import Anthropic from '@anthropic-ai/sdk';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new Anthropic();',
        'export const supportAgent = () =>',
        '  client.messages.create({',
        "    system: 'static',",
        '    model: selectModel(),',
        '    tools: [registeredFindOrder],',
        '  });',
      ].join('\n'),
    });

    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
      'ANTHROPIC_INSTRUCTION_LOADER_NOT_WIRED',
    ]);
    expect(result.evidence.map(({ kind }) => kind)).toContain('tool-registration');
  });

  test('uses positive existential matching across multiple calls and a shorthand tool array', async () => {
    const result = await inspect({
      '/src/agent.ts': [
        "import Anthropic from '@anthropic-ai/sdk';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new Anthropic();',
        'const tools = [registeredFindOrder];',
        'export const supportAgent = async () => {',
        "  await client.messages.create({ system: 'static', tools: [] });",
        '  await client.messages.create({ system: await readInstruction(), tools });',
        '  return client.messages.create({ ...dynamicRequest });',
        '};',
      ].join('\n'),
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(['instruction-loader', 'runtime-pattern', 'tool-registration']),
    );
  });

  test('accepts additional statically resolvable Anthropic registrations in a closed tool array', async () => {
    const entries = createEntries({
      '/src/agent.ts': [
        "import Anthropic from '@anthropic-ai/sdk';",
        "import { extraTool } from './extra-tool.js';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new Anthropic();',
        'export const supportAgent = () =>',
        '  client.messages.create({',
        '    system: readInstruction(),',
        '    tools: [registeredFindOrder, extraTool],',
        '  });',
      ].join('\n'),
    });
    const result = await inspectEntries([
      ...entries,
      {
        content: [
          'export const extraTool = {',
          "  type: 'custom',",
          "  name: 'extra_tool',",
          '  input_schema: {},',
          '  strict: false,',
          '} as const;',
        ].join('\n'),
        path: '/src/extra-tool.ts',
        type: 'file',
      },
    ]);

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toContain('tool-registration');
  });

  test('keeps a closed tool array ambiguous when an additional registration name is invalid', async () => {
    const entries = createEntries({
      '/src/agent.ts': [
        "import Anthropic from '@anthropic-ai/sdk';",
        "import { extraTool } from './extra-tool.js';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new Anthropic();',
        'export const supportAgent = () =>',
        '  client.messages.create({',
        '    system: readInstruction(),',
        '    tools: [extraTool],',
        '  });',
        'void registeredFindOrder;',
      ].join('\n'),
    });
    const result = await inspectEntries([
      ...entries,
      {
        content: [
          'export const extraTool = {',
          "  type: 'custom',",
          "  name: 'invalid.name',",
          '  input_schema: {},',
          '  strict: false,',
          '} as const;',
        ].join('\n'),
        path: '/src/extra-tool.ts',
        type: 'file',
      },
    ]);

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).not.toContain('tool-registration');
  });

  test('emits negative relationship diagnostics only when every candidate is closed', async () => {
    const closedResult = await inspect({
      '/src/agent.ts': [
        "import Anthropic from '@anthropic-ai/sdk';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new Anthropic();',
        'export const supportAgent = async () => {',
        "  await client.messages.create({ system: 'static', tools: [] });",
        '  return client.messages.create({ input: 1 });',
        '};',
        'void registeredFindOrder;',
        'void readInstruction;',
      ].join('\n'),
    });
    const ambiguousResult = await inspect({
      '/src/agent.ts': [
        "import Anthropic from '@anthropic-ai/sdk';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new Anthropic();',
        'export const supportAgent = async () => {',
        '  await client.messages.create({ input: 1 });',
        '  return client.messages.create({ ...dynamicRequest });',
        '};',
        'void registeredFindOrder;',
        'void readInstruction;',
      ].join('\n'),
    });

    expect(closedResult.diagnostics.map(({ code }) => code)).toStrictEqual([
      'ANTHROPIC_INSTRUCTION_LOADER_NOT_WIRED',
      'ANTHROPIC_TOOL_REGISTRATION_NOT_WIRED',
    ]);
    expect(ambiguousResult.diagnostics).toStrictEqual([]);
  });

  test('suppresses negative relationship diagnostics for an aliased Messages candidate', async () => {
    const result = await inspect({
      '/src/agent.ts': [
        "import Anthropic from '@anthropic-ai/sdk';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new Anthropic();',
        'export const supportAgent = () => {',
        '  client.messages.create({ input: 1 });',
        '  const messages = client.messages;',
        '  return messages.create({',
        '    system: readInstruction(),',
        '    tools: [registeredFindOrder],',
        '  });',
        '};',
      ].join('\n'),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.valid).toBe(true);
    expect(result.evidence.map(({ kind }) => kind)).not.toContain('instruction-loader');
    expect(result.evidence.map(({ kind }) => kind)).not.toContain('tool-registration');
  });

  test.each([
    ['concise-arrow return', 'const exposeTools = () => tools;'],
    ['destructured member mutation', '({ next: tools[0] } = source);'],
  ])('does not trust a module tool array after a %s', async (_description, unsafeUse) => {
    const result = await inspect({
      '/src/agent.ts': [
        "import Anthropic from '@anthropic-ai/sdk';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new Anthropic();',
        'const tools = [registeredFindOrder];',
        unsafeUse,
        'export const supportAgent = () =>',
        '  client.messages.create({ system: readInstruction(), tools });',
      ].join('\n'),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.valid).toBe(true);
    expect(result.evidence.map(({ kind }) => kind)).not.toContain('tool-registration');
  });

  test('emits package and language evidence when the runtime binding omits a symbol', async () => {
    const result = await inspect({
      '/moldea/moldea.yaml': fixture.manifest.replace('        symbol: supportAgent\n', ''),
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toStrictEqual(['language', 'runtime-package']);
    expect(result.evidence.find(({ kind }) => kind === 'language')?.references).toStrictEqual([
      { path: '/src/agent.ts' },
    ]);
  });

  test('keeps package detection independent from the supported source-language target', async () => {
    const manifest = fixture.manifest.replaceAll('/src/agent.ts', '/src/agent.js');
    const result = await inspectEntries([
      ...createEntries({ '/moldea/moldea.yaml': manifest }),
      {
        content: 'export const supportAgent = () => undefined;\n',
        path: '/src/agent.js',
        type: 'file',
      },
    ]);

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toStrictEqual(['runtime-package']);
  });

  test('silently ignores a present but unsupported runtime symbol form', async () => {
    const result = await inspect({
      '/src/agent.ts': 'export class supportAgent {}\n',
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toStrictEqual(['language', 'runtime-package']);
  });

  test('emits one agent-scoped package observation per supported declaration', async () => {
    const result = await inspect({
      '/package.json': JSON.stringify({
        dependencies: { '@anthropic-ai/sdk': '^0.117.1' },
        peerDependencies: { '@anthropic-ai/sdk': '>=0.117.1 <0.118.0' },
      }),
    });
    const packageEvidence = result.evidence.filter(({ kind }) => kind === 'runtime-package');

    expect(packageEvidence).toHaveLength(2);
    expect(packageEvidence.map(({ agentId, details }) => ({ agentId, details }))).toEqual(
      expect.arrayContaining([
        {
          agentId: 'support',
          details: {
            compatibility: 'supported',
            declaredRange: '^0.117.1',
            dependencyKind: 'dependencies',
          },
        },
        {
          agentId: 'support',
          details: {
            compatibility: 'supported',
            declaredRange: '>=0.117.1 <0.118.0',
            dependencyKind: 'peerDependencies',
          },
        },
      ]),
    );
  });

  test('emits one unsupported-range diagnostic without package evidence', async () => {
    const result = await inspect({
      '/package.json': JSON.stringify({
        dependencies: { '@anthropic-ai/sdk': '0.116.0' },
        peerDependencies: { '@anthropic-ai/sdk': '<0.100.0' },
      }),
    });

    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'ANTHROPIC_SDK_VERSION_UNSUPPORTED',
    );
    expect(result.evidence.some(({ kind }) => kind === 'runtime-package')).toBe(false);
  });

  test('keeps shared-source evidence agent-scoped while reusing source and package reads', async () => {
    const entries: readonly IMemoryRepositoryEntry[] = [
      {
        content: [
          'version: 1',
          'agents:',
          '  alpha:',
          '    runtime:',
          '      id: anthropic',
          '    bindings:',
          '      runtimeAgent:',
          '        path: /src/agent.ts',
          '        symbol: sharedAgent',
          '  beta:',
          '    runtime:',
          '      id: anthropic',
          '    bindings:',
          '      runtimeAgent:',
          '        path: /src/agent.ts',
          '        symbol: sharedAgent',
          '',
        ].join('\n'),
        path: '/moldea/moldea.yaml',
        type: 'file',
      },
      { content: '# Shared source\n', path: '/moldea/project.md', type: 'file' },
      {
        content: 'Alpha agent.\n',
        path: '/moldea/agents/alpha/description.md',
        type: 'file',
      },
      {
        content: 'You are the `alpha` agent.\n',
        path: '/moldea/agents/alpha/instruction.md',
        type: 'file',
      },
      {
        content: 'Beta agent.\n',
        path: '/moldea/agents/beta/description.md',
        type: 'file',
      },
      {
        content: 'You are the `beta` agent.\n',
        path: '/moldea/agents/beta/instruction.md',
        type: 'file',
      },
      {
        content: JSON.stringify({ dependencies: { '@anthropic-ai/sdk': '^0.117.1' } }),
        path: '/package.json',
        type: 'file',
      },
      {
        content: [
          "import Anthropic from '@anthropic-ai/sdk';",
          'const client = new Anthropic();',
          'export const sharedAgent = () => client.messages.create({ input: 1 });',
        ].join('\n'),
        path: '/src/agent.ts',
        type: 'file',
      },
    ];
    const memoryRepository = createMemoryRepositoryReader(entries);
    const readCounts = new Map<string, number>();
    const repository: IRepositoryReader = {
      getEntry: (path, options) => memoryRepository.getEntry(path, options),
      listEntries: (options) => memoryRepository.listEntries(options),
      readFile: async (path, options) => {
        readCounts.set(path, (readCounts.get(path) ?? 0) + 1);
        return memoryRepository.readFile(path, options);
      },
    };
    const result = await createCore({ adapters: [anthropicAdapter] }).inspectProject({
      repository,
    });
    const packageEvidence = result.evidence.filter(({ kind }) => kind === 'runtime-package');

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.valid).toBe(true);
    expect(packageEvidence.map(({ agentId }) => agentId)).toStrictEqual(['alpha', 'beta']);
    expect(readCounts.get('/package.json')).toBe(1);
    expect(readCounts.get('/src/agent.ts')).toBe(1);
  });

  test('suppresses derived tool evidence for an unsupported registration shape', async () => {
    const registration = fixture.entries
      .find(({ path }) => path === '/src/find-order.ts')
      ?.text.replace(
        "description: 'Retrieves one order by its identifier.'",
        'description: buildDescription()',
      );

    if (registration === undefined) {
      throw new TypeError('The registration fixture is required.');
    }

    const result = await inspect({ '/src/find-order.ts': registration });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(({ kind }) => kind === 'schema' || kind === 'tool-registration'),
    ).toBe(false);
  });

  test('supports concurrent inspections with one immutable adapter singleton', async () => {
    const results = await Promise.all([inspect(), inspect(), inspect(), inspect()]);

    expect(results.every(({ valid }) => valid)).toBe(true);
    // JSON goldens cannot encode Core's null-prototype details records.
    expect(results.map(({ evidence }) => evidence)).toEqual([
      expectedEvidence,
      expectedEvidence,
      expectedEvidence,
      expectedEvidence,
    ]);
  });

  test('propagates cancellation without returning partial evidence', async () => {
    const controller = new AbortController();
    controller.abort(new Error('test cancellation'));

    await expect(
      createCore({ adapters: [anthropicAdapter] }).inspectProject({
        repository: createMemoryRepositoryReader(createEntries()),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
