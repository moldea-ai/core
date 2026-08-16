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

import { openAiAdapter } from '../adapter/index.js';
import { OPENAI_ADAPTER_DIAGNOSTICS } from '../diagnostics/index.js';

interface IOpenAiFixture {
  readonly entries: readonly {
    readonly path: string;
    readonly text: string;
    readonly type: 'file';
  }[];
  readonly manifest: string;
}

type IFixtureReplacement = string | Uint8Array;

const fixture = JSON.parse(
  readFileSync(new URL('../../../../fixtures/adapter-openai/cases.json', import.meta.url), 'utf8'),
) as IOpenAiFixture;
const expectedEvidence = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-openai/evidence.expected.json', import.meta.url),
    'utf8',
  ),
) as readonly unknown[];
const expectedDiagnostics = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-openai/diagnostics.expected.json', import.meta.url),
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
  createCore({ adapters: [openAiAdapter] }).inspectProject({
    repository: createMemoryRepositoryReader(entries),
  });

const inspect = async (replacements: Readonly<Record<string, IFixtureReplacement>> = {}) =>
  inspectEntries(createEntries(replacements));

const createNullPrototypeRecord = <Value extends object>(value: Value): Value =>
  Object.assign(Object.create(null) as Value, value);

const createExpectedDiagnostic = (
  code: keyof typeof OPENAI_ADAPTER_DIAGNOSTICS,
  path: string,
  range: IAdapterDiagnostic['range'],
  capabilityId?: string,
): IAdapterDiagnostic => ({
  code,
  details: createNullPrototypeRecord({}),
  entity: createNullPrototypeRecord({
    agentId: 'support',
    ...(capabilityId === undefined ? {} : { capabilityId, capabilityKind: 'tool' as const }),
    adapterId: 'openai',
  }),
  message: OPENAI_ADAPTER_DIAGNOSTICS[code],
  path: parseRepositoryPath(path),
  pointer: null,
  range,
  source: 'openai',
});

