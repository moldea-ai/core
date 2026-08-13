// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import type {
  IGitStreamingProcessExecutor,
  IGitStreamingProcessFailureReason,
} from '../git-process/index.js';

import { GIT_TRACKED_INVENTORY_ARGUMENTS, GIT_UNTRACKED_INVENTORY_ARGUMENTS } from './constants.js';
import type { IGitInventoryEntryTypeNormalizer } from './entry-type/index.js';
import { createGitInventoryProbe } from './probe.js';
import type { IGitInventoryOwnershipFilter } from './repository-ownership/index.js';

const ENCODER = new TextEncoder();
const OBJECT_ID = '0123456789abcdef0123456789abcdef01234567';

interface IProcessFixture {
  readonly failureReason?: IGitStreamingProcessFailureReason;
  readonly stderr?: Uint8Array;
  readonly stdout?: Uint8Array;
}

/** Creates an executor that streams deterministic fixtures through the real parser callbacks. */
const createProcessExecutor = (
  fixtures: readonly IProcessFixture[],
): IGitStreamingProcessExecutor => {
  let fixtureIndex = 0;

  return vi.fn<IGitStreamingProcessExecutor>((options) => {
    const fixture = fixtures[fixtureIndex];

    fixtureIndex += 1;

    if (fixture === undefined) {
      throw new Error('The process fixture is unavailable.');
    }

    if (fixture.failureReason !== undefined) {
      return Promise.resolve(Object.freeze({ kind: 'failed', reason: fixture.failureReason }));
    }

    const stdout = fixture.stdout ?? new Uint8Array();

    options.consumeStdout(stdout.subarray(0, 2));
    options.consumeStdout(stdout.subarray(2));

    return Promise.resolve(
      Object.freeze({
        kind: 'completed',
        stderr: fixture.stderr ?? new Uint8Array(),
        stdoutBytes: stdout.byteLength,
      }),
    );
  });
};

