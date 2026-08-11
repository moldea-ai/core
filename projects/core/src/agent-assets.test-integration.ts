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
import { createCore } from './core.js';
import type { ICoreDiagnostic } from './diagnostics.js';
import { normalizeCoreOptions } from './options.js';

interface IFixtureEntry {
  readonly path: string;
  readonly type: 'file' | 'directory';
  readonly text?: string;
}

interface IExpectedDiagnostic {
  readonly code: string;
  readonly details: Readonly<Record<string, string>>;
  readonly entity: Readonly<Record<string, string>>;
  readonly path: string;
}

interface IAgentAssetFixture {
  readonly cases: readonly {
    readonly name: string;
    readonly manifest: string;
    readonly entries: readonly IFixtureEntry[];
    readonly expectedAgents: readonly {
      readonly id: string;
      readonly description: string | null;
      readonly instruction: string | null;
      readonly handoffDescription: string | null;
    }[];
    readonly expectedDiagnostics: readonly IExpectedDiagnostic[];
  }[];
}

const fixture = JSON.parse(
  readFileSync(new URL('../../../fixtures/core/agent-assets/cases.json', import.meta.url), 'utf8'),
) as IAgentAssetFixture;
const options = normalizeCoreOptions(undefined);
const manifestPath = parseRepositoryPath('/moldea/moldea.yaml');

