// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
  parseRepositoryPath,
  RepositorySourceException,
  type IRepositoryEntry,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { discoverCanonicalAssets } from '../canonical-discovery/index.js';
import type { ICoreDiagnostic } from '../diagnostics/index.js';
import type { IDecisionStatus } from '../format/index.js';
import { normalizeCoreOptions } from '../options/index.js';

import { readDecisionGraph } from './index.js';

interface IDecisionFixture {
  readonly id: string;
  readonly slug: string;
  readonly status?: IDecisionStatus;
  readonly supersedes?: readonly string[];
  readonly content?: string;
}

interface IExpectedDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly pointer: string | null;
  readonly decisionId: string;
  readonly details: Readonly<Record<string, string | number>>;
}

interface IDecisionGraphFixture {
  readonly cases: readonly {
    readonly name: string;
    readonly decisions: readonly IDecisionFixture[];
    readonly expectedDiagnostics: readonly IExpectedDiagnostic[];
  }[];
}

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/core/decision-graph/cases.json', import.meta.url),
    'utf8',
  ),
) as IDecisionGraphFixture;
const options = normalizeCoreOptions(undefined);

const createDecisionPath = ({ id, slug }: IDecisionFixture): IRepositoryPath => {
  return parseRepositoryPath(`/moldea/decisions/${id}-${slug}.md`);
};

const createDecisionContent = (decision: IDecisionFixture): string => {
  if (decision.content !== undefined) {
    return decision.content;
  }

  if (decision.status === undefined) {
    throw new TypeError('A valid decision fixture must include a status.');
  }

  const supersedes =
    decision.supersedes === undefined
      ? []
      : ['supersedes:', ...decision.supersedes.map((id) => `  - "${id}"`)];

  return [
    '---',
    `status: ${decision.status}`,
    `createdAt: "${new Date(Number(decision.id)).toISOString()}"`,
    ...supersedes,
    '---',
    `Decision ${decision.id}.`,
    '',
  ].join('\n');
};

