// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import type { IInspectedAgentAssets } from './agent-assets.js';
import { DEFAULT_CORE_RESOURCE_LIMITS } from './constants.js';
import type { IContentDigest, IIndexedTextAsset } from './contracts.js';
import type { ICoreDiagnostic } from './diagnostics.js';
import { countUnicodeScalars } from './format-validation.js';
import { inspectMirrors } from './mirrors.js';
import { normalizeCoreOptions } from './options.js';

const MANIFEST_PATH = parseRepositoryPath('/moldea/moldea.yaml');
const options = normalizeCoreOptions(undefined);

interface IReaderFixture {
  readonly entryPaths: IRepositoryPath[];
  readonly readPaths: IRepositoryPath[];
  readonly reader: IRepositoryReader;
}

const createEmptyEntryIterable = (): AsyncIterable<IRepositoryEntry> => ({
  [Symbol.asyncIterator]: () => ({
    next: () => Promise.resolve({ done: true, value: undefined }),
  }),
});

const createInstruction = (
  agentId: string,
  content: string,
  digest = `sha256:${agentId}` as IContentDigest,
): IIndexedTextAsset => ({
  content,
  digest,
  path: parseRepositoryPath(`/moldea/agents/${agentId}/instruction.md`),
  scalarLength: countUnicodeScalars(content),
  utf8ByteLength: new TextEncoder().encode(content).byteLength,
});

const createAgent = (
  id: string,
  mirrors: readonly IRepositoryPath[],
  instruction: IIndexedTextAsset | null = createInstruction(id, `You are the \`${id}\` agent.\n`),
): IInspectedAgentAssets => ({
  declaration: { framework: { id: 'custom' }, mirrors },
  description: null,
  handoffDescription: null,
  id,
  instruction,
});

const createReaderFixture = (
  entries: ReadonlyMap<IRepositoryPath, IRepositoryEntry>,
  contents: ReadonlyMap<IRepositoryPath, Uint8Array>,
): IReaderFixture => {
  const entryPaths: IRepositoryPath[] = [];
  const readPaths: IRepositoryPath[] = [];

  return {
    entryPaths,
    readPaths,
    reader: {
      getEntry: (path) => {
        entryPaths.push(path);
        return Promise.resolve(entries.get(path) ?? null);
      },
      listEntries: () => createEmptyEntryIterable(),
      readFile: (path) => {
        readPaths.push(path);
        const content = contents.get(path);

        if (content === undefined) {
          throw new TypeError(`No test content exists for ${path}.`);
        }

        return Promise.resolve(new Uint8Array(content));
      },
    },
  };
};

const simplifyDiagnostics = (diagnostics: readonly ICoreDiagnostic[]) => {
  return diagnostics.map(({ code, details, entity, message, path, pointer, range }) => ({
    code,
    details: { ...details },
    entity: entity === null ? null : { ...entity },
    message,
    path,
    pointer,
    range,
  }));
};

