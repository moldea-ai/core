// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  normalizeGitInventoryLogicalPaths,
  validateGitInventoryCandidateLogicalPaths,
} from './normalizer.js';

describe('validateGitInventoryCandidateLogicalPaths', () => {
  test('validates every candidate while allowing repeated unmerged paths', () => {
    expect(
      validateGitInventoryCandidateLogicalPaths({
        candidates: [
          { kind: 'tracked', path: 'conflict' },
          { kind: 'tracked', path: 'conflict' },
          { kind: 'untracked', path: 'nested/😀.txt' },
          { kind: 'untracked', path: 'nested/worktree/' },
        ],
      }),
    ).toStrictEqual({ kind: 'validated' });
  });

  test('rejects one non-portable candidate before later exclusions', () => {
    expect(
      validateGitInventoryCandidateLogicalPaths({
        candidates: [
          { kind: 'untracked', path: 'ordinary.txt' },
          { kind: 'tracked', path: 'control\npath.txt' },
        ],
      }),
    ).toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
  });

  test.each([
    { kind: 'tracked' as const, path: 'tracked-directory/' },
    { kind: 'untracked' as const, path: 'empty//directory/' },
    { kind: 'untracked' as const, path: '/' },
  ])('rejects the malformed candidate record $path', (candidate) => {
    expect(validateGitInventoryCandidateLogicalPaths({ candidates: [candidate] })).toStrictEqual({
      errorCode: 'GIT_OUTPUT_INVALID',
      kind: 'failed',
    });
  });
});

describe('normalizeGitInventoryLogicalPaths', () => {
  test('brands, preserves, and code-point-sorts exact logical paths', () => {
    const result = normalizeGitInventoryLogicalPaths({
      entries: [
        { entryType: 'file', kind: 'untracked', path: '😀.txt', requiresSymlinkOverlay: false },
        {
          entryType: 'file',
          indexEntries: Object.freeze([
            Object.freeze({ mode: '100644' as const, stage: 0 as const }),
          ]),
          kind: 'tracked',
          path: '\ue000.txt',
          requiresSymlinkOverlay: false,
        },
        { entryType: 'file', kind: 'untracked', path: 'case.txt', requiresSymlinkOverlay: false },
        { entryType: 'file', kind: 'untracked', path: 'Case.txt', requiresSymlinkOverlay: false },
        { entryType: 'file', kind: 'untracked', path: 'café.txt', requiresSymlinkOverlay: false },
        {
          entryType: 'file',
          kind: 'untracked',
          path: 'cafe\u0301.txt',
          requiresSymlinkOverlay: false,
        },
        { entryType: 'file', kind: 'untracked', path: '\ufeff.txt', requiresSymlinkOverlay: false },
      ],
    });

    expect(result).toStrictEqual({
      entries: [
        { entryType: 'file', kind: 'untracked', path: '/Case.txt', requiresSymlinkOverlay: false },
        {
          entryType: 'file',
          kind: 'untracked',
          path: '/cafe\u0301.txt',
          requiresSymlinkOverlay: false,
        },
        { entryType: 'file', kind: 'untracked', path: '/café.txt', requiresSymlinkOverlay: false },
        { entryType: 'file', kind: 'untracked', path: '/case.txt', requiresSymlinkOverlay: false },
        {
          entryType: 'file',
          indexEntries: [{ mode: '100644', stage: 0 }],
          kind: 'tracked',
          path: '/\ue000.txt',
          requiresSymlinkOverlay: false,
        },
        {
          entryType: 'file',
          kind: 'untracked',
          path: '/\ufeff.txt',
          requiresSymlinkOverlay: false,
        },
        { entryType: 'file', kind: 'untracked', path: '/😀.txt', requiresSymlinkOverlay: false },
      ],
      kind: 'normalized',
    });
    expect(Object.isFrozen(result)).toBe(true);

    if (result.kind === 'normalized') {
      expect(Object.isFrozen(result.entries)).toBe(true);
      expect(result.entries.every(Object.isFrozen)).toBe(true);
    }
  });

  test.each([
    '',
    '/absolute',
    'empty//segment',
    './relative',
    'parent/../escape',
    'windows\\separator',
    'C:/drive-path',
    'control\ncharacter',
    'trailing/',
  ])('rejects the non-portable Git path %o atomically', (candidatePath) => {
    expect(
      normalizeGitInventoryLogicalPaths({
        entries: [
          {
            entryType: 'file',
            kind: 'untracked',
            path: candidatePath,
            requiresSymlinkOverlay: false,
          },
        ],
      }),
    ).toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
  });

  test('rejects duplicate logical paths instead of choosing one entry', () => {
    expect(
      normalizeGitInventoryLogicalPaths({
        entries: [
          { entryType: 'file', kind: 'untracked', path: 'same', requiresSymlinkOverlay: false },
          { entryType: 'symlink', kind: 'untracked', path: 'same', requiresSymlinkOverlay: false },
        ],
      }),
    ).toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
  });
});
