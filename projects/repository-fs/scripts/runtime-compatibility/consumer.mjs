import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  REPOSITORY_ROOT,
  RepositorySourceException,
  parseRepositoryPath,
} from '@moldea.ai/repository';
import * as repositoryFilesystem from '@moldea.ai/repository-fs';

/** Collects one public reader listing without assuming an array-backed implementation. */
const collectEntries = async (entries) => {
  const collectedEntries = [];

  for await (const entry of entries) {
    collectedEntries.push(entry);
  }

  return collectedEntries;
};

assert.deepStrictEqual(Object.keys(repositoryFilesystem).sort(), [
  'DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS',
  'createFilesystemRepositoryReader',
]);
assert.deepStrictEqual(repositoryFilesystem.DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS, {
  maxCachedBytes: 134_217_728,
  maxEntries: 100_000,
  maxFileBytes: 8_388_608,
});
assert.equal(
  Object.isFrozen(repositoryFilesystem.DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS),
  true,
);

const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), 'moldea-repository-fs-runtime-fixture-'),
);
const rootDirectory = path.join(temporaryDirectory, 'repository');
const nestedDirectory = path.join(rootDirectory, 'nested');
const filePath = parseRepositoryPath('/nested/fixture.bin');
const fileBytes = Uint8Array.from([0x00, 0x7f, 0x80, 0xff]);

try {
  await mkdir(nestedDirectory, { recursive: true });
  await writeFile(path.join(nestedDirectory, 'fixture.bin'), fileBytes);

  const reader = await repositoryFilesystem.createFilesystemRepositoryReader({
    rootDirectory,
    selection: { kind: 'paths', paths: [filePath] },
  });

  assert.equal(Object.isFrozen(reader), true);
  assert.deepStrictEqual(Object.keys(reader).sort(), ['getEntry', 'listEntries', 'readFile']);
  assert.deepStrictEqual(await reader.getEntry(REPOSITORY_ROOT), {
    path: REPOSITORY_ROOT,
    type: 'directory',
  });
  assert.deepStrictEqual(await reader.getEntry(filePath), { path: filePath, type: 'file' });
  assert.deepStrictEqual(await collectEntries(reader.listEntries()), [
    { path: parseRepositoryPath('/nested'), type: 'directory' },
    { path: filePath, type: 'file' },
  ]);
  assert.deepStrictEqual(await reader.readFile(filePath), fileBytes);

  const missingRoot = path.join(temporaryDirectory, 'private-missing-root');
  let rejection;

  try {
    await repositoryFilesystem.createFilesystemRepositoryReader({
      rootDirectory: missingRoot,
      selection: { kind: 'directory' },
    });
  } catch (cause) {
    rejection = cause;
  }

  assert.equal(rejection instanceof RepositorySourceException, true);
  assert.equal(rejection.code, 'ENTRY_NOT_FOUND');
  assert.equal(rejection.message, 'The requested repository entry was not found.');
  assert.equal(rejection.operation, 'create-reader');
  assert.equal(rejection.path, null);
  assert.equal(rejection.retryable, true);
  assert.equal(Object.keys(rejection).includes('cause'), false);
  assert.equal(JSON.stringify(rejection).includes(JSON.stringify(missingRoot).slice(1, -1)), false);
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
