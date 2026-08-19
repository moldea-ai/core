// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { createCore } from '@moldea.ai/core';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { cloudflareAgentsAdapter } from '../adapter/index.js';
import { CLOUDFLARE_AGENTS_ADAPTER_DIAGNOSTICS } from '../diagnostics/index.js';

interface ICloudflareAgentsFixture {
  readonly entries: readonly {
    readonly path: string;
    readonly text: string;
    readonly type: 'file';
  }[];
  readonly manifest: string;
}

interface IExpectedEvidence {
  readonly agentId: string | null;
  readonly capabilityId: string | null;
  readonly kind: string;
  readonly details: Readonly<Record<string, unknown>>;
}

type IFixtureReplacement = string | Uint8Array;

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-cloudflare-agents/cases.json', import.meta.url),
    'utf8',
  ),
) as ICloudflareAgentsFixture;
const expectedEvidence = JSON.parse(
  readFileSync(
    new URL(
      '../../../../fixtures/adapter-cloudflare-agents/evidence.expected.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as readonly IExpectedEvidence[];
const expectedDiagnostics = JSON.parse(
  readFileSync(
    new URL(
      '../../../../fixtures/adapter-cloudflare-agents/diagnostics.expected.json',
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
  createCore({ adapters: [cloudflareAgentsAdapter] }).inspectProject({
    repository: createMemoryRepositoryReader(createEntries(replacements)),
  });

/** Finds the unique fixture source containing the requested text. */
const getFixtureEntry = (text: string): ICloudflareAgentsFixture['entries'][number] => {
  const entries = fixture.entries.filter((entry) => entry.text.includes(text));

  if (entries.length !== 1 || entries[0] === undefined) {
    throw new TypeError(
      `Exactly one fixture entry containing ${JSON.stringify(text)} is required.`,
    );
  }

  return entries[0];
};

/** Replaces a required source fragment without allowing a silent fixture no-op. */
const replaceFixtureText = (text: string, search: string | RegExp, replacement: string): string => {
  const nextText = text.replace(search, replacement);

  if (nextText === text) {
    throw new TypeError(`The fixture replacement ${String(search)} did not match.`);
  }

  return nextText;
};

describe('cloudflareAgentsAdapter Core integration', () => {
  test('keeps the diagnostic catalog synchronized with its conformance golden', () => {
    expect(
      Object.entries(CLOUDFLARE_AGENTS_ADAPTER_DIAGNOSTICS)
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
    const reversed = await createCore({ adapters: [cloudflareAgentsAdapter] }).inspectProject({
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
    ['CLOUDFLARE_AGENTS_PACKAGE_MANIFEST_INVALID', '/package.json', '{'],
    [
      'CLOUDFLARE_AGENTS_RUNTIME_VERSION_UNSUPPORTED',
      '/package.json',
      JSON.stringify({
        dependencies: {
          '@cloudflare/ai-chat': '0.9.0',
          '@cloudflare/think': '0.15.0',
          agents: '0.20.0',
          ai: '6.0.0',
        },
      }),
    ],
  ])('emits %s for an invalid package boundary', async (code, path, replacement) => {
    const result = await inspect({ [path]: replacement });

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === code)).toBe(true);
  });

  test.each([
    ['CLOUDFLARE_AGENTS_SOURCE_TEXT_INVALID', Uint8Array.from([0xff])],
    ['CLOUDFLARE_AGENTS_SOURCE_SYNTAX_INVALID', 'export const agent = (;'],
  ])('emits %s for invalid runtime source', async (code, replacement) => {
    const runtimeSource = getFixtureEntry('export class SupportAgent');
    const result = await inspect({ [runtimeSource.path]: replacement });

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === code)).toBe(true);
  });

  test('emits a symbol diagnostic when a configured runtime export is absent', async () => {
    const runtimeSource = getFixtureEntry('export class SupportAgent');
    const replacement = replaceFixtureText(
      runtimeSource.text,
      'export class SupportAgent',
      'export class AnotherSupportAgent',
    );
    const result = await inspect({ [runtimeSource.path]: replacement });

    expect(
      result.diagnostics.some(
        ({ code }) => code === 'CLOUDFLARE_AGENTS_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
      ),
    ).toBe(true);
  });

  test('preserves package, language, and agent evidence for an unsupported class closure', async () => {
    const runtimeSource = getFixtureEntry('export class SupportAgent');
    const replacement = replaceFixtureText(
      runtimeSource.text,
      /export class SupportAgent extends Think\s*\{/,
      'export class SupportAgent extends Think { static {}',
    );
    const result = await inspect({ [runtimeSource.path]: replacement });
    const agentId = expectedEvidence.find(
      ({ details, kind }) =>
        kind === 'agent-definition' && details['targetId'] === 'typescript-think-0-16-ai-sdk-7',
    )?.agentId;
    const agentEvidence = result.evidence.filter((evidence) => evidence.agentId === agentId);

    expect(agentEvidence.map(({ kind }) => kind)).toStrictEqual([
      'agent-definition',
      'language',
      'runtime-package',
      'runtime-package',
      'runtime-package',
    ]);
  });

  test('suppresses tool and handoff evidence when a tools map is open', async () => {
    const runtimeSource = getFixtureEntry('getTools');
    const replacement = replaceFixtureText(
      runtimeSource.text,
      /(getTools\([^)]*\)[^{]*\{\s*return\s*\{)/,
      '$1\n      ...externalTools,',
    );
    const result = await inspect({ [runtimeSource.path]: replacement });
    const agentId = expectedEvidence.find(
      ({ details, kind }) =>
        kind === 'agent-definition' && details['targetId'] === 'typescript-think-0-16-ai-sdk-7',
    )?.agentId;

    expect(
      result.evidence.some(
        ({ agentId: evidenceAgentId, kind }) =>
          evidenceAgentId === agentId &&
          (kind === 'tool-registration' || kind === 'handoff-registration'),
      ),
    ).toBe(false);
  });

  test('suppresses AI Chat tool evidence when any request tools map is unresolved', async () => {
    const runtimeSource = getFixtureEntry('onChatMessage');
    const replacement = replaceFixtureText(
      runtimeSource.text,
      'return streamText(',
      'streamText({ tools: externalTools });\n    return streamText(',
    );
    const result = await inspect({ [runtimeSource.path]: replacement });
    const agentId = expectedEvidence.find(
      ({ details, kind }) => kind === 'tool-registration' && details['toolName'] === 'find_order',
    )?.agentId;

    expect(
      result.evidence.some(
        ({ agentId: evidenceAgentId, kind }) =>
          evidenceAgentId === agentId && kind === 'tool-registration',
      ),
    ).toBe(false);
  });

  test('suppresses Think tool and handoff evidence when channels can replace tools', async () => {
    const runtimeSource = getFixtureEntry('getTools');
    const replacement = replaceFixtureText(
      runtimeSource.text,
      /export class SupportAgent extends Think\s*\{/,
      [
        'export class SupportAgent extends Think {',
        '  configureChannels() { return { web: { tools: channelTools } }; }',
      ].join('\n'),
    );
    const result = await inspect({ [runtimeSource.path]: replacement });
    const agentId = expectedEvidence.find(
      ({ details, kind }) =>
        kind === 'agent-definition' && details['targetId'] === 'typescript-think-0-16-ai-sdk-7',
    )?.agentId;

    expect(
      result.evidence.some(
        ({ agentId: evidenceAgentId, kind }) =>
          evidenceAgentId === agentId &&
          (kind === 'tool-registration' || kind === 'handoff-registration'),
      ),
    ).toBe(false);
  });

  test('preserves Think tool evidence for closed tool-free channels', async () => {
    const runtimeSource = getFixtureEntry('getTools');
    const replacement = replaceFixtureText(
      runtimeSource.text,
      /export class SupportAgent extends Think\s*\{/,
      [
        'export class SupportAgent extends Think {',
        "  configureChannels() { return { web: { kind: 'web', ingress: { transport: 'websocket' } } }; }",
      ].join('\n'),
    );
    const result = await inspect({ [runtimeSource.path]: replacement });
    const agentId = expectedEvidence.find(
      ({ details, kind }) =>
        kind === 'agent-definition' && details['targetId'] === 'typescript-think-0-16-ai-sdk-7',
    )?.agentId;

    expect(
      result.evidence.some(
        ({ agentId: evidenceAgentId, kind }) =>
          evidenceAgentId === agentId && kind === 'tool-registration',
      ),
    ).toBe(true);
  });

  test('suppresses handoff evidence for a target that fails Cloudflare agent inspection', async () => {
    const runtimeSource = getFixtureEntry('export class SupportAgent');
    const replacement = replaceFixtureText(
      runtimeSource.text,
      /export class SummaryAgent extends AIChatAgent\s*\{/,
      'export class SummaryAgent extends AIChatAgent { static {}',
    );
    const result = await inspect({ [runtimeSource.path]: replacement });
    const agentId = expectedEvidence.find(
      ({ details, kind }) =>
        kind === 'agent-definition' && details['targetId'] === 'typescript-think-0-16-ai-sdk-7',
    )?.agentId;

    expect(
      result.evidence.some(
        ({ agentId: evidenceAgentId, kind }) =>
          evidenceAgentId === agentId && kind === 'handoff-registration',
      ),
    ).toBe(false);
  });

  test('rejects a function-tool implementation symbol mismatch', async () => {
    const implementationSource = getFixtureEntry('export const findOrder = async');
    const replacement = replaceFixtureText(
      implementationSource.text,
      'export const findOrder',
      'export const anotherImplementation',
    );
    const result = await inspect({ [implementationSource.path]: replacement });

    expect(
      result.diagnostics.some(
        ({ code }) => code === 'CLOUDFLARE_AGENTS_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND',
      ),
    ).toBe(true);
  });
});
