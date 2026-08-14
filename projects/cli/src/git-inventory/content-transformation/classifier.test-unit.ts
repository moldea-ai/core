// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import type {
  IGitStreamingProcessExecutor,
  IGitStreamingProcessFailureReason,
} from '../../git-process/index.js';

import { GIT_CONTENT_TRANSFORMATION_ARGUMENTS } from './constants.js';
import { createGitContentTransformationClassifier } from './classifier.js';

const ENCODER = new TextEncoder();

interface IProcessFixture {
  readonly failureReason?: IGitStreamingProcessFailureReason;
  readonly reportedStdoutBytes?: number;
  readonly stderr?: Uint8Array;
  readonly stdout?: Uint8Array;
}

/** Creates a streamed Git process boundary for one deterministic fixture. */
const createProcessExecutor = (fixture: IProcessFixture): IGitStreamingProcessExecutor =>
  vi.fn<IGitStreamingProcessExecutor>((options) => {
    if (fixture.failureReason !== undefined) {
      return Promise.resolve(Object.freeze({ kind: 'failed', reason: fixture.failureReason }));
    }

    const stdout = fixture.stdout ?? new Uint8Array();

    options.consumeStdout(stdout.subarray(0, 3));
    options.consumeStdout(stdout.subarray(3));

    return Promise.resolve(
      Object.freeze({
        kind: 'completed',
        stderr: fixture.stderr ?? new Uint8Array(),
        stdoutBytes: fixture.reportedStdoutBytes ?? stdout.byteLength,
      }),
    );
  });

/** Encodes the exact three `check-attr` records for one path. */
const encodeAttributes = (
  path: string,
  filter: string,
  workingTreeEncoding: string,
  ident: string,
): Uint8Array =>
  ENCODER.encode(
    `${path}\u0000filter\u0000${filter}\u0000${path}\u0000working-tree-encoding\u0000${workingTreeEncoding}\u0000${path}\u0000ident\u0000${ident}\u0000`,
  );

