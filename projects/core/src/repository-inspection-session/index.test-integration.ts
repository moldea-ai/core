// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath, type IRepositoryReader } from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

import { discoverCanonicalAssets } from '../canonical-discovery/index.js';
import { DEFAULT_CORE_RESOURCE_LIMITS } from '../constants/index.js';
import { readRepositoryTextAsset } from '../repository-text/index.js';

import { createRepositoryInspectionSession } from './index.js';

const MOLDEA_PATH = parseRepositoryPath('/moldea');
const MANIFEST_PATH = parseRepositoryPath('/moldea/moldea.yaml');
const PROJECT_PATH = parseRepositoryPath('/moldea/project.md');
const CONTEXT_PATH = parseRepositoryPath('/moldea/context/shared.md');

const createFixtureReader = (): IRepositoryReader => {
  return createMemoryRepositoryReader([
    { content: 'version: 1\n', path: MANIFEST_PATH, type: 'file' },
    {
      content: new TextEncoder().encode('\ufeffProject context\r\n'),
      path: PROJECT_PATH,
      type: 'file',
    },
    { content: '# Shared context\n', path: CONTEXT_PATH, type: 'file' },
  ]);
};

describe('repository inspection session with the memory reader', () => {
  test('composes canonical discovery and isolated text reads through one session', async () => {
    const repository = createFixtureReader();
    let projectReadCount = 0;
    const observedRepository: IRepositoryReader = {
      getEntry: (path, options) => repository.getEntry(path, options),
      listEntries: (options) => repository.listEntries(options),
      readFile: (path, options) => {
        if (path === PROJECT_PATH) {
          projectReadCount += 1;
        }

        return repository.readFile(path, options);
      },
    };
    const session = createRepositoryInspectionSession(
      observedRepository,
      DEFAULT_CORE_RESOURCE_LIMITS,
    );
    const discovery = await discoverCanonicalAssets(session.reader, DEFAULT_CORE_RESOURCE_LIMITS);

    expect(discovery).toMatchObject({
      diagnostics: [],
      inventory: {
        context: [CONTEXT_PATH],
        manifest: MANIFEST_PATH,
        project: PROJECT_PATH,
      },
      valid: true,
    });

    const callerBytes = await session.reader.readFile(PROJECT_PATH);
    callerBytes.fill(0);
    const firstText = await readRepositoryTextAsset(
      session.reader,
      PROJECT_PATH,
      DEFAULT_CORE_RESOURCE_LIMITS,
    );
    const secondText = await readRepositoryTextAsset(
      session.reader,
      PROJECT_PATH,
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(firstText).toMatchObject({
      asset: {
        content: 'Project context\n',
        path: PROJECT_PATH,
        scalarLength: 16,
        utf8ByteLength: 16,
      },
      diagnostics: [],
      valid: true,
    });
    expect(secondText).toStrictEqual(firstText);
    expect(projectReadCount).toBe(1);
  });

  test('enforces the shared listing budget against memory-reader yields', async () => {
    const session = createRepositoryInspectionSession(createFixtureReader(), {
      ...DEFAULT_CORE_RESOURCE_LIMITS,
      maxEntries: 2,
    });

    await expect(
      discoverCanonicalAssets(session.reader, DEFAULT_CORE_RESOURCE_LIMITS),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxEntries',
      operation: 'inspect-project',
      retryable: false,
    });
  });

  test('preserves memory-reader source failures through the session boundary', async () => {
    const session = createRepositoryInspectionSession(
      createFixtureReader(),
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    await expect(session.reader.readFile(MOLDEA_PATH)).rejects.toMatchObject({
      code: 'ENTRY_NOT_FILE',
      operation: 'read-file',
      path: MOLDEA_PATH,
      retryable: false,
    });
  });
});
