// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { createCore } from '@moldea.ai/core';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { eveAdapter } from '../adapter/index.js';
import { EVE_ADAPTER_DIAGNOSTICS } from '../diagnostics/index.js';

interface IEveFixture {
  readonly entries: readonly {
    readonly path: string;
    readonly text: string;
    readonly type: 'file';
  }[];
  readonly manifest: string;
}

type IFixtureReplacement = string | Uint8Array;

const fixture = JSON.parse(
  readFileSync(new URL('../../../../fixtures/adapter-eve/cases.json', import.meta.url), 'utf8'),
) as IEveFixture;
const expectedEvidence = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-eve/evidence.expected.json', import.meta.url),
    'utf8',
  ),
) as readonly unknown[];
const expectedDiagnostics = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-eve/diagnostics.expected.json', import.meta.url),
    'utf8',
  ),
) as readonly { readonly code: string; readonly message: string }[];

const createEntries = (
  replacements: Readonly<Record<string, IFixtureReplacement | null>> = {},
): readonly IMemoryRepositoryEntry[] => {
  const fixturePaths = new Set(fixture.entries.map(({ path }) => path));

  return [
    {
      content: replacements['/moldea/moldea.yaml'] ?? fixture.manifest,
      path: '/moldea/moldea.yaml',
      type: 'file' as const,
    },
    ...fixture.entries
      .filter(({ path }) => replacements[path] !== null)
      .map((entry): IMemoryRepositoryEntry => ({
        content: replacements[entry.path] ?? entry.text,
        path: entry.path,
        type: 'file',
      })),
    ...Object.entries(replacements)
      .filter(
        ([path, content]) =>
          content !== null && path !== '/moldea/moldea.yaml' && !fixturePaths.has(path),
      )
      .map(([path, content]): IMemoryRepositoryEntry => ({
        content: content as IFixtureReplacement,
        path,
        type: 'file',
      })),
  ];
};

const inspect = async (replacements: Readonly<Record<string, IFixtureReplacement | null>> = {}) =>
  createCore({ adapters: [eveAdapter] }).inspectProject({
    repository: createMemoryRepositoryReader(createEntries(replacements)),
  });

const replaceFixture = (path: string, search: string, replacement: string): string => {
  const source = fixture.entries.find((entry) => entry.path === path)?.text;

  if (source === undefined || !source.includes(search)) {
    throw new TypeError(`The fixture ${path} does not contain ${JSON.stringify(search)}.`);
  }

  return source.replace(search, replacement);
};