describe('Core mirror inspection', () => {
  test('normalizes matching mirrors, sorts output, and compares content rather than digests', async () => {
    const alphaFirstPath = parseRepositoryPath('/mirrors/alpha-a.md');
    const alphaSecondPath = parseRepositoryPath('/mirrors/alpha-b.md');
    const zetaPath = parseRepositoryPath('/mirrors/zeta.md');
    const alphaContent = 'You are the `alpha` agent.\n';
    const zetaContent = 'You are the `zeta` agent.\n';
    const entries = new Map<IRepositoryPath, IRepositoryEntry>([
      [alphaFirstPath, { path: alphaFirstPath, type: 'file' }],
      [alphaSecondPath, { path: alphaSecondPath, type: 'file' }],
      [zetaPath, { path: zetaPath, type: 'file' }],
    ]);
    const contents = new Map<IRepositoryPath, Uint8Array>([
      [alphaFirstPath, new TextEncoder().encode(`\ufeff${alphaContent.replaceAll('\n', '\r')}`)],
      [alphaSecondPath, new TextEncoder().encode(alphaContent.replaceAll('\n', '\r\n'))],
      [zetaPath, new TextEncoder().encode(zetaContent)],
    ]);
    const fixture = createReaderFixture(entries, contents);
    const alphaDigest = 'sha256:canonical-alpha' as IContentDigest;
    const result = await inspectMirrors(
      fixture.reader,
      MANIFEST_PATH,
      [
        createAgent('zeta', [zetaPath]),
        createAgent(
          'alpha',
          [alphaSecondPath, alphaFirstPath],
          createInstruction('alpha', alphaContent, alphaDigest),
        ),
      ],
      options,
    );

    expect(result.agentMirrors.map(({ id }) => id)).toStrictEqual(['alpha', 'zeta']);
    expect(result.agentMirrors[0]?.mirrors.map(({ path }) => path)).toStrictEqual([
      alphaFirstPath,
      alphaSecondPath,
    ]);
    expect(result.agentMirrors[0]?.mirrors[0]).toMatchObject({
      canonicalDigest: alphaDigest,
      path: alphaFirstPath,
    });
    expect(result.agentMirrors[0]?.mirrors[0]?.digest).not.toBe(alphaDigest);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.valid).toBe(true);
    expect(fixture.entryPaths).toStrictEqual([alphaFirstPath, alphaSecondPath, zetaPath]);
    expect(fixture.readPaths).toStrictEqual([alphaFirstPath, alphaSecondPath, zetaPath]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.agentMirrors)).toBe(true);
    expect(Object.isFrozen(result.agentMirrors[0]?.mirrors[0])).toBe(true);
  });

  test('emits exact missing, directory, symlink, and stale diagnostics without invalid records', async () => {
    const missingPath = parseRepositoryPath('/mirrors/a-missing.md');
    const directoryPath = parseRepositoryPath('/mirrors/b-directory');
    const symlinkPath = parseRepositoryPath('/mirrors/c-link.md');
    const stalePath = parseRepositoryPath('/mirrors/d-stale.md');
    const entries = new Map<IRepositoryPath, IRepositoryEntry>([
      [directoryPath, { path: directoryPath, type: 'directory' }],
      [symlinkPath, { path: symlinkPath, type: 'symlink' }],
      [stalePath, { path: stalePath, type: 'file' }],
    ]);
    const fixture = createReaderFixture(
      entries,
      new Map([[stalePath, new TextEncoder().encode('Stale mirror.\n')]]),
    );
    const result = await inspectMirrors(
      fixture.reader,
      MANIFEST_PATH,
      [createAgent('alpha', [symlinkPath, stalePath, missingPath, directoryPath])],
      options,
    );

    expect(simplifyDiagnostics(result.diagnostics)).toStrictEqual([
      {
        code: 'MOLDEA_MIRROR_MISSING',
        details: { mirrorPath: missingPath },
        entity: { agentId: 'alpha' },
        message: 'The declared mirror does not exist.',
        path: MANIFEST_PATH,
        pointer: '/agents/alpha/mirrors/0',
        range: null,
      },
      {
        code: 'MOLDEA_MIRROR_NOT_FILE',
        details: { actualType: 'directory', mirrorPath: directoryPath },
        entity: { agentId: 'alpha' },
        message: 'The declared mirror is not a regular file.',
        path: MANIFEST_PATH,
        pointer: '/agents/alpha/mirrors/1',
        range: null,
      },
      {
        code: 'MOLDEA_MIRROR_SYMLINK',
        details: { actualType: 'symlink', mirrorPath: symlinkPath },
        entity: { agentId: 'alpha' },
        message: 'The declared mirror is a symlink.',
        path: MANIFEST_PATH,
        pointer: '/agents/alpha/mirrors/2',
        range: null,
      },
      {
        code: 'MOLDEA_MIRROR_STALE',
        details: { mirrorPath: stalePath },
        entity: { agentId: 'alpha' },
        message: 'The declared mirror differs from its canonical instruction.',
        path: MANIFEST_PATH,
        pointer: '/agents/alpha/mirrors/3',
        range: null,
      },
    ]);
    expect(result.agentMirrors).toStrictEqual([{ id: 'alpha', mirrors: [] }]);
    expect(result.valid).toBe(false);
    expect(fixture.entryPaths).toStrictEqual([missingPath, directoryPath, symlinkPath, stalePath]);
    expect(fixture.readPaths).toStrictEqual([stalePath]);
  });

  test('retains strict text diagnostics without adding a stale cascade', async () => {
    const invalidPath = parseRepositoryPath('/mirrors/invalid.md');
    const fixture = createReaderFixture(
      new Map([[invalidPath, { path: invalidPath, type: 'file' }]]),
      new Map([[invalidPath, Uint8Array.from([0xff])]]),
    );
    const result = await inspectMirrors(
      fixture.reader,
      MANIFEST_PATH,
      [createAgent('alpha', [invalidPath])],
      options,
    );

    expect(simplifyDiagnostics(result.diagnostics)).toStrictEqual([
      {
        code: 'MOLDEA_TEXT_INVALID_UTF8',
        details: {},
        entity: null,
        message: 'The text document is not valid UTF-8.',
        path: invalidPath,
        pointer: null,
        range: null,
      },
    ]);
    expect(result.agentMirrors).toStrictEqual([{ id: 'alpha', mirrors: [] }]);
  });

  test('does not inspect declared mirrors when the canonical instruction is unavailable', async () => {
    const mirrorPath = parseRepositoryPath('/mirrors/skipped.md');
    const fixture = createReaderFixture(new Map(), new Map());
    const result = await inspectMirrors(
      fixture.reader,
      MANIFEST_PATH,
      [createAgent('alpha', [mirrorPath], null), createAgent('beta', [], null)],
      options,
    );

    expect(result).toStrictEqual({
      agentMirrors: [
        { id: 'alpha', mirrors: [] },
        { id: 'beta', mirrors: [] },
      ],
      diagnostics: [],
      valid: true,
    });
    expect(fixture.entryPaths).toStrictEqual([]);
    expect(fixture.readPaths).toStrictEqual([]);
  });

  test('forwards cancellation and preserves repository exceptions unchanged', async () => {
    const mirrorPath = parseRepositoryPath('/mirrors/failing.md');
    const sourceError = new RepositorySourceException({
      code: 'SOURCE_UNAVAILABLE',
      operation: 'get-entry',
      path: mirrorPath,
      retryable: true,
    });
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const repository: IRepositoryReader = {
      getEntry: (_path, operationOptions) => {
        receivedSignal = operationOptions?.signal;
        return Promise.reject(sourceError);
      },
      listEntries: () => createEmptyEntryIterable(),
      readFile: () => Promise.resolve(new Uint8Array()),
    };
    const inspection = inspectMirrors(
      repository,
      MANIFEST_PATH,
      [createAgent('alpha', [mirrorPath])],
      options,
      controller.signal,
    );

    await expect(inspection).rejects.toBe(sourceError);
    expect(receivedSignal).toBe(controller.signal);
  });

  test('attributes diagnostic budget exhaustion to repository inspection', async () => {
    const firstPath = parseRepositoryPath('/mirrors/first.md');
    const secondPath = parseRepositoryPath('/mirrors/second.md');
    const fixture = createReaderFixture(new Map(), new Map());
    const inspection = inspectMirrors(
      fixture.reader,
      MANIFEST_PATH,
      [createAgent('alpha', [secondPath, firstPath])],
      {
        ...options,
        limits: { ...DEFAULT_CORE_RESOURCE_LIMITS, maxDiagnostics: 1 },
      },
    );

    await expect(inspection).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxDiagnostics',
      operation: 'inspect-project',
      retryable: false,
    });
  });
});
