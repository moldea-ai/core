// @vitest-environment node
import { Buffer } from 'node:buffer';
import { expectToThrowCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { REPOSITORY_ROOT, parseRepositoryPath } from '@moldea.ai/repository';

import {
  createFilesystemDirectoryEntryCandidates,
  registerFilesystemDirectoryIdentity,
} from './index.js';

describe('filesystem directory inventory utilities', () => {
  test('creates identical frozen candidates for arbitrary enumeration permutations', () => {
    const permutations = [
      [Buffer.from('zeta.txt'), Buffer.from('alpha'), Buffer.from('项目.yaml')],
      [Buffer.from('项目.yaml'), Buffer.from('zeta.txt'), Buffer.from('alpha')],
      [Buffer.from('alpha'), Buffer.from('项目.yaml'), Buffer.from('zeta.txt')],
    ];
    const candidates = permutations.map((encodedNames) =>
      createFilesystemDirectoryEntryCandidates(encodedNames, REPOSITORY_ROOT),
    );
    const expectedCandidates = [
      { hostName: 'alpha', path: parseRepositoryPath('/alpha') },
      { hostName: 'zeta.txt', path: parseRepositoryPath('/zeta.txt') },
      { hostName: '项目.yaml', path: parseRepositoryPath('/项目.yaml') },
    ];

    expect(candidates).toStrictEqual([expectedCandidates, expectedCandidates, expectedCandidates]);
    expect(candidates.every(Object.isFrozen)).toBe(true);
    expect(candidates.every((entries) => entries.every(Object.isFrozen))).toBe(true);
  });

  test('excludes only the exact .git control entry before decoding', () => {
    const candidates = createFilesystemDirectoryEntryCandidates(
      [
        Buffer.from('.git'),
        Buffer.from('.GIT'),
        Buffer.from('.gitattributes'),
        Buffer.from('.github'),
        Buffer.from('.gitignore'),
      ],
      REPOSITORY_ROOT,
    );

    expect(candidates.map((candidate) => candidate.path)).toStrictEqual([
      parseRepositoryPath('/.GIT'),
      parseRepositoryPath('/.gitattributes'),
      parseRepositoryPath('/.github'),
      parseRepositoryPath('/.gitignore'),
    ]);
  });

  test('preserves normalization-distinct names', () => {
    const composedName = 'é.txt';
    const decomposedName = 'é.txt';
    const candidates = createFilesystemDirectoryEntryCandidates(
      [Buffer.from(composedName), Buffer.from(decomposedName)],
      REPOSITORY_ROOT,
    );

    expect(candidates.map((candidate) => candidate.hostName).sort()).toStrictEqual(
      [composedName, decomposedName].sort(),
    );
  });

  test.each([Buffer.from([0x80]), Buffer.from('control\u0001')])(
    'rejects an unrepresentable raw name %o',
    (encodedName) => {
      expectToThrowCode(
        () => createFilesystemDirectoryEntryCandidates([encodedName], REPOSITORY_ROOT),
        'INVALID_SOURCE_DATA',
        'The repository source returned invalid data.',
      );
    },
  );

  test('rejects duplicate logical candidates', () => {
    expectToThrowCode(
      () =>
        createFilesystemDirectoryEntryCandidates(
          [Buffer.from('duplicate'), Buffer.from('duplicate')],
          REPOSITORY_ROOT,
        ),
      'INVALID_SOURCE_DATA',
      'The repository source returned invalid data.',
    );
  });

  test('registers distinct directory identities and rejects a repeated identity', () => {
    const registeredIdentityKeys = new Set<string>();

    registerFilesystemDirectoryIdentity(
      registeredIdentityKeys,
      { device: 1n, inode: 1n },
      REPOSITORY_ROOT,
    );
    registerFilesystemDirectoryIdentity(
      registeredIdentityKeys,
      { device: 1n, inode: 2n },
      parseRepositoryPath('/first'),
    );

    expect(registeredIdentityKeys).toStrictEqual(new Set(['1:1', '1:2']));
    expectToThrowCode(
      () =>
        registerFilesystemDirectoryIdentity(
          registeredIdentityKeys,
          { device: 1n, inode: 1n },
          parseRepositoryPath('/alias'),
        ),
      'INVALID_SOURCE_DATA',
      'The repository source returned invalid data.',
    );
  });
});
