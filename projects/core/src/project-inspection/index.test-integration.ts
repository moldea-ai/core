// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { createCore } from '../core/index.js';

interface IFixtureEntry {
  readonly path: string;
  readonly type: 'file' | 'directory' | 'symlink';
  readonly text?: string;
  readonly bytes?: readonly number[];
}

interface IRepositoryFixtureCase {
  readonly manifest: string;
  readonly entries: readonly IFixtureEntry[];
}

interface IProjectIndexFixture {
  readonly cases: readonly (IRepositoryFixtureCase & {
    readonly name: string;
    readonly expectedFormatVersion: 1;
    readonly expectedProjectFixture: string | null;
  })[];
}

interface ICustomRuntimeFixture {
  readonly cases: readonly (IRepositoryFixtureCase & {
    readonly name: string;
    readonly expectedGuidancePaths: readonly string[];
  })[];
}

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/core/project-index/cases.json', import.meta.url),
    'utf8',
  ),
) as IProjectIndexFixture;
const expectedDiagnosticsByCase = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/core/project-index/diagnostics.expected.json', import.meta.url),
    'utf8',
  ),
) as Readonly<Record<string, readonly unknown[]>>;
const customRuntimeFixture = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/core/custom-runtime/cases.json', import.meta.url),
    'utf8',
  ),
) as ICustomRuntimeFixture;
const manifestPath = parseRepositoryPath('/moldea/moldea.yaml');

const createEntries = (fixtureCase: IRepositoryFixtureCase): readonly IMemoryRepositoryEntry[] => [
  { content: fixtureCase.manifest, path: manifestPath, type: 'file' },
  ...fixtureCase.entries.map((entry): IMemoryRepositoryEntry => {
    if (entry.type !== 'file') {
      return { path: entry.path, type: entry.type };
    }

    if (entry.bytes !== undefined) {
      return { content: Uint8Array.from(entry.bytes), path: entry.path, type: 'file' };
    }

    if (entry.text === undefined) {
      throw new TypeError('A project-index file fixture must include text or bytes.');
    }

    return { content: entry.text, path: entry.path, type: 'file' };
  }),
];

const toJsonValue = (candidate: unknown): unknown =>
  JSON.parse(JSON.stringify(candidate)) as unknown;

const readExpectedProject = (fixtureCase: IProjectIndexFixture['cases'][number]): unknown => {
  if (fixtureCase.expectedProjectFixture === null) {
    return null;
  }

  return JSON.parse(
    readFileSync(
      new URL(
        `../../../../fixtures/core/project-index/${fixtureCase.expectedProjectFixture}`,
        import.meta.url,
      ),
      'utf8',
    ),
  ) as unknown;
};

describe('public Core project inspection', () => {
  test.each(fixture.cases)('returns the exact public result for $name', async (case_) => {
    const result = await createCore().inspectProject({
      repository: createMemoryRepositoryReader(createEntries(case_)),
    });
    const expectedDiagnostics = expectedDiagnosticsByCase[case_.name];

    if (expectedDiagnostics === undefined) {
      throw new TypeError(`The ${case_.name} diagnostic golden is required.`);
    }

    expect(toJsonValue(result)).toStrictEqual({
      diagnostics: expectedDiagnostics,
      evidence: [],
      formatVersion: case_.expectedFormatVersion,
      project: readExpectedProject(case_),
      valid: case_.expectedProjectFixture !== null,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
    expect(Object.isFrozen(result.evidence)).toBe(true);
    expect(result.project === null || Object.isFrozen(result.project)).toBe(true);
  });

  test.each(customRuntimeFixture.cases)(
    'supports $name through the universal memory-reader path',
    async (case_) => {
      const core = createCore();
      const repository = createMemoryRepositoryReader(createEntries(case_));
      const firstResult = await core.inspectProject({ repository });
      const secondResult = await core.inspectProject({ repository });
      const agent = firstResult.project?.agents[0];

      expect(toJsonValue(secondResult)).toStrictEqual(toJsonValue(firstResult));
      expect(firstResult.valid).toBe(true);
      expect(firstResult.diagnostics).toStrictEqual([]);
      expect(firstResult.evidence).toStrictEqual([]);
      expect(firstResult.formatVersion).toBe(1);
      expect(agent?.id).toBe('custom-agent');
      expect(agent?.declaration).toStrictEqual({
        affectedBy: ['/src/**'],
        bindings: {
          runtimeAgent: {
            path: '/src/custom-agent.ts',
            symbol: 'customAgent',
          },
        },
        runtime: {
          id: 'custom',
          ...(case_.expectedGuidancePaths.length === 0
            ? {}
            : { guidance: case_.expectedGuidancePaths[0] }),
        },
      });
      expect(firstResult.project?.runtimes.map(({ asset }) => asset.path)).toStrictEqual(
        case_.expectedGuidancePaths,
      );
    },
  );
});
