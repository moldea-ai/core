// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { createCore } from '@moldea.ai/core';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { vercelAiSdkAdapter } from '../adapter/index.js';
import { VERCEL_AI_SDK_ADAPTER_DIAGNOSTICS } from '../diagnostics/index.js';

interface IVercelAiSdkFixture {
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
    new URL('../../../../fixtures/adapter-vercel-ai-sdk/cases.json', import.meta.url),
    'utf8',
  ),
) as IVercelAiSdkFixture;
const expectedEvidence = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-vercel-ai-sdk/evidence.expected.json', import.meta.url),
    'utf8',
  ),
) as readonly unknown[];
const expectedDiagnostics = JSON.parse(
  readFileSync(
    new URL(
      '../../../../fixtures/adapter-vercel-ai-sdk/diagnostics.expected.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as readonly { readonly code: string; readonly message: string }[];

const createEntries = (
  replacements: Readonly<Record<string, IFixtureReplacement>> = {},
): readonly IMemoryRepositoryEntry[] => {
  const fixturePaths = new Set(fixture.entries.map(({ path }) => path));

  return [
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
    ...Object.entries(replacements)
      .filter(([path]) => path !== '/moldea/moldea.yaml' && !fixturePaths.has(path))
      .map(([path, content]): IMemoryRepositoryEntry => ({ content, path, type: 'file' })),
  ];
};

const inspect = async (replacements: Readonly<Record<string, IFixtureReplacement>> = {}) =>
  createCore({ adapters: [vercelAiSdkAdapter] }).inspectProject({
    repository: createMemoryRepositoryReader(createEntries(replacements)),
  });

const getFixtureText = (path: string): string => {
  const text = fixture.entries.find((entry) => entry.path === path)?.text;

  if (text === undefined) {
    throw new TypeError(`The ${path} fixture is required.`);
  }

  return text;
};

describe('vercelAiSdkAdapter Core integration', () => {
  test('keeps the diagnostic catalog synchronized with its conformance golden', () => {
    expect(
      Object.entries(VERCEL_AI_SDK_ADAPTER_DIAGNOSTICS)
        .map(([code, message]) => ({ code, message }))
        .sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0)),
    ).toStrictEqual(expectedDiagnostics);
  });

  test('emits the complete normalized evidence for both supported targets', async () => {
    const result = await inspect();

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.valid).toBe(true);
    expect(result.evidence).toEqual(expectedEvidence);
    expect(result.project).not.toBeNull();
  });

  test('produces deterministic evidence for reversed entries and concurrent inspections', async () => {
    const reversed = await createCore({ adapters: [vercelAiSdkAdapter] }).inspectProject({
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
    ['VERCEL_AI_SDK_PACKAGE_MANIFEST_INVALID', '/package.json', '{'],
    ['VERCEL_AI_SDK_VERSION_UNSUPPORTED', '/package.json', '{"dependencies":{"ai":"^6.0.0"}}'],
    ['VERCEL_AI_SDK_SOURCE_TEXT_INVALID', '/src/agents.ts', Uint8Array.from([0xff])],
    ['VERCEL_AI_SDK_SOURCE_SYNTAX_INVALID', '/src/agents.ts', 'export const agent = (;'],
    [
      'VERCEL_AI_SDK_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
      '/src/agents.ts',
      "import { ToolLoopAgent } from 'ai';\nexport const anotherAgent = new ToolLoopAgent({});\n",
    ],
    [
      'VERCEL_AI_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
      '/src/instructions.ts',
      "export const anotherLoader = () => 'instruction';\n",
    ],
    [
      'VERCEL_AI_SDK_AGENT_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/src/contracts.ts',
      getFixtureText('/src/contracts.ts').replace('SupportInputSchema', 'AnotherInputSchema'),
    ],
    [
      'VERCEL_AI_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/src/contracts.ts',
      getFixtureText('/src/contracts.ts').replace('SupportOutputSchema', 'AnotherOutputSchema'),
    ],
    [
      'VERCEL_AI_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND',
      '/src/implementations.ts',
      'export const anotherImplementation = () => undefined;\n',
    ],
    [
      'VERCEL_AI_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
      '/src/tools.ts',
      "import { tool } from 'ai';\nexport const anotherTool = tool({ inputSchema: {} });\n",
    ],
    [
      'VERCEL_AI_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/src/contracts.ts',
      getFixtureText('/src/contracts.ts').replace('FindOrderInputSchema', 'AnotherInputSchema'),
    ],
    [
      'VERCEL_AI_SDK_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/src/contracts.ts',
      getFixtureText('/src/contracts.ts').replace('FindOrderOutputSchema', 'AnotherOutputSchema'),
    ],
  ] as const)('emits %s for the proved invalid state', async (expectedCode, path, replacement) => {
    const result = await inspect({ [path]: replacement });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toContain(expectedCode);
    expect(result.diagnostics.find(({ code }) => code === expectedCode)).toMatchObject({
      path,
      source: 'vercel-ai-sdk',
    });
  });

  test('emits independent wiring and name diagnostics', async () => {
    const agents = getFixtureText('/src/agents.ts');
    const tools = getFixtureText('/src/tools.ts');
    const contracts = getFixtureText('/src/contracts.ts');
    const replacements = [
      [
        'VERCEL_AI_SDK_INSTRUCTION_LOADER_NOT_WIRED',
        { '/src/agents.ts': agents.replace('loadSupportInstruction()', "'static'") },
      ],
      [
        'VERCEL_AI_SDK_AGENT_INPUT_SCHEMA_NOT_WIRED',
        {
          '/src/agents.ts': agents.replace(
            'callOptionsSchema: SupportInputSchema',
            'callOptionsSchema: {}',
          ),
        },
      ],
      [
        'VERCEL_AI_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED',
        {
          '/src/agents.ts': agents.replace(
            'schema: SupportOutputSchema',
            'schema: SummaryOutputSchema',
          ),
        },
      ],
      [
        'VERCEL_AI_SDK_TOOL_IMPLEMENTATION_NOT_WIRED',
        { '/src/tools.ts': tools.replace('execute: findOrder', 'execute: async () => undefined') },
      ],
      [
        'VERCEL_AI_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED',
        {
          '/src/contracts.ts': `${contracts}export const OtherInputSchema = {};\n`,
          '/src/tools.ts': tools
            .replace('inputSchema: FindOrderInputSchema', 'inputSchema: OtherInputSchema')
            .replace(
              'import { FindOrderInputSchema, FindOrderOutputSchema }',
              'import { FindOrderInputSchema, FindOrderOutputSchema, OtherInputSchema }',
            ),
        },
      ],
      [
        'VERCEL_AI_SDK_TOOL_OUTPUT_SCHEMA_NOT_WIRED',
        {
          '/src/contracts.ts': `${contracts}export const OtherOutputSchema = {};\n`,
          '/src/tools.ts': tools
            .replace('outputSchema: FindOrderOutputSchema', 'outputSchema: OtherOutputSchema')
            .replace(
              'import { FindOrderInputSchema, FindOrderOutputSchema }',
              'import { FindOrderInputSchema, FindOrderOutputSchema, OtherOutputSchema }',
            ),
        },
      ],
      [
        'VERCEL_AI_SDK_TOOL_NAME_MISMATCH',
        {
          '/src/agents.ts': agents.replaceAll(
            'find_order: findOrderTool',
            'lookup_order: findOrderTool',
          ),
        },
      ],
      [
        'VERCEL_AI_SDK_TOOL_REGISTRATION_NOT_WIRED',
        { '/src/agents.ts': agents.replaceAll('{ find_order: findOrderTool }', '{}') },
      ],
    ] as const;

    for (const [expectedCode, replacement] of replacements) {
      const result = await inspect(replacement);
      expect(result.diagnostics.map(({ code }) => code)).toContain(expectedCode);
    }
  });

  test('suppresses relationship negatives when preparation can replace them', async () => {
    const agents = getFixtureText('/src/agents.ts');
    const result = await inspect({
      '/src/agents.ts': agents.replace(
        "id: 'support-runtime',",
        "id: 'support-runtime', prepareCall() { return {}; },",
      ),
    });
    const supportDiagnostics = result.diagnostics.filter(
      ({ entity }) => entity?.agentId === 'support',
    );

    expect(supportDiagnostics).toStrictEqual([]);
    expect(
      result.evidence.filter(
        ({ agentId, kind }) => agentId === 'support' && kind === 'agent-definition',
      ),
    ).toHaveLength(1);
    expect(
      result.evidence.filter(
        ({ agentId, kind }) =>
          agentId === 'support' && ['instruction-loader', 'tool-registration'].includes(kind),
      ),
    ).toStrictEqual([]);
  });

  test('does not diagnose an omitted optional tool implementation relationship', async () => {
    const tools = getFixtureText('/src/tools.ts');
    const result = await inspect({
      '/src/tools.ts': tools.replace('  execute: findOrder,\n', ''),
    });

    expect(result.diagnostics.map(({ code }) => code)).not.toContain(
      'VERCEL_AI_SDK_TOOL_IMPLEMENTATION_NOT_WIRED',
    );
  });

  test('resolves safe local relationships shared across manifest agents', async () => {
    const agents = getFixtureText('/src/agents.ts')
      .replace(
        "import { generateText, Output, streamText, ToolLoopAgent } from 'ai';",
        "import { generateText, Output, streamText, tool, ToolLoopAgent } from 'ai';",
      )
      .replace(
        'FindOrderInputSchema, SupportInputSchema',
        'FindOrderInputSchema, FindOrderOutputSchema, SupportInputSchema',
      )
      .replace(
        "import { findOrderTool } from './tools.js';",
        "import { findOrder } from './implementations.js';",
      )
      .replaceAll('{ find_order: findOrderTool }', 'sharedTools')
      .replace('Output.object({ schema: SupportOutputSchema })', 'supportOutput')
      .replace(
        'export const supportAgent',
        [
          'export const findOrderTool = tool({',
          '  inputSchema: FindOrderInputSchema,',
          '  outputSchema: FindOrderOutputSchema,',
          '  execute: findOrder,',
          '});',
          'const supportOutput = Output.object({ schema: SupportOutputSchema });',
          'const sharedTools = { find_order: findOrderTool };',
          'export const supportAgent',
        ].join('\n'),
      );
    const result = await inspect({
      '/moldea/moldea.yaml': fixture.manifest.replaceAll(
        'path: /src/tools.ts',
        'path: /src/agents.ts',
      ),
      '/src/agents.ts': agents,
    });
    const registrations = result.evidence.filter(
      ({ capabilityId, kind }) => capabilityId === 'find-order' && kind === 'tool-registration',
    );

    expect(result.diagnostics).toStrictEqual([]);
    expect(registrations).toHaveLength(2);
    expect(
      registrations.every(({ references }) =>
        references.some(
          ({ path, symbol }) => path === '/src/agents.ts' && symbol === 'sharedTools',
        ),
      ),
    ).toBe(true);
    expect(
      result.evidence.some(
        ({ agentId, kind, references }) =>
          agentId === 'support' &&
          kind === 'schema' &&
          references.some(
            ({ path, symbol }) => path === '/src/agents.ts' && symbol === 'supportOutput',
          ),
      ),
    ).toBe(true);
  });

  test('leaves indirectly mutated function tools and tools maps unresolved', async () => {
    const agents = getFixtureText('/src/agents.ts');
    const tools = getFixtureText('/src/tools.ts');
    const mutatedToolResult = await inspect({
      '/src/tools.ts': [
        tools,
        'const escapedTool = { value: findOrderTool };',
        'escapedTool.value.execute = async () => undefined;',
        '',
      ].join('\n'),
    });
    const sharedToolsAgents = agents
      .replaceAll('{ find_order: findOrderTool }', 'sharedTools')
      .replace(
        'export const supportAgent',
        [
          'const sharedTools = { find_order: findOrderTool };',
          'const escapedTools = { tools: sharedTools };',
          'escapedTools.tools.find_order = {};',
          'export const supportAgent',
        ].join('\n'),
      );
    const mutatedMapResult = await inspect({ '/src/agents.ts': sharedToolsAgents });

    expect(
      mutatedToolResult.evidence.filter(({ capabilityId }) => capabilityId === 'find-order'),
    ).toStrictEqual([]);
    expect(
      mutatedMapResult.evidence.filter(({ kind }) => kind === 'tool-registration'),
    ).toStrictEqual([]);
    expect(
      [...mutatedToolResult.diagnostics, ...mutatedMapResult.diagnostics]
        .map(({ code }) => code)
        .filter((code) =>
          [
            'VERCEL_AI_SDK_TOOL_NAME_MISMATCH',
            'VERCEL_AI_SDK_TOOL_REGISTRATION_NOT_WIRED',
          ].includes(code),
        ),
    ).toStrictEqual([]);
  });

  test('resolves relative imported output specifications and tools maps', async () => {
    const agents = getFixtureText('/src/agents.ts');
    const result = await inspect({
      '/src/agents.ts': agents
        .replace(
          "import { findOrderTool } from './tools.js';",
          "import { supportOutput, supportTools } from './runtime-configuration.js';\nimport { findOrderTool } from './tools.js';",
        )
        .replace(
          'output: Output.object({ schema: SupportOutputSchema }), tools: { find_order: findOrderTool }',
          'output: supportOutput, tools: supportTools',
        ),
      '/src/runtime-configuration.ts': [
        "import { Output } from 'ai';",
        "import { SupportOutputSchema } from './contracts.js';",
        "import { findOrderTool } from './tools.js';",
        'export const supportOutput = Output.object({ schema: SupportOutputSchema });',
        'export const supportTools = { find_order: findOrderTool };',
        '',
      ].join('\n'),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind, references }) =>
          agentId === 'support' &&
          kind === 'schema' &&
          references.some(({ path }) => path === '/src/runtime-configuration.ts'),
      ),
    ).toBe(true);
    expect(
      result.evidence.some(
        ({ agentId, kind, references }) =>
          agentId === 'support' &&
          kind === 'tool-registration' &&
          references.some(({ path }) => path === '/src/runtime-configuration.ts'),
      ),
    ).toBe(true);
  });

  test('suppresses map negatives for an unrecognized dynamic tool factory', async () => {
    const agents = getFixtureText('/src/agents.ts');
    const result = await inspect({
      '/src/agents.ts': agents.replaceAll(
        '{ find_order: findOrderTool }',
        '{ dynamic_tool: createTool() }',
      ),
    });
    const toolDiagnostics = result.diagnostics.map(({ code }) => code);

    expect(toolDiagnostics).not.toContain('VERCEL_AI_SDK_TOOL_NAME_MISMATCH');
    expect(toolDiagnostics).not.toContain('VERCEL_AI_SDK_TOOL_REGISTRATION_NOT_WIRED');
  });

  test('returns no runtime diagnostics when dedicated-repository bindings are absent', async () => {
    const repository = createMemoryRepositoryReader([
      {
        content: 'version: 1\nagents:\n  external:\n    runtime:\n      id: vercel-ai-sdk\n',
        path: '/moldea/moldea.yaml',
        type: 'file',
      },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      {
        content: 'External runtime agent.\n',
        path: '/moldea/agents/external/description.md',
        type: 'file',
      },
      {
        content: 'You are the `external` agent.\n',
        path: '/moldea/agents/external/instruction.md',
        type: 'file',
      },
    ]);
    const result = await createCore({ adapters: [vercelAiSdkAdapter] }).inspectProject({
      repository,
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence).toStrictEqual([]);
  });

  test('propagates cancellation without returning partial success', async () => {
    const controller = new AbortController();
    controller.abort(new Error('test cancellation'));

    await expect(
      createCore({ adapters: [vercelAiSdkAdapter] }).inspectProject({
        repository: createMemoryRepositoryReader(createEntries()),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
