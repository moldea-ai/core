// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import type { IInspectedAgentAssets } from './agent-assets.js';
import type {
  IContentDigest,
  IIndexedContextAsset,
  IIndexedManifest,
  IIndexedRuntimeGuidance,
  IIndexedTextAsset,
} from './contracts.js';
import type { IParsedDecision } from './format.js';
import type { IAgentMirrorInspection } from './mirrors.js';
import { createProjectIndex, type IProjectIndexInput } from './project-index.js';

const createAsset = (path: string, content: string): IIndexedTextAsset => ({
  content,
  digest: `sha256:${path}` as IContentDigest,
  path: parseRepositoryPath(path),
  scalarLength: [...content].length,
  utf8ByteLength: new TextEncoder().encode(content).byteLength,
});

const createDecision = (
  id: string,
  slug: string,
  status: IParsedDecision['status'] = 'accepted',
): IParsedDecision => {
  const path = parseRepositoryPath(`/moldea/decisions/${id}-${slug}.md`);

  return {
    asset: createAsset(path, `Decision ${id}.\n`),
    body: `Decision ${id}.\n`,
    createdAt: new Date(Number(id)).toISOString(),
    id,
    path,
    status,
    supersedes: [],
  };
};

const createAgent = (
  id: string,
  context: readonly IRepositoryPath[] = [],
  decisions: readonly IRepositoryPath[] = [],
): IInspectedAgentAssets => {
  const descriptionAsset = createAsset(`/moldea/agents/${id}/description.md`, `${id} agent.\n`);

  return {
    declaration: {
      context,
      decisions,
      framework: { id: 'custom' },
    },
    description: {
      asset: descriptionAsset,
      scalarLength: descriptionAsset.scalarLength - 1,
      value: `${id} agent.`,
    },
    handoffDescription: null,
    id,
    instruction: createAsset(
      `/moldea/agents/${id}/instruction.md`,
      `You are the \`${id}\` agent.\n`,
    ),
  };
};

const createBaseInput = (): IProjectIndexInput => {
  const alphaContext = parseRepositoryPath('/moldea/context/alpha.md');
  const zetaContext = parseRepositoryPath('/moldea/context/zeta.md');
  const firstDecision = createDecision('1767225600000', 'first');
  const secondDecision = createDecision('1767225600001', 'second');
  const contextRelationship = { affectedBy: ['/src/alpha/**'] } as const;
  const decisionRelationship = { affectedBy: ['/src/**'] } as const;
  const alphaDeclaration = {
    context: [zetaContext, alphaContext],
    decisions: [secondDecision.path, firstDecision.path],
    framework: { id: 'custom' },
  } as const;
  const zetaDeclaration = { framework: { id: 'custom' } } as const;
  const manifest: IIndexedManifest = {
    asset: createAsset('/moldea/moldea.yaml', 'version: 1\n'),
    value: {
      agents: {
        alpha: alphaDeclaration,
        zeta: zetaDeclaration,
      },
      context: { [alphaContext]: contextRelationship },
      decisions: { [firstDecision.path]: decisionRelationship },
      unresolved: {
        'release-owner': {
          category: 'ownership',
          description: 'Release ownership is unresolved.',
          effect: 'warning',
          resolution: 'Assign one owner.',
        },
      },
      version: 1,
    },
  };
  const context: IIndexedContextAsset[] = [
    { asset: createAsset(zetaContext, 'Zeta.\n'), relationships: null },
    { asset: createAsset(alphaContext, 'Alpha.\n'), relationships: contextRelationship },
  ];
  const runtimes: IIndexedRuntimeGuidance[] = [
    { asset: createAsset('/moldea/runtimes/zeta.md', 'Zeta runtime.\n') },
    { asset: createAsset('/moldea/runtimes/alpha.md', 'Alpha runtime.\n') },
  ];
  const agents = [
    { ...createAgent('zeta'), declaration: zetaDeclaration },
    {
      ...createAgent(
        'alpha',
        [zetaContext, alphaContext],
        [secondDecision.path, firstDecision.path],
      ),
      declaration: alphaDeclaration,
    },
  ];
  const agentMirrors: IAgentMirrorInspection[] = [
    { id: 'zeta', mirrors: [] },
    {
      id: 'alpha',
      mirrors: [
        {
          canonicalDigest: agents[1]!.instruction!.digest,
          digest: agents[1]!.instruction!.digest,
          path: parseRepositoryPath('/mirrors/zeta.md'),
        },
        {
          canonicalDigest: agents[1]!.instruction!.digest,
          digest: agents[1]!.instruction!.digest,
          path: parseRepositoryPath('/mirrors/alpha.md'),
        },
      ],
    },
  ];

  return {
    agentMirrors,
    agents,
    context,
    decisions: [secondDecision, firstDecision],
    manifest,
    project: createAsset('/moldea/project.md', '# Project\n'),
    runtimes,
  };
};

