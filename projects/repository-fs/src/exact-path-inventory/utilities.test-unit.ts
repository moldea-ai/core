// @vitest-environment node
import { Buffer } from 'node:buffer';
import { expectToThrowCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { REPOSITORY_ROOT, parseRepositoryPath } from '@moldea.ai/repository';

import { createFilesystemExactPathSelectionPlan } from '../exact-path-selection/index.js';
import {
  getMissingFilesystemExactPathDirectoryEntries,
  matchFilesystemExactPathDirectoryNames,
} from './index.js';

const selectionPlan = createFilesystemExactPathSelectionPlan(
  {
    kind: 'paths',
    paths: [parseRepositoryPath('/zeta.txt'), parseRepositoryPath('/alpha.txt')],
  },
  2,
);

describe('filesystem exact-path directory name matching', () => {
  test('reports missing entries in deterministic required-entry order', () => {
    const missingEntries = getMissingFilesystemExactPathDirectoryEntries(
      [Buffer.from('zeta.txt'), Buffer.from('unrelated.txt')],
      selectionPlan.entries,
    );

    expect(missingEntries.map((entry) => entry.path)).toStrictEqual([
      parseRepositoryPath('/alpha.txt'),
    ]);
    expect(Object.isFrozen(missingEntries)).toBe(true);
  });

  test('returns identical required-entry order for arbitrary enumeration permutations', () => {
    const permutations = [
      [Buffer.from('alpha.txt'), Buffer.from('zeta.txt'), Buffer.from([0x80])],
      [Buffer.from([0x80]), Buffer.from('zeta.txt'), Buffer.from('alpha.txt')],
      [Buffer.from('zeta.txt'), Buffer.from([0x80]), Buffer.from('alpha.txt')],
    ];

    const results = permutations.map((encodedNames) =>
      matchFilesystemExactPathDirectoryNames(
        encodedNames,
        selectionPlan.entries,
        REPOSITORY_ROOT,
      ).map(({ encodedName, plannedEntry }) => ({
        encodedName: encodedName.toString('hex'),
        path: plannedEntry.path,
      })),
    );
    const expectedMatches = [
      { encodedName: Buffer.from('alpha.txt').toString('hex'), path: '/alpha.txt' },
      { encodedName: Buffer.from('zeta.txt').toString('hex'), path: '/zeta.txt' },
    ];

    expect(results).toStrictEqual([expectedMatches, expectedMatches, expectedMatches]);
  });

  test('freezes deterministic matches and retains the original raw buffers', () => {
    const alphaName = Buffer.from('alpha.txt');
    const zetaName = Buffer.from('zeta.txt');
    const matches = matchFilesystemExactPathDirectoryNames(
      [zetaName, alphaName],
      selectionPlan.entries,
      REPOSITORY_ROOT,
    );

    expect(Object.isFrozen(matches)).toBe(true);
    expect(matches.every(Object.isFrozen)).toBe(true);
    expect(matches[0]?.encodedName).toBe(alphaName);
    expect(matches[1]?.encodedName).toBe(zetaName);
  });

  test('reports the first missing required path independently of enumeration order', () => {
    for (const encodedNames of [
      [Buffer.from('zeta.txt'), Buffer.from('unrelated.txt')],
      [Buffer.from('unrelated.txt'), Buffer.from('zeta.txt')],
    ]) {
      expectToThrowCode(
        () =>
          matchFilesystemExactPathDirectoryNames(
            encodedNames,
            selectionPlan.entries,
            REPOSITORY_ROOT,
          ),
        'ENTRY_NOT_FOUND',
        'The requested repository entry was not found.',
      );

      expect(() =>
        matchFilesystemExactPathDirectoryNames(
          encodedNames,
          selectionPlan.entries,
          REPOSITORY_ROOT,
        ),
      ).toThrow(expect.objectContaining({ path: parseRepositoryPath('/alpha.txt') }));
    }
  });

  test('rejects duplicate raw matches as contradictory source data', () => {
    expectToThrowCode(
      () =>
        matchFilesystemExactPathDirectoryNames(
          [Buffer.from('alpha.txt'), Buffer.from('alpha.txt'), Buffer.from('zeta.txt')],
          selectionPlan.entries,
          REPOSITORY_ROOT,
        ),
      'INVALID_SOURCE_DATA',
      'The repository source returned invalid data.',
    );
  });
});
