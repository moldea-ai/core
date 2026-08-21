// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { createCore } from '@moldea.ai/core';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { langGraphAdapter } from '../adapter/index.js';
import { LANGGRAPH_ADAPTER_DIAGNOSTICS } from '../diagnostics/index.js';

interface ILangGraphFixture {
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
    new URL('../../../../fixtures/adapter-langgraph/cases.json', import.meta.url),
    'utf8',
  ),
) as ILangGraphFixture;
const expectedEvidence = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-langgraph/evidence.expected.json', import.meta.url),
    'utf8',
  ),
) as readonly unknown[];
const expectedDiagnostics = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-langgraph/diagnostics.expected.json', import.meta.url),
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
  createCore({ adapters: [langGraphAdapter] }).inspectProject({
    repository: createMemoryRepositoryReader(createEntries(replacements)),
  });

const getFixtureText = (path: string): string => {
  const text = fixture.entries.find((entry) => entry.path === path)?.text;

  if (text === undefined) {
    throw new TypeError(`The ${path} fixture is required.`);
  }

  return text;
};

describe('langGraphAdapter Core integration', () => {
  test('keeps the complete stable diagnostic catalog synchronized', () => {
    expect(
      Object.entries(LANGGRAPH_ADAPTER_DIAGNOSTICS)
        .map(([code, message]) => ({ code, message }))
        .sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0)),
    ).toStrictEqual(expectedDiagnostics);
  });

  test('emits complete normalized evidence for both verified targets', async () => {
    const result = await inspect();

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.valid).toBe(true);
    expect(result.evidence).toEqual(expectedEvidence);
  });

  test('is deterministic for reversed entries and concurrent inspections', async () => {
    const reversed = await createCore({ adapters: [langGraphAdapter] }).inspectProject({
      repository: createMemoryRepositoryReader([...createEntries()].reverse()),
    });
    const concurrent = await Promise.all([inspect(), inspect(), inspect(), inspect()]);

    expect(reversed.evidence).toEqual(expectedEvidence);
    expect(concurrent.map(({ evidence }) => evidence)).toEqual([
      expectedEvidence,
      expectedEvidence,
      expectedEvidence,
      expectedEvidence,
    ]);
  });

  test.each([
    ['LANGGRAPH_PACKAGE_MANIFEST_INVALID', '/package.json', '{'],
    [
      'LANGGRAPH_VERSION_UNSUPPORTED',
      '/package.json',
      '{"dependencies":{"@langchain/core":"~1.2.9","@langchain/langgraph":"1.3.0"}}',
    ],
    ['LANGGRAPH_SOURCE_TEXT_INVALID', '/src/graph.ts', Uint8Array.from([0xff])],
    ['LANGGRAPH_SOURCE_SYNTAX_INVALID', '/src/graph.ts', 'export const supportGraph = (;'],
    [
      'LANGGRAPH_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
      '/src/graph.ts',
      "import { StateGraph } from '@langchain/langgraph'; export const otherGraph = new StateGraph(getSchema()).compile();",
    ],
    [
      'LANGGRAPH_AGENT_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/moldea/moldea.yaml',
      fixture.manifest.replace('symbol: GraphInputSchema', 'symbol: MissingInputSchema'),
    ],
    [
      'LANGGRAPH_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/moldea/moldea.yaml',
      fixture.manifest.replace('symbol: GraphOutputSchema', 'symbol: MissingOutputSchema'),
    ],
  ] as const)('emits %s for the proved invalid state', async (expectedCode, path, replacement) => {
    const result = await inspect({ [path]: replacement });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toContain(expectedCode);
  });

  test.each([
    [
      'compile options',
      getFixtureText('/src/graph.ts')
        .replace(
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';",
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';\nimport { compileOptions } from './compile-options.js';",
        )
        .replace("builder.compile({ name: 'support_graph' })", 'builder.compile(compileOptions)'),
      '/src/compile-options.ts',
      'export const compileOptions = { name: ;\n',
    ],
    [
      'entry-point name',
      getFixtureText('/src/graph.ts')
        .replace(
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';",
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';\nimport { entryPoint } from './entry-point.js';",
        )
        .replace(
          "builder.addNode('prepare', prepare);",
          "builder.addNode('prepare', prepare);\nbuilder.setEntryPoint(entryPoint);",
        ),
      '/src/entry-point.ts',
      'export const entryPoint = ;\n',
    ],
    [
      'node collection',
      getFixtureText('/src/graph.ts')
        .replace(
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';",
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';\nimport { nodeEntries } from './node-entries.js';",
        )
        .replace("builder.addNode('prepare', prepare);", 'builder.addNode(nodeEntries);'),
      '/src/node-entries.ts',
      'export const nodeEntries = [;\n',
    ],
    [
      'addSequence node collection',
      getFixtureText('/src/graph.ts')
        .replace(
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';",
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';\nimport { nodeEntries } from './node-entries.js';",
        )
        .replace("builder.addNode('prepare', prepare);", 'builder.addSequence(nodeEntries);'),
      '/src/node-entries.ts',
      'export const nodeEntries = [;\n',
    ],
  ] as const)(
    'reports a syntax failure reached through imported %s',
    async (_description, graphSource, importedPath, importedSource) => {
      const result = await inspect({
        '/src/graph.ts': graphSource,
        [importedPath]: importedSource,
      });

      expect(result.valid).toBe(false);
      expect(result.diagnostics.map(({ code }) => code)).toContain(
        'LANGGRAPH_SOURCE_SYNTAX_INVALID',
      );
      expect(
        result.evidence.some(
          ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
        ),
      ).toBe(false);
    },
  );

  test.each([
    [
      'compile-options object family',
      getFixtureText('/src/graph.ts')
        .replace(
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';",
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';\nimport { compileOptions } from './conditional-compile-options.js';",
        )
        .replace(
          "builder.compile({ name: 'support_graph' })",
          'builder.compile(useOptions ? {} : compileOptions)',
        ),
      '/src/conditional-compile-options.ts',
      'export const compileOptions = { name: ;\n',
    ],
    [
      'opaque constructor value',
      getFixtureText('/src/graph.ts')
        .replace(
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';",
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';\nimport { graphSchema } from './conditional-graph-schema.js';",
        )
        .replace(
          'const builder = new StateGraph({ state: GraphStateSchema, input: GraphInputSchema, output: GraphOutputSchema });',
          'const builder = new StateGraph(useSchema ? getSchema() : graphSchema);',
        ),
      '/src/conditional-graph-schema.ts',
      'export const graphSchema = ;\n',
    ],
    [
      'conditional path map',
      getFixtureText('/src/graph.ts')
        .replace(
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';",
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';\nimport { pathMap } from './conditional-path-map.js';",
        )
        .replace(
          "builder.addConditionalEdges('respond', route, { done: END });",
          "builder.addConditionalEdges('respond', route, useMap ? { done: END } : pathMap);",
        ),
      '/src/conditional-path-map.ts',
      'export const pathMap = { done: ;\n',
    ],
  ] as const)(
    'reports an imported syntax failure from the unselected %s branch',
    async (_description, graphSource, importedPath, importedSource) => {
      const result = await inspect({
        '/src/graph.ts': graphSource,
        [importedPath]: importedSource,
      });

      expect(result.valid).toBe(false);
      expect(result.diagnostics.map(({ code }) => code)).toContain(
        'LANGGRAPH_SOURCE_SYNTAX_INVALID',
      );
    },
  );

  test.each([
    [
      'LANGGRAPH_AGENT_INPUT_SCHEMA_NOT_WIRED',
      'input: GraphInputSchema',
      'input: GraphOutputSchema',
    ],
    [
      'LANGGRAPH_AGENT_OUTPUT_SCHEMA_NOT_WIRED',
      'output: GraphOutputSchema',
      'output: GraphInputSchema',
    ],
  ] as const)(
    'emits %s only for one closed mismatched schema role',
    async (expectedCode, source, replacement) => {
      const result = await inspect({
        '/src/graph.ts': getFixtureText('/src/graph.ts').replace(source, replacement),
      });

      expect(result.diagnostics.map(({ code }) => code)).toContain(expectedCode);
      expect(result.evidence.some(({ kind }) => kind === 'agent-definition')).toBe(true);
    },
  );

  test('keeps a closed input mismatch visible when only the output role is ambiguous', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        '{ state: GraphStateSchema, input: GraphInputSchema, output: GraphOutputSchema }',
        '{ state: GraphStateSchema, input: GraphOutputSchema, output: GraphOutputSchema, output: GraphInputSchema }',
      ),
    });
    const diagnosticCodes = result.diagnostics.map(({ code }) => code);

    expect(diagnosticCodes).toContain('LANGGRAPH_AGENT_INPUT_SCHEMA_NOT_WIRED');
    expect(diagnosticCodes).not.toContain('LANGGRAPH_AGENT_OUTPUT_SCHEMA_NOT_WIRED');
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(true);
  });

  test('preserves the graph definition but suppresses schema conclusions for an opaque constructor', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        'const builder = new StateGraph({ state: GraphStateSchema, input: GraphInputSchema, output: GraphOutputSchema });',
        'const builder = new StateGraph(getGraphSchema());',
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(true);
    expect(
      result.evidence.some(({ agentId, kind }) => agentId === 'graph' && kind === 'schema'),
    ).toBe(false);
  });

  test('does not select a target for a dynamic or higher-level runtime boundary', async () => {
    const result = await inspect({
      '/src/graph.ts': "export const supportGraph = createAgent({ model: 'provider:model' });\n",
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(false);
  });

  test('omits functional patterns inside nested callbacks', async () => {
    const result = await inspect({
      '/src/functional.ts': getFixtureText('/src/functional.ts').replace(
        'interrupt({ prepared });',
        'items.map(() => interrupt({ prepared }));',
      ),
    });

    expect(
      result.evidence.some(
        ({ agentId, details }) =>
          agentId === 'functional' && details['patternId'] === 'functional-interrupt',
      ),
    ).toBe(false);
  });

  test('recognizes an inline fluent StateGraph builder', async () => {
    const result = await inspect({
      '/moldea/moldea.yaml': fixture.manifest
        .replace('symbol: GraphInputSchema', 'symbol: GraphStateSchema')
        .replace('symbol: GraphOutputSchema', 'symbol: GraphStateSchema'),
      '/src/graph.ts': [
        "import { START, StateGraph } from '@langchain/langgraph';",
        "import { GraphStateSchema } from './contracts.js';",
        'const prepare = async (state: unknown) => state;',
        'export const supportGraph = new StateGraph({ state: GraphStateSchema })',
        "  .addNode('prepare', prepare)",
        "  .addEdge(START, 'prepare')",
        "  .compile({ name: 'inline_graph' });",
        '',
      ].join('\n'),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, details, kind }) =>
          agentId === 'graph' &&
          kind === 'agent-definition' &&
          details['builderForm'] === 'inline-fluent',
      ),
    ).toBe(true);
  });

  test.each([
    [
      'initializer',
      getFixtureText('/src/graph.ts').replace(
        [
          'const builder = new StateGraph({ state: GraphStateSchema, input: GraphInputSchema, output: GraphOutputSchema });',
          "builder.addNode('prepare', prepare);",
          "builder.addNode('respond', respond, { timeout: 1000 });",
        ].join('\n'),
        [
          'const builder = new StateGraph({ state: GraphStateSchema, input: GraphInputSchema, output: GraphOutputSchema })',
          "  .addNode('prepare', prepare)",
          "  .addNode('respond', respond, { timeout: 1000 });",
        ].join('\n'),
      ),
    ],
    [
      'top-level operation',
      getFixtureText('/src/graph.ts').replace(
        "builder.addNode('prepare', prepare);\nbuilder.addNode('respond', respond, { timeout: 1000 });",
        "builder.addNode('prepare', prepare).addNode('respond', respond, { timeout: 1000 });",
      ),
    ],
    [
      'compile receiver',
      getFixtureText('/src/graph.ts').replace(
        "builder.compile({ name: 'support_graph' })",
        "builder.addEdge('respond', END).compile({ name: 'support_graph' })",
      ),
    ],
  ] as const)('recognizes a module-local fluent %s chain', async (_description, graphSource) => {
    const result = await inspect({ '/src/graph.ts': graphSource });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, details, kind }) =>
          agentId === 'graph' &&
          kind === 'agent-definition' &&
          details['builderForm'] === 'module-local',
      ),
    ).toBe(true);
    expect(
      result.evidence.some(
        ({ agentId, details }) =>
          agentId === 'graph' && details['patternId'] === 'state-graph-node',
      ),
    ).toBe(true);
  });

  test('uses one closed state schema as the input and output fallback', async () => {
    const result = await inspect({
      '/moldea/moldea.yaml': fixture.manifest
        .replace('symbol: GraphInputSchema', 'symbol: GraphStateSchema')
        .replace('symbol: GraphOutputSchema', 'symbol: GraphStateSchema'),
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        '{ state: GraphStateSchema, input: GraphInputSchema, output: GraphOutputSchema }',
        '{ state: GraphStateSchema }',
      ),
    });
    const graphSchemas = result.evidence.filter(
      ({ agentId, kind }) => agentId === 'graph' && kind === 'schema',
    );

    expect(result.diagnostics).toStrictEqual([]);
    expect(graphSchemas).toHaveLength(2);
    expect(graphSchemas.every(({ details }) => details['schemaSource'] === 'state-fallback')).toBe(
      true,
    );
  });

  test('recognizes one closed bound waiting-edge source', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        "builder.addEdge('prepare', 'respond');",
        "const WAITING = ['prepare'];\nbuilder.addEdge(WAITING, 'respond');",
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, details }) => agentId === 'graph' && details['edgeKind'] === 'waiting',
      ),
    ).toBe(true);
  });

  test('rejects a non-generic graph operation with explicit type arguments', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        "builder.addEdge('prepare', 'respond');",
        "builder.addEdge<unknown>('prepare', 'respond');",
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(false);
  });

  test('preserves graph identity without node evidence for an inline opaque runnable', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        "builder.addNode('prepare', prepare);",
        "builder.addNode('dynamic', createRunnable());",
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(true);
    expect(
      result.evidence.some(
        ({ agentId, runtimeName }) => agentId === 'graph' && runtimeName === 'dynamic',
      ),
    ).toBe(false);
  });

  test('rejects a statically incompatible modern context value', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        'output: GraphOutputSchema',
        'output: GraphOutputSchema, context: 42',
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(false);
  });

  test('rejects an entrypoint with an ineligible explicit type-argument count', async () => {
    const result = await inspect({
      '/src/functional.ts': getFixtureText('/src/functional.ts').replace(
        'entrypoint({ name:',
        'entrypoint<unknown>({ name:',
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'functional' && kind === 'agent-definition',
      ),
    ).toBe(false);
  });

  test('keeps an unsafe workflow identity out of evidence without rejecting the entrypoint', async () => {
    const result = await inspect({
      '/src/functional.ts': getFixtureText('/src/functional.ts').replace(
        "name: 'support_workflow'",
        "name: 'https://private.example/workflow'",
      ),
    });
    const definition = result.evidence.find(
      ({ agentId, kind }) => agentId === 'functional' && kind === 'agent-definition',
    );

    expect(result.diagnostics).toStrictEqual([]);
    expect(definition?.runtimeName).toBeNull();
  });

  test('emits path evidence but no symbol evidence when runtimeAgent omits its symbol', async () => {
    const result = await inspect({
      '/moldea/moldea.yaml': fixture.manifest.replace('        symbol: supportWorkflow\n', ''),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'functional' && kind === 'runtime-package',
      ),
    ).toBe(true);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'functional' && kind === 'agent-definition',
      ),
    ).toBe(false);
  });

  test('preserves a conditional schema role when at least one branch is viable', async () => {
    const result = await inspect({
      '/moldea/moldea.yaml': fixture.manifest
        .replace('symbol: GraphInputSchema', 'symbol: GraphStateSchema')
        .replace('symbol: GraphOutputSchema', 'symbol: GraphStateSchema'),
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        '{ state: GraphStateSchema, input: GraphInputSchema, output: GraphOutputSchema }',
        '{ state: useSchema ? GraphStateSchema : 42 }',
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(true);
    expect(
      result.evidence.some(({ agentId, kind }) => agentId === 'graph' && kind === 'schema'),
    ).toBe(false);
  });

  test('rejects a conditional schema role when every branch is incompatible', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        '{ state: GraphStateSchema, input: GraphInputSchema, output: GraphOutputSchema }',
        '{ state: useSchema ? 42 : false }',
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(false);
  });

  test('treats a nullish shorthand schema role as absent for state fallback', async () => {
    const result = await inspect({
      '/moldea/moldea.yaml': fixture.manifest.replace(
        'symbol: GraphInputSchema',
        'symbol: GraphStateSchema',
      ),
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        'const builder = new StateGraph({ state: GraphStateSchema, input: GraphInputSchema, output: GraphOutputSchema });',
        'const input = null;\nconst builder = new StateGraph({ state: GraphStateSchema, input, output: GraphOutputSchema });',
      ),
    });
    const inputSchema = result.evidence.find(
      ({ agentId, details, kind }) =>
        agentId === 'graph' && details['schemaRole'] === 'agent-input' && kind === 'schema',
    );

    expect(result.diagnostics).toStrictEqual([]);
    expect(inputSchema?.details['schemaSource']).toBe('state-fallback');
  });

  test('does not accept an imported explicit optional-argument omission', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts')
        .replace(
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';",
          "import { GraphInputSchema, GraphOutputSchema, GraphStateSchema } from './contracts.js';\nimport { omission } from './omission.js';",
        )
        .replace("builder.compile({ name: 'support_graph' })", 'builder.compile(omission)'),
      '/src/omission.ts': 'export const omission = undefined;\n',
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(false);
  });

  test('preserves a conditional node action without emitting unresolved node evidence', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        "builder.addNode('prepare', prepare);",
        "builder.addNode('conditional', usePrepare ? prepare : 42);",
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(true);
    expect(
      result.evidence.some(
        ({ agentId, runtimeName }) => agentId === 'graph' && runtimeName === 'conditional',
      ),
    ).toBe(false);
  });

  test('preserves conditional path-map viability when one branch is supported', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        "builder.addConditionalEdges('respond', route, { done: END });",
        "builder.addConditionalEdges('respond', route, useMap ? { done: END } : 42);",
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, details }) =>
          agentId === 'graph' && details['patternId'] === 'state-graph-conditional-edge',
      ),
    ).toBe(true);
  });

  test('rejects a conditional node name when every branch is reserved', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        "builder.addNode('prepare', prepare);",
        'builder.addNode(useStart ? START : END, prepare);',
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(false);
  });

  test('preserves an interpolated node name without emitting unresolved node evidence', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        "builder.addNode('prepare', prepare);",
        'builder.addNode(`prepare-${variant}`, prepare);',
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(true);
    expect(
      result.evidence.some(
        ({ agentId, details, runtimeName }) =>
          agentId === 'graph' &&
          details['patternId'] === 'state-graph-node' &&
          runtimeName === null,
      ),
    ).toBe(false);
  });

  test('preserves a waiting edge with an opaque endpoint without positive edge evidence', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        "builder.addEdge('prepare', 'respond');",
        "builder.addEdge(['prepare', getNodeName()], 'respond');",
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(true);
    expect(
      result.evidence.some(
        ({ agentId, details }) =>
          agentId === 'graph' &&
          details['patternId'] === 'state-graph-edge' &&
          details['edgeKind'] === 'waiting',
      ),
    ).toBe(false);
  });

  test('rejects a path-map shorthand that resolves to START', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        "builder.addConditionalEdges('respond', route, { done: END });",
        "builder.addConditionalEdges('respond', route, { START });",
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(false);
  });

  test('rejects a node action reached through a post-declaration alias', async () => {
    const result = await inspect({
      '/src/graph.ts': getFixtureText('/src/graph.ts').replace(
        "builder.addNode('prepare', prepare);",
        "const runnable = createRunnable();\nconst runnableAlias = runnable;\nbuilder.addNode('prepare', runnableAlias);",
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'graph' && kind === 'agent-definition',
      ),
    ).toBe(false);
  });

  test('rejects a task relationship when its imported binding is aliased', async () => {
    const result = await inspect({
      '/src/functional.ts': getFixtureText('/src/functional.ts').replace(
        'export const supportWorkflow = entrypoint',
        'const prepareAlias = prepare;\nexport const supportWorkflow = entrypoint',
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'functional' && kind === 'agent-definition',
      ),
    ).toBe(true);
    expect(
      result.evidence.some(
        ({ agentId, details }) =>
          agentId === 'functional' && details['patternId'] === 'functional-task',
      ),
    ).toBe(false);
  });
});
