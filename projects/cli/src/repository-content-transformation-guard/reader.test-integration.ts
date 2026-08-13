// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath, type IRepositoryEntry } from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

import { createGitSymlinkOverlayRepositoryReader } from '../repository-symlink-overlay/index.js';

import { createGitContentTransformationGuardRepositoryReader } from './reader.js';

describe('Git content-transformation guard with logical repository overlays', () => {
  test('guards only logical regular files after native and materialized symlink classification', async () => {
    const guardedPath = parseRepositoryPath('/moldea/guarded.txt');
    const materializedLinkPath = parseRepositoryPath('/moldea/materialized-link');
    const nativeLinkPath = parseRepositoryPath('/moldea/native-link');
    const ordinaryPath = parseRepositoryPath('/moldea/ordinary.txt');
    const memoryReader = createMemoryRepositoryReader([
      { content: 'guarded bytes', path: guardedPath, type: 'file' },
      { content: '../target', path: materializedLinkPath, type: 'file' },
      { path: nativeLinkPath, type: 'symlink' },
      { content: 'ordinary bytes', path: ordinaryPath, type: 'file' },
    ]);
    const overlaidReader = createGitSymlinkOverlayRepositoryReader(memoryReader, [
      materializedLinkPath,
    ]);
    const reader = createGitContentTransformationGuardRepositoryReader(overlaidReader, [
      guardedPath,
      materializedLinkPath,
      nativeLinkPath,
    ]);

    const entries: IRepositoryEntry[] = [];

    for await (const entry of reader.listEntries()) {
      entries.push(entry);
    }

    expect(entries).toContainEqual({ path: guardedPath, type: 'file' });
    expect(entries).toContainEqual({ path: materializedLinkPath, type: 'symlink' });
    expect(entries).toContainEqual({ path: nativeLinkPath, type: 'symlink' });
    await expect(reader.readFile(guardedPath)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
      operation: 'read-file',
      path: guardedPath,
      retryable: false,
    });
    await expect(reader.readFile(materializedLinkPath)).rejects.toMatchObject({
      code: 'ENTRY_NOT_FILE',
      path: materializedLinkPath,
    });
    await expect(reader.readFile(nativeLinkPath)).rejects.toMatchObject({
      code: 'ENTRY_NOT_FILE',
      path: nativeLinkPath,
    });
    await expect(reader.readFile(ordinaryPath)).resolves.toStrictEqual(
      new TextEncoder().encode('ordinary bytes'),
    );
  });
});