describe('eveAdapter Core integration', () => {
  test('keeps the complete stable diagnostic catalog synchronized', () => {
    expect(
      Object.entries(EVE_ADAPTER_DIAGNOSTICS)
        .map(([code, message]) => ({ code, message }))
        .sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0)),
    ).toStrictEqual(expectedDiagnostics);
  });

  test('emits complete normalized evidence for the verified filesystem target', async () => {
    const result = await inspect();

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.valid).toBe(true);
    expect(result.evidence).toEqual(expectedEvidence);
  });

  test('is deterministic for reversed entries and concurrent inspections', async () => {
    const reversed = await createCore({ adapters: [eveAdapter] }).inspectProject({
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
    ['EVE_PACKAGE_MANIFEST_INVALID', '{'],
    ['EVE_SDK_VERSION_UNSUPPORTED', '{"dependencies":{"eve":"0.38.0"}}'],
  ])('emits %s for an invalid owning package boundary', async (code, packageManifest) => {
    const result = await inspect({ '/package.json': packageManifest });

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === code)).toBe(true);
  });

  test.each([
    ['EVE_SOURCE_TEXT_INVALID', Uint8Array.from([0xff])],
    ['EVE_SOURCE_SYNTAX_INVALID', "import { defineAgent } from 'eve'; export default ("],
  ])('emits %s for invalid bound agent source', async (code, source) => {
    const result = await inspect({ '/agent/agent.ts': source });

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === code)).toBe(true);
  });

  test.each([
    ['/agent/contracts.ts', Uint8Array.from([0xff]), 'EVE_SOURCE_TEXT_INVALID'],
    [
      '/agent/tools/search.ts',
      "import { defineTool } from 'eve/tools'; export default (",
      'EVE_SOURCE_SYNTAX_INVALID',
    ],
    ['/agent/skills/analyze.ts', Uint8Array.from([0xff]), 'EVE_SOURCE_TEXT_INVALID'],
    ['/agent/loaders.ts', Uint8Array.from([0xff]), 'EVE_SOURCE_TEXT_INVALID'],
  ])(
    'emits only source diagnostics for an invalid referenced relationship at %s',
    async (path, source, code) => {
      const result = await inspect({ [path]: source });
      const pathDiagnostics = result.diagnostics.filter((diagnostic) => diagnostic.path === path);

      expect(pathDiagnostics.length).toBeGreaterThan(0);
      expect(pathDiagnostics.every((diagnostic) => diagnostic.code === code)).toBe(true);
    },
  );

  test('uses the supported agent definition path for a closed missing instruction relationship', async () => {
    const result = await inspect({ '/agent/instructions.ts': null });
    const diagnostic = result.diagnostics.find(
      ({ code }) => code === 'EVE_INSTRUCTION_LOADER_NOT_WIRED',
    );

    expect(diagnostic?.path).toBe('/agent/agent.ts');
  });

  test('suppresses positive definition evidence for advanced agent options', async () => {
    const result = await inspect({
      '/agent/agent.ts': replaceFixture(
        '/agent/agent.ts',
        'model: MODEL,',
        "model: MODEL, reasoning: { effort: 'high' },",
      ),
    });

    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'support' && kind === 'agent-definition',
      ),
    ).toBe(false);
  });

  test('detects instruction-root conflicts without selecting a winner', async () => {
    const result = await inspect({ '/agent/instructions.md': 'Conflicting instructions.\n' });

    expect(result.diagnostics.some(({ code }) => code === 'EVE_INSTRUCTION_ROOT_CONFLICT')).toBe(
      true,
    );
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'support' && kind === 'instruction-loader',
      ),
    ).toBe(false);
  });

  test('diagnoses an invalid authored tool segment and suppresses registration', async () => {
    const source = fixture.entries.find(({ path }) => path === '/agent/tools/search.ts')?.text;

    if (source === undefined) {
      throw new TypeError('The tool fixture is missing.');
    }

    const manifest = fixture.manifest.replaceAll(
      '/agent/tools/search.ts',
      '/agent/tools/1search.ts',
    );
    const result = await inspect({
      '/agent/tools/search.ts': null,
      '/agent/tools/1search.ts': source,
      '/moldea/moldea.yaml': manifest,
    });

    expect(result.diagnostics.some(({ code }) => code === 'EVE_TOOL_NAME_INVALID')).toBe(true);
    expect(
      result.evidence.some(
        ({ capabilityId, kind }) => capabilityId === 'search' && kind === 'tool-registration',
      ),
    ).toBe(false);
  });

  test('diagnoses flattened tool names before unsupported definitions can hide collisions', async () => {
    const source = fixture.entries.find(({ path }) => path === '/agent/tools/search.ts')?.text;

    if (source === undefined) {
      throw new TypeError('The tool fixture is missing.');
    }

    const manifest = fixture.manifest
      .replace('name: search', 'name: foo-bar')
      .replaceAll('/agent/tools/search.ts', '/agent/tools/foo-bar.ts');
    const result = await inspect({
      '/agent/tools/search.ts': null,
      '/agent/tools/foo-bar.ts': source,
      '/agent/tools/foo/bar.ts': 'export default {};\n',
      '/moldea/moldea.yaml': manifest,
    });

    expect(result.diagnostics.some(({ code }) => code === 'EVE_TOOL_RUNTIME_NAME_COLLISION')).toBe(
      true,
    );
    expect(
      result.evidence.some(
        ({ capabilityId, kind }) => capabilityId === 'search' && kind === 'tool-registration',
      ),
    ).toBe(false);
  });

  test('diagnoses a tool registration that points to another supported static tool', async () => {
    const otherTool = replaceFixture(
      '/agent/tools/search.ts',
      'Searches the knowledge base.',
      'Performs another operation.',
    );
    const manifest = fixture.manifest.replace(
      'registration:\n          path: /agent/tools/search.ts',
      'registration:\n          path: /agent/tools/other.ts',
    );
    const result = await inspect({
      '/agent/tools/other.ts': otherTool,
      '/moldea/moldea.yaml': manifest,
    });

    expect(result.diagnostics.some(({ code }) => code === 'EVE_TOOL_REGISTRATION_NOT_WIRED')).toBe(
      true,
    );
    expect(result.diagnostics.some(({ code }) => code === 'EVE_TOOL_NAME_MISMATCH')).toBe(false);
  });

  test('diagnoses a stale local-subagent routing description but preserves registration', async () => {
    const result = await inspect({
      '/agent/subagents/summary/agent.ts': replaceFixture(
        '/agent/subagents/summary/agent.ts',
        'Summarizes a support request.',
        'Routes requests to the summary agent.',
      ),
    });

    expect(
      result.diagnostics.some(({ code }) => code === 'EVE_ROUTING_DESCRIPTION_NOT_WIRED'),
    ).toBe(true);
    expect(result.evidence.some(({ kind }) => kind === 'handoff-registration')).toBe(true);
  });

  test('diagnoses a local subagent that collides with an eve framework tool', async () => {
    const source = fixture.entries.find(
      ({ path }) => path === '/agent/subagents/summary/agent.ts',
    )?.text;

    if (source === undefined) {
      throw new TypeError('The local-subagent fixture is missing.');
    }

    const result = await inspect({
      '/agent/subagents/summary/agent.ts': null,
      '/agent/subagents/glob/agent.ts': source,
      '/moldea/agents/glob/description.md': 'Finds files by pattern.\n',
      '/moldea/agents/glob/handoff-description.md': 'Finds files by pattern.\n',
      '/moldea/agents/glob/instruction.md': 'You are the `glob` agent.\n',
      '/moldea/agents/summary/description.md': null,
      '/moldea/agents/summary/handoff-description.md': null,
      '/moldea/agents/summary/instruction.md': null,
      '/moldea/moldea.yaml': fixture.manifest.replaceAll('summary', 'glob'),
    });

    expect(
      result.diagnostics.some(
        ({ code, entity }) =>
          code === 'EVE_TOOL_SUBAGENT_NAME_COLLISION' && entity?.agentId === 'glob',
      ),
    ).toBe(true);
    expect(
      result.evidence.some(
        ({ agentId, kind }) => agentId === 'glob' && kind === 'handoff-registration',
      ),
    ).toBe(false);
  });

  test('propagates cancellation rather than returning partial evidence', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      createCore({ adapters: [eveAdapter] }).inspectProject({
        repository: createMemoryRepositoryReader(createEntries()),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
