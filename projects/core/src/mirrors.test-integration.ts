// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { inspectAgentAssets } from './agent-assets.js';
import { discoverCanonicalAssets } from './canonical-discovery.js';
import type { IIndexedMirror } from './contracts.js';
import { createCore } from './core.js';
import type { ICoreDiagnostic } from './diagnostics.js';
import { inspectMirrors } from './mirrors.js';
import { normalizeCoreOptions } from './options.js';
import { createRepositoryInspectionSession } from './repository-inspection-session.js';

interface IFixtureEntry {
  readonly path: string;
  readonly type: 'file' | 'directory' | 'symlink';
  readonly text?: string;
  readonly bytes?: readonly number[];
}

interface IExpectedDiagnostic {
  readonly code: string;
  readonly details: Readonly<Record<string, string | number>>;
  readonly entity: Readonly<Record<string, string>> | null;
  readonly message: string;
  readonly path: string;
  readonly pointer: string | null;
  readonly range: ICoreDiagnostic['range'];
}

interface IMirrorFixture {
  readonly cases: readonly {
    readonly name: string;
    readonly manifest: string;
    readonly entries: readonly IFixtureEntry[];
    readonly expectedAgentMirrors: readonly {
      readonly id: string;
      readonly mirrors: readonly {
        readonly path: string;
        readonly digest: string;
        readonly canonicalDigest: string;
      }[];
    }[];
    readonly expectedDiagnostics: readonly IExpectedDiagnostic[];
  }[];
}

const fixture = JSON.parse(
  readFileSync(new URL('../../../fixtures/core/mirrors/cases.json', import.meta.url), 'utf8'),
) as IMirrorFixture;
const options = normalizeCoreOptions(undefined);
const manifestPath = parseRepositoryPath('/moldea/moldea.yaml');