const createRepository = (
  decisions: readonly IDecisionFixture[],
  additionalEntries: readonly IMemoryRepositoryEntry[] = [],
): IRepositoryReader => {
  return createMemoryRepositoryReader([
    { content: 'version: 1\n', path: '/moldea/moldea.yaml', type: 'file' },
    { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
    ...decisions.map((decision): IMemoryRepositoryEntry => ({
      content: createDecisionContent(decision),
      path: createDecisionPath(decision),
      type: 'file',
    })),
    ...additionalEntries,
  ]);
};

const readDiscoveredGraph = async (repository: IRepositoryReader) => {
  const discovery = await discoverCanonicalAssets(repository, options.limits);

  expect(discovery.diagnostics).toStrictEqual([]);
  return readDecisionGraph(repository, discovery.inventory.decisions, options);
};

const simplifyDiagnostics = (diagnostics: readonly ICoreDiagnostic[]) => {
  return diagnostics.map(({ code, details, entity, path, pointer }) => ({
    code,
    decisionId: entity?.decisionId,
    details: { ...details },
    path,
    pointer,
  }));
};

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

describe('Core decision graph inspection through the memory repository reader', () => {
  test.each(fixture.cases)(
    'returns exact repository-level diagnostics for $name',
    async (case_) => {
      const result = await readDiscoveredGraph(createRepository(case_.decisions));

      expect(simplifyDiagnostics(result.diagnostics)).toStrictEqual(case_.expectedDiagnostics);
      expect(result.valid).toBe(case_.expectedDiagnostics.length === 0);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.decisions)).toBe(true);
      expect(Object.isFrozen(result.diagnostics)).toBe(true);
    },
  );

  test('is independent of repository enumeration and fixture insertion order', async () => {
    const case_ = fixture.cases.find(({ name }) => name === 'complete active chain');

    if (case_ === undefined) {
      throw new TypeError('The complete active-chain fixture is required.');
    }

    const repository = createRepository(case_.decisions);
    const expected = await readDiscoveredGraph(repository);
    const reordered = await readDiscoveredGraph(reverseEnumeration(repository));

    expect(reordered).toStrictEqual(expected);
    expect(reordered.decisions.map(({ id }) => id)).toStrictEqual([
      '1767225600000',
      '1767225600001',
      '1767225600002',
    ]);
  });

  test('reads each discovered decision exactly once in canonical path order', async () => {
    const case_ = fixture.cases.find(({ name }) => name === 'complete active chain');

    if (case_ === undefined) {
      throw new TypeError('The complete active-chain fixture is required.');
    }

    const repository = createRepository(case_.decisions);
    const readPaths: IRepositoryPath[] = [];
    const observedRepository: IRepositoryReader = {
      getEntry: (path, operationOptions) => repository.getEntry(path, operationOptions),
      listEntries: (operationOptions) => repository.listEntries(operationOptions),
      readFile: (path, operationOptions) => {
        readPaths.push(path);
        return repository.readFile(path, operationOptions);
      },
    };

    await readDiscoveredGraph(observedRepository);

    expect(readPaths).toStrictEqual(case_.decisions.map(createDecisionPath).sort());
  });

  test('preserves strict byte diagnostics while continuing unrelated decision validation', async () => {
    const invalidPath = parseRepositoryPath('/moldea/decisions/1767225600000-invalid-utf8.md');
    const orphan: IDecisionFixture = {
      id: '1767225600001',
      slug: 'orphan',
      status: 'superseded',
    };
    const repository = createRepository(
      [orphan],
      [{ content: Uint8Array.from([0xff]), path: invalidPath, type: 'file' }],
    );
    const result = await readDiscoveredGraph(repository);

    expect(result.diagnostics).toMatchObject([
      { code: 'MOLDEA_TEXT_INVALID_UTF8', path: invalidPath },
      {
        code: 'MOLDEA_DECISION_SUPERSEDED_ORPHAN',
        path: createDecisionPath(orphan),
      },
    ]);
  });

  test('forwards cancellation to decision reads', async () => {
    const decision: IDecisionFixture = {
      id: '1767225600000',
      slug: 'accepted',
      status: 'accepted',
    };
    const repository = createRepository([decision]);
    const controller = new AbortController();
    controller.abort(new Error('test cancellation'));

    await expect(
      readDecisionGraph(repository, [createDecisionPath(decision)], options, controller.signal),
    ).rejects.toMatchObject({
      code: 'ABORTED',
      operation: 'read-file',
      path: createDecisionPath(decision),
    });
  });

  test('preserves repository source failures without translating them into diagnostics', async () => {
    const decision: IDecisionFixture = {
      id: '1767225600000',
      slug: 'accepted',
      status: 'accepted',
    };
    const repository = createRepository([decision]);
    const sourceFailure = new RepositorySourceException({
      code: 'SOURCE_UNAVAILABLE',
      operation: 'read-file',
      path: createDecisionPath(decision),
      retryable: false,
    });
    const failingRepository: IRepositoryReader = {
      getEntry: (path, operationOptions) => repository.getEntry(path, operationOptions),
      listEntries: (operationOptions) => repository.listEntries(operationOptions),
      readFile: () => Promise.reject(sourceFailure),
    };

    await expect(
      readDecisionGraph(failingRepository, [createDecisionPath(decision)], options),
    ).rejects.toBe(sourceFailure);
  });

  test('rejects reader bytes that violate the source-neutral contract', async () => {
    const decisionPath = parseRepositoryPath('/moldea/decisions/1767225600000-accepted.md');
    const repository: IRepositoryReader = {
      getEntry: () => Promise.resolve(null),
      listEntries: () => {
        throw new TypeError('The malformed reader fixture does not support listing.');
      },
      readFile: () => Promise.resolve('not bytes' as never),
    };

    await expect(readDecisionGraph(repository, [decisionPath], options)).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      operation: 'read-file',
      path: decisionPath,
      retryable: false,
    });
  });

  test('attributes per-file resource failures to repository inspection', async () => {
    const decision: IDecisionFixture = {
      id: '1767225600000',
      slug: 'accepted',
      status: 'accepted',
    };
    const repository = createRepository([decision]);
    const constrainedOptions = normalizeCoreOptions({ limits: { maxFileBytes: 4 } });

    await expect(
      readDecisionGraph(repository, [createDecisionPath(decision)], constrainedOptions),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxFileBytes',
      operation: 'inspect-project',
      retryable: false,
    });
  });
});
