// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { createCore } from '@moldea.ai/core';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { claudeAgentSdkAdapter } from '../adapter/index.js';
import { CLAUDE_AGENT_SDK_ADAPTER_DIAGNOSTICS } from '../diagnostics/index.js';

interface IClaudeAgentSdkFixture {
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
    new URL('../../../../fixtures/adapter-claude-agent-sdk/cases.json', import.meta.url),
    'utf8',
  ),
) as IClaudeAgentSdkFixture;
const expectedEvidence = JSON.parse(
  readFileSync(
    new URL(
      '../../../../fixtures/adapter-claude-agent-sdk/evidence.expected.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as readonly unknown[];
const expectedDiagnostics = JSON.parse(
  readFileSync(
    new URL(
      '../../../../fixtures/adapter-claude-agent-sdk/diagnostics.expected.json',
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
  createCore({ adapters: [claudeAgentSdkAdapter] }).inspectProject({
    repository: createMemoryRepositoryReader(createEntries(replacements)),
  });

const getFixtureText = (path: string): string => {
  const text = fixture.entries.find((entry) => entry.path === path)?.text;

  if (text === undefined) {
    throw new TypeError(`The ${path} fixture is required.`);
  }

  return text;
};

describe('claudeAgentSdkAdapter Core integration', () => {
  test('keeps the diagnostic catalog synchronized with its conformance golden', () => {
    expect(
      Object.entries(CLAUDE_AGENT_SDK_ADAPTER_DIAGNOSTICS)
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
    const reversed = await createCore({ adapters: [claudeAgentSdkAdapter] }).inspectProject({
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
    ['CLAUDE_AGENT_SDK_PACKAGE_MANIFEST_INVALID', '/package.json', '{'],
    [
      'CLAUDE_AGENT_SDK_VERSION_UNSUPPORTED',
      '/package.json',
      '{"dependencies":{"@anthropic-ai/claude-agent-sdk":"0.3.233"}}',
    ],
    ['CLAUDE_AGENT_SDK_SOURCE_TEXT_INVALID', '/src/runtime.ts', Uint8Array.from([0xff])],
    ['CLAUDE_AGENT_SDK_SOURCE_SYNTAX_INVALID', '/src/runtime.ts', 'export const agent = (;'],
    [
      'CLAUDE_AGENT_SDK_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
      '/src/runtime.ts',
      'export const anotherAgent = async () => undefined;\n',
    ],
    [
      'CLAUDE_AGENT_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
      '/src/instructions.ts',
      "export const anotherLoader = () => 'instruction';\n",
    ],
    [
      'CLAUDE_AGENT_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/src/contracts.ts',
      getFixtureText('/src/contracts.ts').replace('TriageOutputSchema', 'AnotherSchema'),
    ],
    [
      'CLAUDE_AGENT_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND',
      '/src/find-order.ts',
      'export const anotherImplementation = () => undefined;\n',
    ],
    [
      'CLAUDE_AGENT_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
      '/src/tools.ts',
      'export const anotherTool = {};\n',
    ],
    [
      'CLAUDE_AGENT_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/src/contracts.ts',
      getFixtureText('/src/contracts.ts').replace('FindOrderInputSchema', 'AnotherInputSchema'),
    ],
  ] as const)('emits %s for the proved invalid state', async (expectedCode, path, replacement) => {
    const result = await inspect({ [path]: replacement });

    expect(result.diagnostics.map(({ code }) => code)).toContain(expectedCode);
    expect(result.diagnostics.find(({ code }) => code === expectedCode)).toMatchObject({
      path,
      source: 'claude-agent-sdk',
    });
  });

  test('emits independent loader, schema, implementation, name, and registration diagnostics', async () => {
    const runtime = getFixtureText('/src/runtime.ts');
    const tools = getFixtureText('/src/tools.ts');
    const loaderResult = await inspect({
      '/src/runtime.ts': runtime.replace(
        'systemPrompt: await loadTriageInstruction(),',
        "systemPrompt: 'static',",
      ),
    });
    const outputResult = await inspect({
      '/src/runtime.ts': runtime.replace('schema: TriageOutputSchema', 'schema: {}'),
    });
    const implementationResult = await inspect({
      '/src/tools.ts': tools.replace('findOrder,\n);', 'async () => undefined,\n);'),
    });
    const nameResult = await inspect({
      '/src/runtime.ts': runtime.replace(
        'mcpServers: { support:',
        'mcpServers: { customer_support:',
      ),
    });
    const registrationResult = await inspect({
      '/src/runtime.ts': runtime.replace(
        'mcpServers: { support: supportServer },',
        'mcpServers: {} ,',
      ),
    });
    const inputResult = await inspect({
      '/src/tools.ts': tools.replace('FindOrderInputSchema,\n  findOrder,', '{},\n  findOrder,'),
    });

    expect(loaderResult.diagnostics.map(({ code }) => code)).toContain(
      'CLAUDE_AGENT_SDK_INSTRUCTION_LOADER_NOT_WIRED',
    );
    expect(outputResult.diagnostics.map(({ code }) => code)).toContain(
      'CLAUDE_AGENT_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED',
    );
    expect(implementationResult.diagnostics.map(({ code }) => code)).toContain(
      'CLAUDE_AGENT_SDK_TOOL_IMPLEMENTATION_NOT_WIRED',
    );
    expect(implementationResult.diagnostics.map(({ code }) => code)).not.toContain(
      'CLAUDE_AGENT_SDK_TOOL_NAME_MISMATCH',
    );
    expect(
      implementationResult.evidence.filter(({ kind }) => kind === 'tool-registration'),
    ).toHaveLength(2);
    expect(nameResult.diagnostics.map(({ code }) => code)).toContain(
      'CLAUDE_AGENT_SDK_TOOL_NAME_MISMATCH',
    );
    expect(registrationResult.diagnostics.map(({ code }) => code)).toContain(
      'CLAUDE_AGENT_SDK_TOOL_REGISTRATION_NOT_WIRED',
    );
    expect(inputResult.diagnostics.map(({ code }) => code)).toContain(
      'CLAUDE_AGENT_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED',
    );
  });

  test('classifies an exact unavailable runtime name as not wired rather than mismatched', async () => {
    const runtime = getFixtureText('/src/runtime.ts');
    const result = await inspect({
      '/src/runtime.ts': runtime.replace(
        'mcpServers: { support: supportServer },',
        "mcpServers: { support: supportServer },\n      disallowedTools: ['mcp__support__find_order'],",
      ),
    });
    const diagnosticCodes = result.diagnostics.map(({ code }) => code);

    expect(diagnosticCodes).toContain('CLAUDE_AGENT_SDK_TOOL_REGISTRATION_NOT_WIRED');
    expect(diagnosticCodes).not.toContain('CLAUDE_AGENT_SDK_TOOL_NAME_MISMATCH');
    expect(result.evidence.filter(({ kind }) => kind === 'tool-registration')).toHaveLength(0);
  });

  test.each([
    ['server tools', 'supportServer.tools = [];'],
    ['tool runtime name', "findOrderTool.name = 'changed';"],
  ])('keeps registration unresolved after a %s mutation', async (_description, mutation) => {
    const result = await inspect({
      '/src/tools.ts': `${getFixtureText('/src/tools.ts')}\n${mutation}\n`,
    });
    const diagnosticCodes = result.diagnostics.map(({ code }) => code);

    expect(result.evidence.filter(({ kind }) => kind === 'tool-registration')).toHaveLength(0);
    expect(diagnosticCodes).not.toContain('CLAUDE_AGENT_SDK_TOOL_NAME_MISMATCH');
    expect(diagnosticCodes).not.toContain('CLAUDE_AGENT_SDK_TOOL_REGISTRATION_NOT_WIRED');
  });

  test('preserves positive query-mounted tool evidence with per-agent MCP configuration', async () => {
    const agents = getFixtureText('/src/agents.ts');
    const result = await inspect({
      '/src/agents.ts': agents.replace(
        "tools: ['mcp__support__find_order'],",
        "tools: ['mcp__support__find_order'],\n  mcpServers: { support: 'support' },",
      ),
    });

    expect(
      result.evidence
        .filter(({ kind }) => kind === 'tool-registration')
        .map(({ agentId }) => agentId),
    ).toStrictEqual(['billing', 'triage']);
  });

  test('requires an available Agent tool before emitting handoff evidence', async () => {
    const runtime = getFixtureText('/src/runtime.ts');
    const unavailable = await inspect({
      '/src/runtime.ts': runtime.replace("tools: ['Agent']", 'tools: []'),
    });
    const unresolved = await inspect({
      '/src/runtime.ts': runtime.replace("tools: ['Agent']", "tools: ['Task']"),
    });

    expect(unavailable.evidence.filter(({ kind }) => kind === 'handoff-registration')).toHaveLength(
      0,
    );
    expect(unresolved.evidence.filter(({ kind }) => kind === 'handoff-registration')).toHaveLength(
      0,
    );
    expect(unavailable.diagnostics.map(({ code }) => code)).not.toContain(
      'CLAUDE_AGENT_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED',
    );
    expect(unresolved.diagnostics.map(({ code }) => code)).not.toContain(
      'CLAUDE_AGENT_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED',
    );
  });

  test('validates active routing descriptions and canonical MCP server keys', async () => {
    const agents = getFixtureText('/src/agents.ts');
    const runtime = getFixtureText('/src/runtime.ts');
    const missing = await inspect({
      '/src/agents.ts': agents.replace(
        "  description: 'Route billing questions and payment issues here.',\n",
        '',
      ),
    });
    const mismatch = await inspect({
      '/src/agents.ts': agents.replace(
        'Route billing questions and payment issues here.',
        'Incorrect routing description.',
      ),
    });
    const unsupportedKey = await inspect({
      '/src/runtime.ts': runtime.replace(
        'mcpServers: { support:',
        "mcpServers: { 'support.tools':",
      ),
    });

    expect(missing.diagnostics.map(({ code }) => code)).toContain(
      'CLAUDE_AGENT_SDK_HANDOFF_ROUTING_DESCRIPTION_MISSING',
    );
    expect(mismatch.diagnostics.map(({ code }) => code)).toContain(
      'CLAUDE_AGENT_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED',
    );
    expect(unsupportedKey.diagnostics.map(({ code }) => code)).toContain(
      'CLAUDE_AGENT_SDK_MCP_SERVER_KEY_UNSUPPORTED',
    );
  });

  test('treats repeated supported agents-map references as registrations rather than escapes', async () => {
    const manifest = fixture.manifest.replace(
      'path: /src/agents.ts\n        symbol: billingAgent',
      'path: /src/runtime.ts\n        symbol: billingAgent',
    );
    const runtime = [
      "import { query } from '@anthropic-ai/claude-agent-sdk';",
      "import { loadBillingInstruction } from './instructions.js';",
      '',
      'export const billingAgent = {',
      "  description: 'Incorrect routing description.',",
      '  prompt: loadBillingInstruction(),',
      '};',
      '',
      'export const triageAgent = async (prompt: string) => {',
      "  await query({ prompt, options: { agents: { billing: billingAgent }, tools: ['Agent'] } });",
      "  return query({ prompt, options: { agents: { billingAgain: billingAgent }, tools: ['Agent'] } });",
      '};',
      '',
    ].join('\n');
    const result = await inspect({
      '/moldea/moldea.yaml': manifest,
      '/src/runtime.ts': runtime,
    });

    expect(result.evidence.filter(({ kind }) => kind === 'handoff-registration')).toHaveLength(2);
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'CLAUDE_AGENT_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED',
    );
  });

  test('reports ambiguous active subagent mapping without choosing a target', async () => {
    const manifest = fixture.manifest.replace(
      'agents:\n',
      'agents:\n  billing-clone:\n    runtime:\n      id: claude-agent-sdk\n    bindings:\n      runtimeAgent:\n        path: /src/agents.ts\n        symbol: billingAgent\n',
    );
    const repository = createMemoryRepositoryReader([
      ...createEntries({ '/moldea/moldea.yaml': manifest }),
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
    ]);
    const result = await createCore({ adapters: [claudeAgentSdkAdapter] }).inspectProject({
      repository,
    });

    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'CLAUDE_AGENT_SDK_HANDOFF_TARGET_AMBIGUOUS',
    );
    expect(
      result.evidence.find(({ kind }) => kind === 'handoff-registration')?.details,
    ).not.toHaveProperty('targetAgentId');
  });
});
