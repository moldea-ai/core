// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath, type IRepositoryEntry } from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

import { createGitSymlinkOverlayRepositoryReader } from './reader.js';

describe('Git symlink overlay with the memory repository reader', () => {
  test('preserves one coherent logical symlink view without exposing host-file bytes', async () => {
    const linkPath = parseRepositoryPath('/moldea/link');
    const ordinaryPath = parseRepositoryPath('/moldea/ordinary.txt');
    const underlyingReader = createMemoryRepositoryReader([
      { content: '../target', path: linkPath, type: 'file' },
      { content: 'ordinary', path: ordinaryPath, type: 'file' },
    ]);
    const reader = createGitSymlinkOverlayRepositoryReader(underlyingReader, [linkPath]);

    await expect(reader.getEntry(linkPath)).resolves.toStrictEqual({
      path: linkPath,
      type: 'symlink',
    });
    await expect(reader.readFile(linkPath)).rejects.toMatchObject({
      code: 'ENTRY_NOT_FILE',
      operation: 'read-file',
      path: linkPath,
      retryable: false,
    });

    const entries: IRepositoryEntry[] = [];

    for await (const entry of reader.listEntries()) {
      entries.push(entry);
    }

    expect(entries).toStrictEqual([
      { path: parseRepositoryPath('/moldea'), type: 'directory' },
      { path: linkPath, type: 'symlink' },
      { path: ordinaryPath, type: 'file' },
    ]);
    await expect(reader.readFile(ordinaryPath)).resolves.toStrictEqual(
      new TextEncoder().encode('ordinary'),
    );
    await expect(underlyingReader.readFile(linkPath)).resolves.toStrictEqual(
      new TextEncoder().encode('../target'),
    );
  });
});
