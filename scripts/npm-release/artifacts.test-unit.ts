// @vitest-environment node
import { createHash } from 'node:crypto';

import { describe, expect, test } from 'vitest';

import { createNpmReleaseChecksumManifest, parseNpmReleaseChecksumManifest } from './artifacts.ts';

const hash = (content: string): string => createHash('sha256').update(content).digest('hex');

describe('npm release artifacts', () => {
  test('creates sorted deterministic checksums for the exact artifact set', () => {
    const manifest = createNpmReleaseChecksumManifest(
      [
        { content: Buffer.from('repository'), fileName: 'repository.tgz' },
        { content: Buffer.from('cli'), fileName: 'cli.tgz' },
      ],
      ['cli.tgz', 'repository.tgz'],
    );

    expect(manifest).toBe(`${hash('cli')}  cli.tgz\n${hash('repository')}  repository.tgz\n`);
    expect(parseNpmReleaseChecksumManifest(manifest)).toStrictEqual([
      { fileName: 'cli.tgz', sha256: hash('cli') },
      { fileName: 'repository.tgz', sha256: hash('repository') },
    ]);
  });

  test.each([
    ['missing artifact', [{ content: Buffer.from('cli'), fileName: 'cli.tgz' }]],
    [
      'unexpected artifact',
      [
        { content: Buffer.from('cli'), fileName: 'cli.tgz' },
        { content: Buffer.from('extra'), fileName: 'extra.tgz' },
        { content: Buffer.from('repository'), fileName: 'repository.tgz' },
      ],
    ],
    [
      'duplicate artifact',
      [
        { content: Buffer.from('cli'), fileName: 'cli.tgz' },
        { content: Buffer.from('cli-copy'), fileName: 'cli.tgz' },
      ],
    ],
  ])('rejects an artifact set with a %s', (_description, artifacts) => {
    expect(() =>
      createNpmReleaseChecksumManifest(artifacts, ['cli.tgz', 'repository.tgz']),
    ).toThrow('artifact set is inconsistent');
  });

  test.each([
    ['empty manifest', ''],
    ['invalid separator', `${'a'.repeat(64)} cli.tgz\n`],
    ['nested path', `${'a'.repeat(64)}  nested/cli.tgz\n`],
    ['missing final newline', `${'a'.repeat(64)}  cli.tgz`],
  ])('rejects an %s', (_description, manifest) => {
    expect(() => parseNpmReleaseChecksumManifest(manifest)).toThrow('checksum manifest is invalid');
  });
});