describe('createGitInventoryProbe', () => {
  test('streams tracked and untracked candidates under one combined budget', async () => {
    const trackedOutput = ENCODER.encode(
      `100644 ${OBJECT_ID} 0\ttracked\u0000100755 ${OBJECT_ID} 2\tconflict\u0000`,
    );
    const untrackedOutput = ENCODER.encode('untracked\u0000');
    const processExecutor = createProcessExecutor([
      { stdout: trackedOutput },
      { stdout: untrackedOutput },
    ]);
    const ownershipFilter = vi.fn<IGitInventoryOwnershipFilter>((input) =>
      Promise.resolve(
        Object.freeze({
          candidates: input.candidates,
          gitMetadataBytes: 7,
          kind: 'filtered',
        }),
      ),
    );
    const entryTypeNormalizer = vi.fn<IGitInventoryEntryTypeNormalizer>().mockResolvedValue(
      Object.freeze({
        entries: Object.freeze([
          Object.freeze({
            entryType: 'file',
            indexEntries: Object.freeze([Object.freeze({ mode: '100644', stage: 0 as const })]),
            kind: 'tracked',
            path: 'tracked',
            requiresSymlinkOverlay: false,
          }),
          Object.freeze({
            entryType: 'file',
            indexEntries: Object.freeze([Object.freeze({ mode: '100755', stage: 2 as const })]),
            kind: 'tracked',
            path: 'conflict',
            requiresSymlinkOverlay: false,
          }),
          Object.freeze({
            entryType: 'file',
            kind: 'untracked',
            path: 'untracked',
            requiresSymlinkOverlay: false,
          }),
        ]),
        gitMetadataBytes: 0,
        kind: 'normalized',
      }),
    );
    const probe = createGitInventoryProbe(processExecutor, ownershipFilter, entryTypeNormalizer);
    const result = await probe({
      maxEntries: 3,
      maxMetadataBytes: 512,
      repositoryRoot: '/repository',
    });

    expect(result).toStrictEqual({
      entries: [
        {
          entryType: 'file',
          indexEntries: [{ mode: '100644', stage: 0 }],
          kind: 'tracked',
          path: 'tracked',
          requiresSymlinkOverlay: false,
        },
        {
          entryType: 'file',
          indexEntries: [{ mode: '100755', stage: 2 }],
          kind: 'tracked',
          path: 'conflict',
          requiresSymlinkOverlay: false,
        },
        {
          entryType: 'file',
          kind: 'untracked',
          path: 'untracked',
          requiresSymlinkOverlay: false,
        },
      ],
      kind: 'probed',
    });
    expect(Object.isFrozen(result)).toBe(true);

    if (result.kind === 'probed') {
      expect(Object.isFrozen(result.entries)).toBe(true);
    }

    const processCalls = vi.mocked(processExecutor).mock.calls;

    expect(processCalls[0]?.[0].arguments).toStrictEqual([
      '-C',
      '/repository',
      ...GIT_TRACKED_INVENTORY_ARGUMENTS,
    ]);
    expect(processCalls[0]?.[0].maxStderrBytes).toBe(4096);
    expect(processCalls[0]?.[0].maxStdoutBytes).toBe(512);
    expect(typeof processCalls[0]?.[0].consumeStdout).toBe('function');
    expect(processCalls[1]?.[0].arguments).toStrictEqual([
      '-C',
      '/repository',
      ...GIT_UNTRACKED_INVENTORY_ARGUMENTS,
    ]);
    expect(processCalls[1]?.[0].maxStderrBytes).toBe(4096);
    expect(processCalls[1]?.[0].maxStdoutBytes).toBe(512 - trackedOutput.byteLength);
    expect(typeof processCalls[1]?.[0].consumeStdout).toBe('function');
    expect(ownershipFilter).toHaveBeenCalledOnce();
    expect(ownershipFilter).toHaveBeenCalledWith({
      candidates: [
        { kind: 'tracked', mode: '100644', path: 'tracked', stage: 0 },
        { kind: 'tracked', mode: '100755', path: 'conflict', stage: 2 },
        { kind: 'untracked', path: 'untracked' },
      ],
      maxMetadataBytes: 512 - trackedOutput.byteLength - untrackedOutput.byteLength,
      repositoryRoot: '/repository',
    });
    expect(entryTypeNormalizer).toHaveBeenCalledOnce();
    expect(entryTypeNormalizer).toHaveBeenCalledWith({
      candidates: [
        { kind: 'tracked', mode: '100644', path: 'tracked', stage: 0 },
        { kind: 'tracked', mode: '100755', path: 'conflict', stage: 2 },
        { kind: 'untracked', path: 'untracked' },
      ],
      maxMetadataBytes: 512 - trackedOutput.byteLength - untrackedOutput.byteLength - 7,
      repositoryRoot: '/repository',
    });
  });

  test('enforces the combined entry limit before stage collapse or deduplication', async () => {
    const processExecutor = createProcessExecutor([
      {
        stdout: ENCODER.encode(
          `100644 ${OBJECT_ID} 1\tconflict\u0000100644 ${OBJECT_ID} 2\tconflict\u0000`,
        ),
      },
      { stdout: ENCODER.encode('untracked\u0000') },
    ]);
    const probe = createGitInventoryProbe(processExecutor);

    await expect(
      probe({ maxEntries: 2, maxMetadataBytes: 1024, repositoryRoot: '/repository' }),
    ).resolves.toStrictEqual({ errorCode: 'RESOURCE_LIMIT_EXCEEDED', kind: 'failed' });
  });

  test.each([
    ['not-found', 'GIT_NOT_FOUND'],
    ['repository-not-found', 'GIT_REPOSITORY_NOT_FOUND'],
    ['access-denied', 'GIT_ACCESS_DENIED'],
    ['stderr-limit-exceeded', 'GIT_OUTPUT_INVALID'],
    ['output-limit-exceeded', 'RESOURCE_LIMIT_EXCEEDED'],
    ['stdout-limit-exceeded', 'RESOURCE_LIMIT_EXCEEDED'],
    ['command-failed', 'GIT_COMMAND_FAILED'],
  ] as const)('maps %s without exposing Git diagnostics', async (failureReason, errorCode) => {
    const probe = createGitInventoryProbe(createProcessExecutor([{ failureReason }]));

    await expect(
      probe({ maxEntries: 1, maxMetadataBytes: 1, repositoryRoot: '/private' }),
    ).resolves.toStrictEqual({ errorCode, kind: 'failed' });
  });

  test('rejects successful stderr and malformed output without partial candidates', async () => {
    const stderrProbe = createGitInventoryProbe(
      createProcessExecutor([{ stderr: ENCODER.encode('private warning') }]),
    );

    await expect(
      stderrProbe({ maxEntries: 1, maxMetadataBytes: 32, repositoryRoot: '/private' }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });

    const malformedProbe = createGitInventoryProbe(
      createProcessExecutor([{ stdout: ENCODER.encode('malformed\u0000') }]),
    );

    await expect(
      malformedProbe({ maxEntries: 1, maxMetadataBytes: 32, repositoryRoot: '/private' }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
  });

  test('returns an atomic ownership failure after both raw streams complete', async () => {
    const processExecutor = createProcessExecutor([
      { stdout: ENCODER.encode(`100644 ${OBJECT_ID} 0\ttracked\u0000`) },
      { stdout: ENCODER.encode('nested/untracked\u0000') },
    ]);
    const ownershipFilter = vi
      .fn<IGitInventoryOwnershipFilter>()
      .mockResolvedValue(Object.freeze({ errorCode: 'GIT_ACCESS_DENIED', kind: 'failed' }));
    const probe = createGitInventoryProbe(processExecutor, ownershipFilter);

    await expect(
      probe({ maxEntries: 2, maxMetadataBytes: 1024, repositoryRoot: '/private' }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_ACCESS_DENIED', kind: 'failed' });
    expect(ownershipFilter).toHaveBeenCalledOnce();
  });

  test('returns an atomic entry-type failure without exposing partial entries', async () => {
    const processExecutor = createProcessExecutor([
      { stdout: ENCODER.encode(`120000 ${OBJECT_ID} 0\tlink\u0000`) },
      { stdout: new Uint8Array() },
    ]);
    const ownershipFilter = vi.fn<IGitInventoryOwnershipFilter>((input) =>
      Promise.resolve(
        Object.freeze({ candidates: input.candidates, gitMetadataBytes: 0, kind: 'filtered' }),
      ),
    );
    const entryTypeNormalizer = vi
      .fn<IGitInventoryEntryTypeNormalizer>()
      .mockResolvedValue(Object.freeze({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' }));
    const probe = createGitInventoryProbe(processExecutor, ownershipFilter, entryTypeNormalizer);

    await expect(
      probe({ maxEntries: 1, maxMetadataBytes: 128, repositoryRoot: '/repository' }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
    expect(entryTypeNormalizer).toHaveBeenCalledOnce();
  });
});