const createEntries = (
  fixtureCase: IMirrorFixture['cases'][number],
): readonly IMemoryRepositoryEntry[] => [
  { content: fixtureCase.manifest, path: manifestPath, type: 'file' },
  { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
  ...fixtureCase.entries.map((entry): IMemoryRepositoryEntry => {
    if (entry.type !== 'file') {
      return { path: entry.path, type: entry.type };
    }

    if (entry.bytes !== undefined) {
      return { content: Uint8Array.from(entry.bytes), path: entry.path, type: 'file' };
    }

    if (entry.text === undefined) {
      throw new TypeError('A mirror file fixture must include text or bytes.');
    }

    return { content: entry.text, path: entry.path, type: 'file' };
  }),
];

const reverseEnumeration = (repository: IRepositoryReader): IRepositoryReader => ({
  getEntry: (path, operationOptions) => repository.getEntry(path, operationOptions),
  listEntries: (operationOptions): AsyncIterable<IRepositoryEntry> => ({
    async *[Symbol.asyncIterator]() {
      const entries: IRepositoryEntry[] = [];

      for await (const entry of repository.listEntries(operationOptions)) {
        entries.push(entry);
      }

      for (const entry of entries.reverse()) {
        yield entry;
      }
    },
  }),
  readFile: (path, operationOptions) => repository.readFile(path, operationOptions),
});

const simplifyAgentMirrors = (
  agentMirrors: readonly { readonly id: string; readonly mirrors: readonly IIndexedMirror[] }[],
) => {
  return agentMirrors.map(({ id, mirrors }) => ({
    id,
    mirrors: mirrors.map(({ canonicalDigest, digest, path }) => ({
      canonicalDigest,
      digest,
      path,
    })),
  }));
};

const simplifyDiagnostics = (diagnostics: readonly ICoreDiagnostic[]) => {
  return diagnostics.map(({ code, details, entity, message, path, pointer, range }) => ({
    code,
    details: { ...details },
    entity: entity === null ? null : { ...entity },
    message,
    path,
    pointer,
    range,
  }));
};

const inspectRepository = async (sourceRepository: IRepositoryReader) => {
  const session = createRepositoryInspectionSession(sourceRepository, options.limits);
  const discovery = await discoverCanonicalAssets(session.reader, options.limits);

  expect(discovery.diagnostics).toStrictEqual([]);
  if (discovery.inventory.manifest === null) {
    throw new TypeError('The mirror fixture must include a canonical manifest.');
  }

  const resolvedManifestPath = discovery.inventory.manifest;
  const manifestResult = await createCore().parseManifest({
    content: await session.reader.readFile(resolvedManifestPath),
    path: resolvedManifestPath,
  });

  expect(manifestResult.diagnostics).toStrictEqual([]);
  if (manifestResult.manifest === null) {
    throw new TypeError('The mirror fixture manifest must be valid.');
  }

  const agentAssets = await inspectAgentAssets(
    session.reader,
    manifestResult.manifest,
    discovery,
    options,
  );
  const mirrorResult = await inspectMirrors(
    session.reader,
    resolvedManifestPath,
    agentAssets.agents,
    options,
  );

  return { agentAssets, mirrorResult };
};

describe('Core mirror inspection through the memory repository reader', () => {
  test.each(fixture.cases)('returns exact repository-level results for $name', async (case_) => {
    const { agentAssets, mirrorResult } = await inspectRepository(
      createMemoryRepositoryReader(createEntries(case_)),
    );

    expect(agentAssets.diagnostics).toStrictEqual([]);
    expect(simplifyAgentMirrors(mirrorResult.agentMirrors)).toStrictEqual(
      case_.expectedAgentMirrors,
    );
    expect(simplifyDiagnostics(mirrorResult.diagnostics)).toStrictEqual(case_.expectedDiagnostics);
    expect(mirrorResult.valid).toBe(case_.expectedDiagnostics.length === 0);
    expect(Object.isFrozen(mirrorResult)).toBe(true);
    expect(Object.isFrozen(mirrorResult.agentMirrors)).toBe(true);
    expect(Object.isFrozen(mirrorResult.agentMirrors[0]?.mirrors)).toBe(true);
  });

  test('is independent of repository insertion and enumeration order', async () => {
    const case_ = fixture.cases.find(({ name }) => name === 'normalized matching mirrors');

    if (case_ === undefined) {
      throw new TypeError('The normalized mirror fixture is required.');
    }

    const entries = createEntries(case_);
    const expected = await inspectRepository(createMemoryRepositoryReader(entries));
    const reordered = await inspectRepository(
      reverseEnumeration(createMemoryRepositoryReader([...entries].reverse())),
    );

    expect(reordered).toStrictEqual(expected);
  });

  test('skips every mirror lookup when the canonical instruction is unavailable', async () => {
    const mirrorPath = parseRepositoryPath('/mirrors/not-inspected.md');
    const manifest =
      'version: 1\nagents:\n  alpha:\n    framework:\n      id: custom\n    mirrors:\n      - /mirrors/not-inspected.md\n';
    const repository = createMemoryRepositoryReader([
      { content: manifest, path: manifestPath, type: 'file' },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      {
        content: 'Alpha agent.\n',
        path: '/moldea/agents/alpha/description.md',
        type: 'file',
      },
      { content: 'Stale content.\n', path: mirrorPath, type: 'file' },
    ]);
    const mirrorEntryPaths: IRepositoryPath[] = [];
    const mirrorReadPaths: IRepositoryPath[] = [];
    const observedRepository: IRepositoryReader = {
      getEntry: (path, operationOptions) => {
        if (path === mirrorPath) {
          mirrorEntryPaths.push(path);
        }

        return repository.getEntry(path, operationOptions);
      },
      listEntries: (operationOptions) => repository.listEntries(operationOptions),
      readFile: (path, operationOptions) => {
        if (path === mirrorPath) {
          mirrorReadPaths.push(path);
        }

        return repository.readFile(path, operationOptions);
      },
    };
    const { agentAssets, mirrorResult } = await inspectRepository(observedRepository);

    expect(agentAssets.agents[0]?.instruction).toBeNull();
    expect(agentAssets.diagnostics).toMatchObject([
      { code: 'MOLDEA_AGENT_INSTRUCTION_MISSING', entity: { agentId: 'alpha' } },
    ]);
    expect(mirrorResult).toStrictEqual({
      agentMirrors: [{ id: 'alpha', mirrors: [] }],
      diagnostics: [],
      valid: true,
    });
    expect(mirrorEntryPaths).toStrictEqual([]);
    expect(mirrorReadPaths).toStrictEqual([]);
  });

  test('compares mirrors when a non-empty canonical instruction has an identity diagnostic', async () => {
    const instruction = 'Introduction.\nYou are the `alpha` agent.\n';
    const manifest =
      'version: 1\nagents:\n  alpha:\n    framework:\n      id: custom\n    mirrors:\n      - /mirrors/alpha.md\n';
    const { agentAssets, mirrorResult } = await inspectRepository(
      createMemoryRepositoryReader([
        { content: manifest, path: manifestPath, type: 'file' },
        { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
        {
          content: 'Alpha agent.\n',
          path: '/moldea/agents/alpha/description.md',
          type: 'file',
        },
        {
          content: instruction,
          path: '/moldea/agents/alpha/instruction.md',
          type: 'file',
        },
        { content: instruction, path: '/mirrors/alpha.md', type: 'file' },
      ]),
    );

    expect(agentAssets.diagnostics).toMatchObject([
      { code: 'MOLDEA_AGENT_IDENTITY_INVALID', entity: { agentId: 'alpha' } },
    ]);
    expect(agentAssets.agents[0]?.instruction).not.toBeNull();
    expect(mirrorResult.diagnostics).toStrictEqual([]);
    expect(mirrorResult.agentMirrors).toMatchObject([
      {
        id: 'alpha',
        mirrors: [
          {
            canonicalDigest:
              'sha256:594e37355b76f9fb4bc0ae8fa35b376b3c188d88b7a1d89ec8abcea52e61402b',
            digest: 'sha256:594e37355b76f9fb4bc0ae8fa35b376b3c188d88b7a1d89ec8abcea52e61402b',
            path: '/mirrors/alpha.md',
          },
        ],
      },
    ]);
  });

  test('reuses inspection-session bytes across manifest, agent, and mirror phases', async () => {
    const case_ = fixture.cases.find(({ name }) => name === 'normalized matching mirrors');

    if (case_ === undefined) {
      throw new TypeError('The normalized mirror fixture is required.');
    }

    const repository = createMemoryRepositoryReader(createEntries(case_));
    const readCounts = new Map<IRepositoryPath, number>();
    const observedRepository: IRepositoryReader = {
      getEntry: (path, operationOptions) => repository.getEntry(path, operationOptions),
      listEntries: (operationOptions) => repository.listEntries(operationOptions),
      readFile: (path, operationOptions) => {
        readCounts.set(path, (readCounts.get(path) ?? 0) + 1);
        return repository.readFile(path, operationOptions);
      },
    };

    await inspectRepository(observedRepository);

    expect(Object.fromEntries(readCounts)).toStrictEqual({
      '/apps/alpha-cr.md': 1,
      '/apps/alpha-crlf.md': 1,
      '/apps/zeta.md': 1,
      '/moldea/agents/alpha/description.md': 1,
      '/moldea/agents/alpha/instruction.md': 1,
      '/moldea/agents/zeta/description.md': 1,
      '/moldea/agents/zeta/instruction.md': 1,
      '/moldea/moldea.yaml': 1,
    });
  });
});
