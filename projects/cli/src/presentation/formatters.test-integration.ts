// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import type { IProjectInspectionResult } from '@moldea.ai/core';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { executeMoldeaCliCoreInspection } from '../core-composition/index.js';

import {
  formatMoldeaCliHumanInspectResult,
  formatMoldeaCliJsonInspectResult,
} from './formatters.js';
import { createMoldeaCliInspectResult } from './transformers.js';

// repository-wide Core fixture shape used by the CLI presentation boundary
interface IProjectIndexFixture {
  readonly cases: readonly {
    readonly entries: readonly {
      readonly bytes?: readonly number[];
      readonly path: string;
      readonly text?: string;
      readonly type: 'directory' | 'file' | 'symlink';
    }[];
    readonly manifest: string;
    readonly name: string;
  }[];
}

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/core/project-index/cases.json', import.meta.url),
    'utf8',
  ),
) as IProjectIndexFixture;

/** Loads the complete repository-wide project fixture through the public memory reader. */
const inspectCompleteProject = async (): Promise<IProjectInspectionResult> => {
  const fixtureCase = fixture.cases.find(({ name }) => name === 'complete universal project');

  if (fixtureCase === undefined) {
    throw new TypeError('The complete universal project fixture is required.');
  }

  const entries: IMemoryRepositoryEntry[] = [
    { content: fixtureCase.manifest, path: '/moldea/moldea.yaml', type: 'file' },
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

  return await executeMoldeaCliCoreInspection({
    repository: createMemoryRepositoryReader(entries),
    resourceLimits: {
      maxDiagnostics: 10_000,
      maxEntries: 100_000,
      maxEvidence: 10_000,
      maxFileBytes: 8_388_608,
      maxManifestBytes: 2_097_152,
      maxTotalBytes: 134_217_728,
    },
  });
};

describe('CLI inspection presentation through Core and the memory repository reader', () => {
  test('summarizes counts without content and serializes the complete Core result', async () => {
    const inspection = await inspectCompleteProject();
    const result = createMoldeaCliInspectResult(inspection);
    const humanOutput = formatMoldeaCliHumanInspectResult(result);
    const jsonOutput = formatMoldeaCliJsonInspectResult(result, '1.0.0');
    const envelope = JSON.parse(jsonOutput) as {
      readonly command: string;
      readonly result: { readonly inspection: unknown; readonly source: unknown };
      readonly status: string;
    };

    expect(humanOutput).toBe(
      `The moldea project is valid.
Repository format: 1
Context assets: 2
Decision: 1
Runtime-guidance asset: 1
Agents: 2
Mirror: 1
Adapter evidence items: 0
`,
    );
    expect(humanOutput).not.toContain('Universal project.');
    expect(envelope).toStrictEqual({
      cliVersion: '1.0.0',
      command: 'inspect',
      error: null,
      result: {
        inspection: JSON.parse(JSON.stringify(inspection)) as unknown,
        source: { kind: 'git-working-tree' },
      },
      schemaVersion: 2,
      status: 'valid',
    });
    expect(jsonOutput).toContain('Universal project.');
  });
});