describe('openAiAdapter Core integration', () => {
  test('keeps the diagnostic catalog synchronized with its conformance golden', () => {
    expect(
      Object.entries(OPENAI_ADAPTER_DIAGNOSTICS)
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
    ['OPENAI_PACKAGE_MANIFEST_INVALID', '/package.json', '{', null, undefined],
    [
      'OPENAI_SDK_VERSION_UNSUPPORTED',
      '/package.json',
      '{"dependencies":{"openai":"7.3.0"}}',
      null,
      undefined,
    ],
    ['OPENAI_SOURCE_TEXT_INVALID', '/src/agent.ts', Uint8Array.from([0xff]), null, undefined],
    [
      'OPENAI_SOURCE_TEXT_INVALID',
      '/src/find-order.ts',
      Uint8Array.from([0xff]),
      null,
      'find-order',
    ],
    [
      'OPENAI_SOURCE_SYNTAX_INVALID',
      '/src/agent.ts',
      'export const supportAgent = (;',
      {
        end: { column: 31, line: 1, offset: 30 },
        start: { column: 30, line: 1, offset: 29 },
      },
      undefined,
    ],
    [
      'OPENAI_SOURCE_SYNTAX_INVALID',
      '/src/contracts.ts',
      'export const FindOrderInput = (;',
      {
        end: { column: 33, line: 1, offset: 32 },
        start: { column: 32, line: 1, offset: 31 },
      },
      'find-order',
    ],
    [
      'OPENAI_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
      '/src/agent.ts',
      "import OpenAI from 'openai';\nconst client = new OpenAI();\nexport const anotherAgent = () => client.responses.create({ input: 'x' });\n",
      null,
      undefined,
    ],
    [
      'OPENAI_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
      '/src/instructions.ts',
      "export const anotherLoader = () => 'instruction';\n",
      null,
      undefined,
    ],
    [
      'OPENAI_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
      '/src/find-order.ts',
      'export const findOrder = async () => undefined;\nexport const anotherTool = {};\n',
      null,
      'find-order',
    ],
    [
      'OPENAI_INSTRUCTION_LOADER_NOT_WIRED',
      '/src/agent.ts',
      fixture.entries
        .find(({ path }) => path === '/src/agent.ts')
        ?.text.replace('instructions: readInstruction()', "instructions: 'static'") ?? '',
      {
        end: { column: 27, line: 12, offset: 380 },
        start: { column: 19, line: 12, offset: 372 },
      },
      undefined,
    ],
    [
      'OPENAI_TOOL_REGISTRATION_NOT_WIRED',
      '/src/agent.ts',
      fixture.entries
        .find(({ path }) => path === '/src/agent.ts')
        ?.text.replace('tools: [registeredFindOrder]', 'tools: []') ?? '',
      {
        end: { column: 14, line: 14, offset: 437 },
        start: { column: 12, line: 14, offset: 435 },
      },
      'find-order',
    ],
    [
      'OPENAI_TOOL_NAME_MISMATCH',
      '/src/find-order.ts',
      fixture.entries
        .find(({ path }) => path === '/src/find-order.ts')
        ?.text.replace("name: 'find_order'", "name: 'lookup_order'") ?? '',
      {
        end: { column: 23, line: 7, offset: 191 },
        start: { column: 9, line: 7, offset: 177 },
      },
      'find-order',
    ],
    [
      'OPENAI_TOOL_INPUT_SCHEMA_NOT_WIRED',
      '/src/find-order.ts',
      fixture.entries
        .find(({ path }) => path === '/src/find-order.ts')
        ?.text.replace('parameters: FindOrderInput', 'parameters: {}') ?? '',
      {
        end: { column: 17, line: 9, offset: 264 },
        start: { column: 15, line: 9, offset: 262 },
      },
      'find-order',
    ],
    [
      'OPENAI_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
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
      .replace('parameters: FindOrderInput', 'parameters: MissingInput');

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
        'OPENAI_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
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
      createExpectedDiagnostic('OPENAI_PACKAGE_MANIFEST_INVALID', '/package.json', null),
      createExpectedDiagnostic(
        'OPENAI_SOURCE_TEXT_INVALID',
        '/src/find-order.ts',
        null,
        'find-order',
      ),
    ]);
    expect(result.valid).toBe(false);
  });

  test('returns no false runtime diagnostic when the bound pattern is indirect', async () => {
    const result = await inspect({
      '/src/agent.ts': [
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        "const request = { input: 'x' };",
        'export const supportAgent = () => client.responses.create(request);',
      ].join('\n'),
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toStrictEqual(['language', 'runtime-package']);
  });

  test('returns no runtime-pattern evidence for a shadowed OpenAI client', async () => {
    const result = await inspect({
      '/src/agent.ts': [
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        'export const supportAgent = (client: OpenAI) =>',
        "  client.responses.create({ input: 'x' });",
      ].join('\n'),
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toStrictEqual(['language', 'runtime-package']);
  });

  test('rejects instruction and tool evidence through shadowed imports', async () => {
    const result = await inspect({
      '/src/agent.ts': [
        "import OpenAI from 'openai';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        "import { registeredFindOrder } from './find-order.js';",
        'const client = new OpenAI();',
        'export const supportAgent = (readInstruction: () => string, registeredFindOrder: object) =>',
        '  client.responses.create({',
        '    instructions: readInstruction(),',
        '    tools: [registeredFindOrder],',
        '  });',
      ].join('\n'),
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
      'OPENAI_INSTRUCTION_LOADER_NOT_WIRED',
    ]);
    expect(result.evidence.map(({ kind }) => kind)).toStrictEqual([
      'language',
      'runtime-package',
      'runtime-pattern',
      'schema',
    ]);
  });

  test('does not compare the manifest description with the OpenAI tool description', async () => {
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

  test('tolerates additional FunctionTool fields without interpreting their values', async () => {
    const registration = fixture.entries
      .find(({ path }) => path === '/src/find-order.ts')
      ?.text.replace(
        '  strict: true,\n',
        [
          '  strict: true,',
          '  allowed_callers: resolveAllowedCallers(),',
          '  defer_loading: shouldDeferLoading(),',
          '  output_schema: buildOutputSchema(),',
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
  ])('silently leaves a FunctionTool with %s unsupported', async (_description, property) => {
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

  test('leaves dynamically constructed registration parameters unestablished', async () => {
    const registration = fixture.entries
      .find(({ path }) => path === '/src/find-order.ts')
      ?.text.replace(
        'export const findOrder = async',
        'const DynamicInput = buildSchema();\n\nexport const findOrder = async',
      )
      .replace('parameters: FindOrderInput', 'parameters: DynamicInput');

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
      ?.text.replace("model: 'gpt-5'", 'model: selectModel()');

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
        "import OpenAI from 'openai';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new OpenAI();',
        'export const supportAgent = () =>',
        '  client.responses.create({',
        '    instructions: readInstruction(),',
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
        "import OpenAI from 'openai';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new OpenAI();',
        'export const supportAgent = () =>',
        '  client.responses.create({',
        "    instructions: 'static',",
        '    model: selectModel(),',
        '    tools: [registeredFindOrder],',
        '  });',
      ].join('\n'),
    });

    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
      'OPENAI_INSTRUCTION_LOADER_NOT_WIRED',
    ]);
    expect(result.evidence.map(({ kind }) => kind)).toContain('tool-registration');
  });

  test('uses positive existential matching across multiple calls and a reusable tool array', async () => {
    const result = await inspect({
      '/src/agent.ts': [
        "import OpenAI from 'openai';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new OpenAI();',
        'const tools = [registeredFindOrder];',
        'export const supportAgent = async () => {',
        "  await client.responses.create({ instructions: 'static', tools: [] });",
        '  await client.responses.create({ instructions: await readInstruction(), tools: tools });',
        '  return client.responses.create({ ...dynamicRequest });',
        '};',
      ].join('\n'),
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(['instruction-loader', 'runtime-pattern', 'tool-registration']),
    );
  });

  test('accepts additional statically resolvable OpenAI registrations in a closed tool array', async () => {
    const entries = createEntries({
      '/src/agent.ts': [
        "import OpenAI from 'openai';",
        "import { extraTool } from './extra-tool.js';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new OpenAI();',
        'export const supportAgent = () =>',
        '  client.responses.create({',
        '    instructions: readInstruction(),',
        '    tools: [registeredFindOrder, extraTool],',
        '  });',
      ].join('\n'),
    });
    const result = await inspectEntries([
      ...entries,
      {
        content: [
          'export const extraTool = {',
          "  type: 'function',",
          "  name: 'extra_tool',",
          '  parameters: {},',
          '  strict: null,',
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

  test('emits negative relationship diagnostics only when every candidate is closed', async () => {
    const closedResult = await inspect({
      '/src/agent.ts': [
        "import OpenAI from 'openai';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new OpenAI();',
        'export const supportAgent = async () => {',
        "  await client.responses.create({ instructions: 'static', tools: [] });",
        '  return client.responses.create({ input: 1 });',
        '};',
        'void registeredFindOrder;',
        'void readInstruction;',
      ].join('\n'),
    });
    const ambiguousResult = await inspect({
      '/src/agent.ts': [
        "import OpenAI from 'openai';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new OpenAI();',
        'export const supportAgent = async () => {',
        '  await client.responses.create({ input: 1 });',
        '  return client.responses.create({ ...dynamicRequest });',
        '};',
        'void registeredFindOrder;',
        'void readInstruction;',
      ].join('\n'),
    });

    expect(closedResult.diagnostics.map(({ code }) => code)).toStrictEqual([
      'OPENAI_INSTRUCTION_LOADER_NOT_WIRED',
      'OPENAI_TOOL_REGISTRATION_NOT_WIRED',
    ]);
    expect(ambiguousResult.diagnostics).toStrictEqual([]);
  });

  test('suppresses negative relationship diagnostics for an aliased Responses candidate', async () => {
    const result = await inspect({
      '/src/agent.ts': [
        "import OpenAI from 'openai';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new OpenAI();',
        'export const supportAgent = () => {',
        '  client.responses.create({ input: 1 });',
        '  const responses = client.responses;',
        '  return responses.create({',
        '    instructions: readInstruction(),',
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
        "import OpenAI from 'openai';",
        "import { findOrderTool as registeredFindOrder } from './find-order.js';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new OpenAI();',
        'const tools = [registeredFindOrder];',
        unsafeUse,
        'export const supportAgent = () =>',
        '  client.responses.create({ instructions: readInstruction(), tools });',
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
        dependencies: { openai: '^7.4.0' },
        peerDependencies: { openai: '>=7.4.0 <8.0.0' },
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
            declaredRange: '^7.4.0',
            dependencyKind: 'dependencies',
          },
        },
        {
          agentId: 'support',
          details: {
            compatibility: 'supported',
            declaredRange: '>=7.4.0 <8.0.0',
            dependencyKind: 'peerDependencies',
          },
        },
      ]),
    );
  });

  test('emits one unsupported-range diagnostic without package evidence', async () => {
    const result = await inspect({
      '/package.json': JSON.stringify({
        dependencies: { openai: '7.3.0' },
        peerDependencies: { openai: '<7.0.0' },
      }),
    });

    expect(result.diagnostics.map(({ code }) => code)).toContain('OPENAI_SDK_VERSION_UNSUPPORTED');
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
          '      id: openai',
          '    bindings:',
          '      runtimeAgent:',
          '        path: /src/agent.ts',
          '        symbol: sharedAgent',
          '  beta:',
          '    runtime:',
          '      id: openai',
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
        content: JSON.stringify({ dependencies: { openai: '^7.4.0' } }),
        path: '/package.json',
        type: 'file',
      },
      {
        content: [
          "import OpenAI from 'openai';",
          'const client = new OpenAI();',
          'export const sharedAgent = () => client.responses.create({ input: 1 });',
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
    const result = await createCore({ adapters: [openAiAdapter] }).inspectProject({ repository });
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
      ?.text.replace('  strict: true,\n', '');

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
      createCore({ adapters: [openAiAdapter] }).inspectProject({
        repository: createMemoryRepositoryReader(createEntries()),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
