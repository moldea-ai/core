// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { createCore } from './core.js';

interface IFixtureEntry {
  readonly path: string;
  readonly type: 'file' | 'directory' | 'symlink';
  readonly text?: string;
  readonly bytes?: readonly number[];
}

interface IProjectIndexFixture {
  readonly cases: readonly {
    readonly name: string;
    readonly manifest: string;
    readonly entries: readonly IFixtureEntry[];
    readonly expectedFormatVersion: 1;
  }[];
}

const fixture = JSON.parse(
  readFileSync(new URL('../../../fixtures/core/project-index/cases.json', import.meta.url), 'utf8'),
) as IProjectIndexFixture;
const completeExpectedProject = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/core/project-index/complete.expected.json', import.meta.url),
    'utf8',
  ),
) as unknown;
const expectedDiagnosticsByCase = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/core/project-index/diagnostics.expected.json', import.meta.url),
    'utf8',
  ),
) as Readonly<Record<string, readonly unknown[]>>;
const manifestPath = parseRepositoryPath('/moldea/moldea.yaml');

const createEntries = (
  fixtureCase: IProjectIndexFixture['cases'][number],
): readonly IMemoryRepositoryEntry[] => [
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

describe('public Core project inspection', () => {
  test.each(fixture.cases)('returns the exact public result for $name', async (case_) => {
    const result = await createCore().inspectProject({
      repository: createMemoryRepositoryReader(createEntries(case_)),
    });
    const expectedDiagnostics = expectedDiagnosticsByCase[case_.name];

    if (expectedDiagnostics === undefined) {
      throw new TypeError(`The ${case_.name} diagnostic golden is required.`);
    }

    const isComplete = case_.name === 'complete universal project';

    expect(toJsonValue(result)).toStrictEqual({
      diagnostics: expectedDiagnostics,
      evidence: [],
      formatVersion: case_.expectedFormatVersion,
      project: isComplete ? completeExpectedProject : null,
      valid: isComplete,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
    expect(Object.isFrozen(result.evidence)).toBe(true);
    expect(result.project === null || Object.isFrozen(result.project)).toBe(true);
  });
});
