// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { createCore } from '@moldea.ai/core';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { openAiAgentsSdkAdapter } from '../adapter/index.js';
import { OPENAI_AGENTS_SDK_ADAPTER_DIAGNOSTICS } from '../diagnostics/index.js';

interface IOpenAiAgentsSdkFixture {
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
    new URL('../../../../fixtures/adapter-openai-agents-sdk/cases.json', import.meta.url),
    'utf8',
  ),
) as IOpenAiAgentsSdkFixture;
const expectedEvidence = JSON.parse(
  readFileSync(
    new URL(
      '../../../../fixtures/adapter-openai-agents-sdk/evidence.expected.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as readonly unknown[];
const expectedDiagnostics = JSON.parse(
  readFileSync(
    new URL(
      '../../../../fixtures/adapter-openai-agents-sdk/diagnostics.expected.json',
      import.meta.url,
    ),
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
  createCore({ adapters: [openAiAgentsSdkAdapter] }).inspectProject({
    repository: createMemoryRepositoryReader(createEntries(replacements)),
  });

const getFixtureText = (path: string): string => {
  const text = fixture.entries.find((entry) => entry.path === path)?.text;

  if (text === undefined) {
    throw new TypeError(`The ${path} fixture is required.`);
  }

  return text;
};

describe('openAiAgentsSdkAdapter Core integration', () => {
  test('keeps the diagnostic catalog synchronized with its conformance golden', () => {
    expect(
      Object.entries(OPENAI_AGENTS_SDK_ADAPTER_DIAGNOSTICS)
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

  test('produces deterministic evidence for reversed entries and concurrent inspections', async () => {
    const reversed = await createCore({ adapters: [openAiAgentsSdkAdapter] }).inspectProject({
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
    ['OPENAI_AGENTS_SDK_PACKAGE_MANIFEST_INVALID', '/package.json', '{'],
    [
      'OPENAI_AGENTS_SDK_VERSION_UNSUPPORTED',
      '/package.json',
      '{"dependencies":{"@openai/agents":"0.16.0"}}',
    ],
    ['OPENAI_AGENTS_SDK_SOURCE_TEXT_INVALID', '/src/agents.ts', Uint8Array.from([0xff])],
    ['OPENAI_AGENTS_SDK_SOURCE_SYNTAX_INVALID', '/src/agents.ts', 'export const agent = (;'],
    [
      'OPENAI_AGENTS_SDK_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
      '/src/agents.ts',
      "import { Agent } from '@openai/agents';\nexport const anotherAgent = new Agent({ name: 'other' });\n",
    ],
    [
      'OPENAI_AGENTS_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
      '/src/instructions.ts',
      "export const anotherLoader = () => 'instruction';\n",
    ],
    [
      'OPENAI_AGENTS_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/src/contracts.ts',
      'export const AnotherSchema = {};\n',
    ],
    [
      'OPENAI_AGENTS_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND',
      '/src/find-order.ts',
      'export const anotherImplementation = () => undefined;\n',
    ],
    [
      'OPENAI_AGENTS_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
      '/src/tools.ts',
      'export const anotherTool = {};\n',
    ],
    [
      'OPENAI_AGENTS_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/src/contracts.ts',
      getFixtureText('/src/contracts.ts').replace('FindOrderInputSchema', 'AnotherInputSchema'),
    ],
    [
      'OPENAI_AGENTS_SDK_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/src/contracts.ts',
      getFixtureText('/src/contracts.ts').replace('FindOrderOutputSchema', 'AnotherOutputSchema'),
    ],
  ] as const)('emits %s for the proved invalid state', async (expectedCode, path, replacement) => {
    const result = await inspect({ [path]: replacement });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toContain(expectedCode);
    expect(result.diagnostics.find(({ code }) => code === expectedCode)).toMatchObject({
      path,
      source: 'openai-agents-sdk',
    });
  });

  test('emits independent loader, schema, implementation, name, and registration diagnostics', async () => {
    const agents = getFixtureText('/src/agents.ts');
    const tools = getFixtureText('/src/tools.ts');
    const loaderResult = await inspect({
      '/src/agents.ts': agents.replace(
        'instructions: async (context) => {\n    return await loadTriageInstruction(context);\n  },',
        "instructions: 'static',",
      ),
    });
    const agentSchemaResult = await inspect({
      '/src/agents.ts': agents.replace('outputType: TriageOutputSchema,', 'outputType: {},'),
    });
    const implementationResult = await inspect({
      '/src/tools.ts': tools.replace('execute: findOrder,', 'execute: async () => undefined,'),
    });
    const nameResult = await inspect({
      '/src/tools.ts': tools.replace("name: 'find_order'", "name: 'lookup_order'"),
    });
    const registrationResult = await inspect({
      '/src/agents.ts': agents.replace(
        'const triageTools = [findOrderTool];',
        'const triageTools = [];',
      ),
    });
    const inputSchemaResult = await inspect({
      '/src/tools.ts': tools.replace('parameters: FindOrderInputSchema,', 'parameters: {},'),
    });
    const outputSchemaResult = await inspect({
      '/src/tools.ts': tools.replace('outputSchema: FindOrderOutputSchema,', 'outputSchema: {},'),
    });

    expect(loaderResult.diagnostics.map(({ code }) => code)).toContain(
      'OPENAI_AGENTS_SDK_INSTRUCTION_LOADER_NOT_WIRED',
    );
    expect(agentSchemaResult.diagnostics.map(({ code }) => code)).toContain(
      'OPENAI_AGENTS_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED',
    );
    expect(implementationResult.diagnostics.map(({ code }) => code)).toContain(
      'OPENAI_AGENTS_SDK_TOOL_IMPLEMENTATION_NOT_WIRED',
    );
    expect(nameResult.diagnostics.map(({ code }) => code)).toContain(
      'OPENAI_AGENTS_SDK_TOOL_NAME_MISMATCH',
    );
    expect(registrationResult.diagnostics.map(({ code }) => code)).toContain(
      'OPENAI_AGENTS_SDK_TOOL_REGISTRATION_NOT_WIRED',
    );
    expect(inputSchemaResult.diagnostics.map(({ code }) => code)).toContain(
      'OPENAI_AGENTS_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED',
    );
    expect(outputSchemaResult.diagnostics.map(({ code }) => code)).toContain(
      'OPENAI_AGENTS_SDK_TOOL_OUTPUT_SCHEMA_NOT_WIRED',
    );
  });

  test('validates target and registration-level routing descriptions independently', async () => {
    const agents = getFixtureText('/src/agents.ts');
    const missing = await inspect({
      '/src/agents.ts': agents.replace('  handoffDescription: billingRoutingDescription,\n', ''),
    });
    const mismatch = await inspect({
      '/src/agents.ts': agents.replace(
        '  toolDescriptionOverride: billingRoutingDescription,',
        "  toolDescriptionOverride: 'Incorrect routing.',",
      ),
    });
    const dynamic = await inspect({
      '/src/agents.ts': agents.replace(
        '  toolDescriptionOverride: billingRoutingDescription,',
        '  toolDescriptionOverride: createRoutingDescription(),',
      ),
    });
    const emptyOverride = await inspect({
      '/src/agents.ts': agents.replace(
        '  toolDescriptionOverride: billingRoutingDescription,',
        "  toolDescriptionOverride: '',",
      ),
    });

    expect(missing.diagnostics.map(({ code }) => code)).toContain(
      'OPENAI_AGENTS_SDK_HANDOFF_ROUTING_DESCRIPTION_MISSING',
    );
    expect(mismatch.diagnostics.map(({ code }) => code)).toContain(
      'OPENAI_AGENTS_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED',
    );
    expect(dynamic.diagnostics).toStrictEqual([]);
    expect(dynamic.evidence.filter(({ kind }) => kind === 'handoff-registration')).toHaveLength(2);
    expect(emptyOverride.diagnostics).toStrictEqual([]);
    expect(
      emptyOverride.evidence.find(
        ({ details, kind }) =>
          kind === 'handoff-registration' && details['registrationKind'] === 'handoff',
      ),
    ).toMatchObject({ details: { routingDescriptionSource: 'target' } });
  });

  test.each([
    ['leading ASCII whitespace', ' route_billing'],
    ['trailing Unicode whitespace', 'route_billing\\u00a0'],
    ['line break', 'route\\nbilling'],
    ['NUL', 'route\\0billing'],
  ])('omits an evidence runtime name containing %s', async (_description, toolName) => {
    const agents = getFixtureText('/src/agents.ts').replace('route_billing', toolName);
    const result = await inspect({ '/src/agents.ts': agents });
    const registration = result.evidence.find(
      ({ details, kind }) =>
        kind === 'handoff-registration' && details['registrationKind'] === 'handoff',
    );

    expect(result.diagnostics).toStrictEqual([]);
    expect(registration).toMatchObject({ runtimeName: null });
  });

  test.each([
    ['leading U+0009', "'\\tunsafe'"],
    ['trailing U+0009', "'unsafe\\t'"],
    ['leading U+000A', "'\\nunsafe'"],
    ['trailing U+000A', "'unsafe\\n'"],
    ['leading U+000B', "'\\u000bunsafe'"],
    ['trailing U+000B', "'unsafe\\u000b'"],
    ['leading U+000C', "'\\funsafe'"],
    ['trailing U+000C', "'unsafe\\f'"],
    ['leading U+000D', "'\\runsafe'"],
    ['trailing U+000D', "'unsafe\\r'"],
    ['leading U+0020', "' unsafe'"],
    ['trailing U+0020', "'unsafe '"],
    ['leading U+0085', "'\\u0085unsafe'"],
    ['trailing U+0085', "'unsafe\\u0085'"],
    ['leading U+00A0', "'\\u00a0unsafe'"],
    ['trailing U+00A0', "'unsafe\\u00a0'"],
    ['leading U+1680', "'\\u1680unsafe'"],
    ['trailing U+1680', "'unsafe\\u1680'"],
    ['leading U+2000', "'\\u2000unsafe'"],
    ['trailing U+2000', "'unsafe\\u2000'"],
    ['leading U+2001', "'\\u2001unsafe'"],
    ['trailing U+2001', "'unsafe\\u2001'"],
    ['leading U+2002', "'\\u2002unsafe'"],
    ['trailing U+2002', "'unsafe\\u2002'"],
    ['leading U+2003', "'\\u2003unsafe'"],
    ['trailing U+2003', "'unsafe\\u2003'"],
    ['leading U+2004', "'\\u2004unsafe'"],
    ['trailing U+2004', "'unsafe\\u2004'"],
    ['leading U+2005', "'\\u2005unsafe'"],
    ['trailing U+2005', "'unsafe\\u2005'"],
    ['leading U+2006', "'\\u2006unsafe'"],
    ['trailing U+2006', "'unsafe\\u2006'"],
    ['leading U+2007', "'\\u2007unsafe'"],
    ['trailing U+2007', "'unsafe\\u2007'"],
    ['leading U+2008', "'\\u2008unsafe'"],
    ['trailing U+2008', "'unsafe\\u2008'"],
    ['leading U+2009', "'\\u2009unsafe'"],
    ['trailing U+2009', "'unsafe\\u2009'"],
    ['leading U+200A', "'\\u200aunsafe'"],
    ['trailing U+200A', "'unsafe\\u200a'"],
    ['leading U+2028', "'\\u2028unsafe'"],
    ['trailing U+2028', "'unsafe\\u2028'"],
    ['leading U+2029', "'\\u2029unsafe'"],
    ['trailing U+2029', "'unsafe\\u2029'"],
    ['leading U+202F', "'\\u202funsafe'"],
    ['trailing U+202F', "'unsafe\\u202f'"],
    ['leading U+205F', "'\\u205funsafe'"],
    ['trailing U+205F', "'unsafe\\u205f'"],
    ['leading U+3000', "'\\u3000unsafe'"],
    ['trailing U+3000', "'unsafe\\u3000'"],
    ['an internal LF', "'unsafe\\nname'"],
    ['an internal CR', "'unsafe\\rname'"],
    ['an internal NEL', "'unsafe\\u0085name'"],
    ['an internal line separator', "'unsafe\\u2028name'"],
    ['an internal paragraph separator', "'unsafe\\u2029name'"],
    ['NUL', "'unsafe\\0name'"],
    ['a leading lone surrogate', "'\\ud800unsafe'"],
    ['a trailing lone surrogate', "'unsafe\\udfff'"],
  ])('uses the bound symbol when an Agent name contains %s', async (_description, agentName) => {
    const agents = getFixtureText('/src/agents.ts').replace(
      "name: 'billing'",
      `name: ${agentName}`,
    );
    const result = await inspect({ '/src/agents.ts': agents });
    const definition = result.evidence.find(
      ({ agentId, kind }) => agentId === 'billing' && kind === 'agent-definition',
    );
    const registrations = result.evidence.filter(({ kind }) => kind === 'handoff-registration');

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(definition).toMatchObject({ runtimeName: 'billingAgent' });
    expect(registrations).toHaveLength(2);
    expect(registrations.every(({ details }) => !Object.hasOwn(details, 'targetRuntimeName'))).toBe(
      true,
    );
  });

  test('preserves a machine-valid Agent name containing internal spaces', async () => {
    const agents = getFixtureText('/src/agents.ts').replace(
      "name: 'billing'",
      "name: 'billing support'",
    );
    const result = await inspect({ '/src/agents.ts': agents });
    const definition = result.evidence.find(
      ({ agentId, kind }) => agentId === 'billing' && kind === 'agent-definition',
    );
    const registrations = result.evidence.filter(({ kind }) => kind === 'handoff-registration');

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(definition).toMatchObject({ runtimeName: 'billing support' });
    expect(
      registrations.every(({ details }) => details['targetRuntimeName'] === 'billing support'),
    ).toBe(true);
  });

  test('reports ambiguous handoff target mapping without selecting a target', async () => {
    const ambiguousManifest = fixture.manifest.replace(
      'agents:\n',
      'agents:\n  billing-clone:\n    runtime:\n      id: openai-agents-sdk\n    bindings:\n      runtimeAgent:\n        path: /src/agents.ts\n        symbol: billingAgent\n',
    );
    const result = await createCore({ adapters: [openAiAgentsSdkAdapter] }).inspectProject({
      repository: createMemoryRepositoryReader([
        ...createEntries({ '/moldea/moldea.yaml': ambiguousManifest }),
        {
          content: 'Handles cloned billing requests.\n',
          path: '/moldea/agents/billing-clone/description.md',
          type: 'file',
        },
        {
          content: 'You are the `billing-clone` agent.\n',
          path: '/moldea/agents/billing-clone/instruction.md',
          type: 'file',
        },
      ]),
    });
    const diagnostics = result.diagnostics.filter(
      ({ code }) => code === 'OPENAI_AGENTS_SDK_HANDOFF_TARGET_AMBIGUOUS',
    );

    expect(
      diagnostics
        .map(({ details }) => ({ ...details }))
        .sort((left, right) =>
          String(left['registrationKind']) < String(right['registrationKind']) ? -1 : 1,
        ),
    ).toStrictEqual([
      { registrationKind: 'agent', targetRuntimeName: 'billing' },
      { registrationKind: 'handoff', targetRuntimeName: 'billing' },
    ]);
  });

  test('returns no runtime diagnostics when dedicated-repository bindings are absent', async () => {
    const repository = createMemoryRepositoryReader([
      {
        content: 'version: 1\nagents:\n  external:\n    runtime:\n      id: openai-agents-sdk\n',
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
    const result = await createCore({ adapters: [openAiAgentsSdkAdapter] }).inspectProject({
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
      createCore({ adapters: [openAiAgentsSdkAdapter] }).inspectProject({
        repository: createMemoryRepositoryReader(createEntries()),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