describe('createGitContentTransformationClassifier', () => {
  test('retains exact effective states and derives conservative immutable guards', async () => {
    const output = new Uint8Array([
      ...encodeAttributes('ordinary.txt', 'unspecified', 'unset', 'unspecified'),
      ...encodeAttributes('guarded.txt', 'lfs', 'unspecified', 'set'),
    ]);
    const processExecutor = createProcessExecutor({ stdout: output });
    const classify = createGitContentTransformationClassifier(processExecutor);
    const result = await classify({
      entries: [
        {
          entryType: 'file',
          kind: 'untracked',
          path: 'ordinary.txt',
          requiresSymlinkOverlay: false,
        },
        {
          entryType: 'file',
          indexEntries: [{ mode: '100644', stage: 0 }],
          kind: 'tracked',
          path: 'guarded.txt',
          requiresSymlinkOverlay: false,
        },
      ],
      maxMetadataBytes: output.byteLength,
      repositoryRoot: '/repository',
    });

    expect(result).toStrictEqual({
      entries: [
        {
          contentTransformation: {
            filter: 'unspecified',
            ident: 'unspecified',
            isGuarded: false,
            workingTreeEncoding: 'unset',
          },
          entryType: 'file',
          kind: 'untracked',
          path: 'ordinary.txt',
          requiresSymlinkOverlay: false,
        },
        {
          contentTransformation: {
            filter: 'lfs',
            ident: 'set',
            isGuarded: true,
            workingTreeEncoding: 'unspecified',
          },
          entryType: 'file',
          indexEntries: [{ mode: '100644', stage: 0 }],
          kind: 'tracked',
          path: 'guarded.txt',
          requiresSymlinkOverlay: false,
        },
      ],
      gitMetadataBytes: output.byteLength,
      kind: 'classified',
    });
    expect(Object.isFrozen(result)).toBe(true);

    if (result.kind === 'classified') {
      expect(Object.isFrozen(result.entries)).toBe(true);
      expect(
        result.entries.every(
          (entry) => Object.isFrozen(entry) && Object.isFrozen(entry.contentTransformation),
        ),
      ).toBe(true);
    }

    const processOptions = vi.mocked(processExecutor).mock.calls[0]?.[0];

    expect(processOptions?.arguments).toStrictEqual([
      '-C',
      '/repository',
      ...GIT_CONTENT_TRANSFORMATION_ARGUMENTS,
    ]);
    expect(processOptions?.maxStderrBytes).toBe(4096);
    expect(processOptions?.maxStdoutBytes).toBe(output.byteLength);
    expect(processOptions?.stdin).toStrictEqual(
      ENCODER.encode('ordinary.txt\u0000guarded.txt\u0000'),
    );
  });

  test('does not invoke Git for an empty effective inventory', async () => {
    const processExecutor = vi.fn<IGitStreamingProcessExecutor>();
    const classify = createGitContentTransformationClassifier(processExecutor);

    await expect(
      classify({ entries: [], maxMetadataBytes: 0, repositoryRoot: '/repository' }),
    ).resolves.toStrictEqual({ entries: [], gitMetadataBytes: 0, kind: 'classified' });
    expect(processExecutor).not.toHaveBeenCalled();
  });

  test.each([
    ['filter', 'private', 'unspecified', 'unspecified'],
    ['working-tree-encoding', 'unspecified', 'UTF-16LE', 'unspecified'],
    ['ident', 'unspecified', 'unspecified', 'set'],
  ] as const)(
    'guards an independently enabled %s attribute',
    async (_attribute, filter, workingTreeEncoding, ident) => {
      const output = encodeAttributes('guarded.txt', filter, workingTreeEncoding, ident);
      const classify = createGitContentTransformationClassifier(
        createProcessExecutor({ stdout: output }),
      );

      await expect(
        classify({
          entries: [
            {
              entryType: 'file',
              kind: 'untracked',
              path: 'guarded.txt',
              requiresSymlinkOverlay: false,
            },
          ],
          maxMetadataBytes: output.byteLength,
          repositoryRoot: '/repository',
        }),
      ).resolves.toMatchObject({
        entries: [{ contentTransformation: { isGuarded: true } }],
        kind: 'classified',
      });
    },
  );

  test.each([
    ['not-found', 'GIT_NOT_FOUND'],
    ['repository-not-found', 'GIT_REPOSITORY_NOT_FOUND'],
    ['access-denied', 'GIT_ACCESS_DENIED'],
    ['stderr-limit-exceeded', 'GIT_OUTPUT_INVALID'],
    ['output-limit-exceeded', 'RESOURCE_LIMIT_EXCEEDED'],
    ['stdout-limit-exceeded', 'RESOURCE_LIMIT_EXCEEDED'],
    ['command-failed', 'GIT_COMMAND_FAILED'],
  ] as const)('maps %s without exposing Git diagnostics', async (failureReason, errorCode) => {
    const classify = createGitContentTransformationClassifier(
      createProcessExecutor({ failureReason }),
    );

    await expect(
      classify({
        entries: [
          {
            entryType: 'file',
            kind: 'untracked',
            path: 'private.txt',
            requiresSymlinkOverlay: false,
          },
        ],
        maxMetadataBytes: 1,
        repositoryRoot: '/private',
      }),
    ).resolves.toStrictEqual({ errorCode, kind: 'failed' });
  });

  test('rejects stderr, parser failures, and process byte-count contradictions atomically', async () => {
    const entry = {
      entryType: 'file' as const,
      kind: 'untracked' as const,
      path: 'file.txt',
      requiresSymlinkOverlay: false as const,
    };
    const stderrClassifier = createGitContentTransformationClassifier(
      createProcessExecutor({
        stderr: ENCODER.encode('private warning'),
        stdout: encodeAttributes('file.txt', 'unspecified', 'unspecified', 'unspecified'),
      }),
    );

    await expect(
      stderrClassifier({ entries: [entry], maxMetadataBytes: 256, repositoryRoot: '/private' }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });

    const malformedClassifier = createGitContentTransformationClassifier(
      createProcessExecutor({ stdout: ENCODER.encode('file.txt\u0000filter\u0000') }),
    );

    await expect(
      malformedClassifier({ entries: [entry], maxMetadataBytes: 256, repositoryRoot: '/private' }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });

    const contradictoryClassifier = createGitContentTransformationClassifier(
      createProcessExecutor({
        reportedStdoutBytes: 1,
        stdout: encodeAttributes('file.txt', 'unspecified', 'unspecified', 'unspecified'),
      }),
    );

    await expect(
      contradictoryClassifier({
        entries: [entry],
        maxMetadataBytes: 256,
        repositoryRoot: '/private',
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
  });

  test('rejects an invalid remaining metadata budget before invoking Git', async () => {
    const processExecutor = vi.fn<IGitStreamingProcessExecutor>();
    const classify = createGitContentTransformationClassifier(processExecutor);

    await expect(
      classify({ entries: [], maxMetadataBytes: -1, repositoryRoot: '/repository' }),
    ).resolves.toStrictEqual({ errorCode: 'RESOURCE_LIMIT_EXCEEDED', kind: 'failed' });
    expect(processExecutor).not.toHaveBeenCalled();
  });
});