describe('Core provisional project-index assembly', () => {
  test('maps every indexed field in deterministic order and deeply freezes the result', () => {
    const result = createProjectIndex(createBaseInput());

    expect(result).not.toBeNull();
    expect(result?.formatVersion).toBe(1);
    expect(result?.context.map(({ asset }) => asset.path)).toStrictEqual([
      '/moldea/context/alpha.md',
      '/moldea/context/zeta.md',
    ]);
    expect(result?.decisions.map(({ decision }) => decision.id)).toStrictEqual([
      '1767225600000',
      '1767225600001',
    ]);
    expect(result?.decisions.map(({ relationships }) => relationships)).toStrictEqual([
      { affectedBy: ['/src/**'] },
      null,
    ]);
    expect(result?.runtimes.map(({ asset }) => asset.path)).toStrictEqual([
      '/moldea/runtimes/alpha.md',
      '/moldea/runtimes/zeta.md',
    ]);
    expect(result?.agents.map(({ id }) => id)).toStrictEqual(['alpha', 'zeta']);
    expect(result?.agents[0]?.context).toStrictEqual([
      '/moldea/context/alpha.md',
      '/moldea/context/zeta.md',
    ]);
    expect(result?.agents[0]?.decisions).toStrictEqual([
      '/moldea/decisions/1767225600000-first.md',
      '/moldea/decisions/1767225600001-second.md',
    ]);
    expect(result?.agents[0]?.mirrors.map(({ path }) => path)).toStrictEqual([
      '/mirrors/alpha.md',
      '/mirrors/zeta.md',
    ]);
    expect(result?.unresolved).toStrictEqual({
      'release-owner': {
        category: 'ownership',
        description: 'Release ownership is unresolved.',
        effect: 'warning',
        resolution: 'Assign one owner.',
      },
    });
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.agents)).toBe(true);
    expect(Object.isFrozen(result?.agents[0]?.mirrors)).toBe(true);
    expect(Object.isFrozen(result?.unresolved)).toBe(true);
  });

  test('creates an empty frozen null-prototype unresolved record when absent', () => {
    const input = createBaseInput();
    const { unresolved, ...manifestValue } = input.manifest.value;
    void unresolved;
    const result = createProjectIndex({
      ...input,
      manifest: {
        ...input.manifest,
        value: manifestValue,
      },
    });

    expect(Object.keys(result?.unresolved ?? {})).toStrictEqual([]);
    expect(Object.getPrototypeOf(result?.unresolved)).toBeNull();
    expect(Object.isFrozen(result?.unresolved)).toBe(true);
  });

  test('returns null when a mandatory agent asset is unavailable', () => {
    const input = createBaseInput();
    const firstAgent = input.agents[0];

    if (firstAgent === undefined) {
      throw new TypeError('The project-index fixture requires an agent.');
    }

    expect(
      createProjectIndex({
        ...input,
        agents: [{ ...firstAgent, instruction: null }, ...input.agents.slice(1)],
      }),
    ).toBeNull();
  });

  test('returns null when mirror inspection does not cover every agent exactly once', () => {
    const input = createBaseInput();

    expect(createProjectIndex({ ...input, agentMirrors: input.agentMirrors.slice(1) })).toBeNull();
    expect(
      createProjectIndex({
        ...input,
        agentMirrors: [input.agentMirrors[0]!, input.agentMirrors[0]!],
      }),
    ).toBeNull();
  });
});