const createEntries = (
  fixtureCase: IAgentAssetFixture['cases'][number],
): readonly IMemoryRepositoryEntry[] => [
  { content: fixtureCase.manifest, path: manifestPath, type: 'file' },
  { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
  ...fixtureCase.entries.map((entry): IMemoryRepositoryEntry => {
    if (entry.type === 'directory') {
      return { path: entry.path, type: 'directory' };
    }

    if (entry.text === undefined) {
      throw new TypeError('An agent file fixture must include text.');
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

const simplifyDiagnostics = (diagnostics: readonly ICoreDiagnostic[]) => {
  return diagnostics.map(({ code, details, entity, path }) => ({
    code,
    details: { ...details },
    entity: entity === null ? null : { ...entity },
    path,
  }));
};

const simplifyAgents = (agents: Awaited<ReturnType<typeof inspectAgentAssets>>['agents']) => {
  return agents.map(({ description, handoffDescription, id, instruction }) => ({
    description: description?.value ?? null,
    handoffDescription: handoffDescription?.value ?? null,
    id,
    instruction: instruction?.content ?? null,
  }));
};

const inspectFixture = async (repository: IRepositoryReader, manifestContent: string) => {
  const discovery = await discoverCanonicalAssets(repository, options.limits);
  const manifestResult = await createCore().parseManifest({
    content: manifestContent,
    path: manifestPath,
  });

  expect(discovery.diagnostics).toStrictEqual([]);
  expect(manifestResult.diagnostics).toStrictEqual([]);
  if (manifestResult.manifest === null) {
    throw new TypeError('The agent-assets fixture manifest must be valid.');
  }

  return inspectAgentAssets(repository, manifestResult.manifest, discovery, options);
};

describe('Core agent assets through the memory repository reader', () => {
  test.each(fixture.cases)('returns exact repository-level results for $name', async (case_) => {
    const result = await inspectFixture(
      createMemoryRepositoryReader(createEntries(case_)),
      case_.manifest,
    );

    expect(simplifyAgents(result.agents)).toStrictEqual(case_.expectedAgents);
    expect(simplifyDiagnostics(result.diagnostics)).toStrictEqual(case_.expectedDiagnostics);
    expect(result.valid).toBe(case_.expectedDiagnostics.length === 0);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.agents)).toBe(true);
    expect(Object.isFrozen(result.agents[0])).toBe(true);
  });

  test('is independent of repository insertion and enumeration order', async () => {
    const case_ = fixture.cases.find(({ name }) => name === 'complete sorted registered agents');

    if (case_ === undefined) {
      throw new TypeError('The complete agent-assets fixture is required.');
    }

    const entries = createEntries(case_);
    const expected = await inspectFixture(createMemoryRepositoryReader(entries), case_.manifest);
    const reordered = await inspectFixture(
      reverseEnumeration(createMemoryRepositoryReader([...entries].reverse())),
      case_.manifest,
    );

    expect(reordered).toStrictEqual(expected);
  });

  test('reads registered assets in fixed order and never reads unregistered assets', async () => {
    const alphaDescription = parseRepositoryPath('/moldea/agents/alpha/description.md');
    const alphaInstruction = parseRepositoryPath('/moldea/agents/alpha/instruction.md');
    const rogueDescription = parseRepositoryPath('/moldea/agents/rogue/description.md');
    const rogueInstruction = parseRepositoryPath('/moldea/agents/rogue/instruction.md');
    const manifest = 'version: 1\nagents:\n  alpha:\n    framework:\n      id: custom\n';
    const repository = createMemoryRepositoryReader([
      { content: manifest, path: manifestPath, type: 'file' },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      { content: 'Alpha agent.', path: alphaDescription, type: 'file' },
      { content: 'You are the `alpha` agent.', path: alphaInstruction, type: 'file' },
      { content: 'Rogue agent.', path: rogueDescription, type: 'file' },
      { content: 'You are the `rogue` agent.', path: rogueInstruction, type: 'file' },
    ]);
    const discovery = await discoverCanonicalAssets(repository, options.limits);
    const manifestResult = await createCore().parseManifest({
      content: manifest,
      path: manifestPath,
    });
    const readPaths: IRepositoryPath[] = [];
    const observedRepository: IRepositoryReader = {
      getEntry: (path, operationOptions) => repository.getEntry(path, operationOptions),
      listEntries: (operationOptions) => repository.listEntries(operationOptions),
      readFile: (path, operationOptions) => {
        readPaths.push(path);
        return repository.readFile(path, operationOptions);
      },
    };

    if (manifestResult.manifest === null) {
      throw new TypeError('The observed agent manifest must be valid.');
    }

    const result = await inspectAgentAssets(
      observedRepository,
      manifestResult.manifest,
      discovery,
      options,
    );

    expect(readPaths).toStrictEqual([alphaDescription, alphaInstruction]);
    expect(result.diagnostics).toMatchObject([
      { code: 'MOLDEA_AGENT_DIRECTORY_UNREGISTERED', path: '/moldea/agents/rogue' },
    ]);
  });

  test('suppresses missing cascades for discovery-owned directory and asset failures', async () => {
    const blockedDirectory = parseRepositoryPath('/moldea/agents/blocked');
    const descriptionPath = parseRepositoryPath('/moldea/agents/present/description.md');
    const instructionPath = parseRepositoryPath('/moldea/agents/present/instruction.md');
    const manifest =
      'version: 1\nagents:\n  blocked:\n    framework:\n      id: custom\n  present:\n    framework:\n      id: custom\n';
    const repository = createMemoryRepositoryReader([
      { content: manifest, path: manifestPath, type: 'file' },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      { path: blockedDirectory, type: 'symlink' },
      { path: '/moldea/agents/present', type: 'directory' },
      { path: descriptionPath, type: 'symlink' },
      { path: instructionPath, type: 'directory' },
    ]);
    const discovery = await discoverCanonicalAssets(repository, options.limits);
    const manifestResult = await createCore().parseManifest({
      content: manifest,
      path: manifestPath,
    });

    expect(discovery.diagnostics).toMatchObject([
      { code: 'MOLDEA_ENTRY_TYPE_INVALID', path: blockedDirectory },
      { code: 'MOLDEA_CANONICAL_ASSET_SYMLINK', path: descriptionPath },
      { code: 'MOLDEA_ENTRY_TYPE_INVALID', path: instructionPath },
    ]);
    if (manifestResult.manifest === null) {
      throw new TypeError('The blocked-agent manifest must be valid.');
    }

    const result = await inspectAgentAssets(
      repository,
      manifestResult.manifest,
      discovery,
      options,
    );

    expect(result).toMatchObject({ diagnostics: [], valid: true });
    expect(simplifyAgents(result.agents)).toStrictEqual([
      {
        description: null,
        handoffDescription: null,
        id: 'blocked',
        instruction: null,
      },
      {
        description: null,
        handoffDescription: null,
        id: 'present',
        instruction: null,
      },
    ]);
  });

  test('suppresses missing-agent cascades beneath a blocked structural parent', async () => {
    const agentsPath = parseRepositoryPath('/moldea/agents');
    const manifest = 'version: 1\nagents:\n  alpha:\n    framework:\n      id: custom\n';
    const repository = createMemoryRepositoryReader([
      { content: manifest, path: manifestPath, type: 'file' },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      { path: agentsPath, type: 'symlink' },
    ]);
    const discovery = await discoverCanonicalAssets(repository, options.limits);
    const manifestResult = await createCore().parseManifest({
      content: manifest,
      path: manifestPath,
    });

    expect(discovery.diagnostics).toMatchObject([
      { code: 'MOLDEA_ENTRY_TYPE_INVALID', path: agentsPath },
    ]);
    if (manifestResult.manifest === null) {
      throw new TypeError('The blocked-agent-parent manifest must be valid.');
    }

    const result = await inspectAgentAssets(
      repository,
      manifestResult.manifest,
      discovery,
      options,
    );

    expect(result).toMatchObject({ diagnostics: [], valid: true });
    expect(simplifyAgents(result.agents)).toStrictEqual([
      {
        description: null,
        handoffDescription: null,
        id: 'alpha',
        instruction: null,
      },
    ]);
  });

  test('retains unrelated validation after strict text failures', async () => {
    const alphaDescription = parseRepositoryPath('/moldea/agents/alpha/description.md');
    const alphaInstruction = parseRepositoryPath('/moldea/agents/alpha/instruction.md');
    const betaDescription = parseRepositoryPath('/moldea/agents/beta/description.md');
    const betaInstruction = parseRepositoryPath('/moldea/agents/beta/instruction.md');
    const manifest =
      'version: 1\nagents:\n  alpha:\n    framework:\n      id: custom\n  beta:\n    framework:\n      id: custom\n';
    const repository = createMemoryRepositoryReader([
      { content: manifest, path: manifestPath, type: 'file' },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      { content: Uint8Array.from([0xff]), path: alphaDescription, type: 'file' },
      { content: 'You are the `alpha` agent.', path: alphaInstruction, type: 'file' },
      { content: 'Beta agent.', path: betaDescription, type: 'file' },
      { content: 'Introduction only.', path: betaInstruction, type: 'file' },
    ]);
    const discovery = await discoverCanonicalAssets(repository, options.limits);
    const manifestResult = await createCore().parseManifest({
      content: manifest,
      path: manifestPath,
    });

    if (manifestResult.manifest === null) {
      throw new TypeError('The strict-text agent manifest must be valid.');
    }

    const result = await inspectAgentAssets(
      repository,
      manifestResult.manifest,
      discovery,
      options,
    );

    expect(result.diagnostics).toMatchObject([
      { code: 'MOLDEA_TEXT_INVALID_UTF8', path: alphaDescription },
      { code: 'MOLDEA_AGENT_IDENTITY_INVALID', path: betaInstruction },
    ]);
  });
});
