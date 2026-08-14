// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { planGitInventoryOwnershipPath } from './path-planner.js';

describe('planGitInventoryOwnershipPath', () => {
  test('preserves exact raw segments and derives file directory prefixes', () => {
    const candidate = Object.freeze({
      kind: 'untracked' as const,
      path: '\ufeffDirectory/e\u0301/Name\t\n😀.txt',
    });

    const result = planGitInventoryOwnershipPath(candidate);

    expect(result).toStrictEqual({
      kind: 'planned',
      plan: {
        candidate,
        directorySegments: ['\ufeffDirectory', 'e\u0301'],
        hasGitControlSegment: false,
        isDirectoryRecord: false,
        segments: ['\ufeffDirectory', 'e\u0301', 'Name\t\n😀.txt'],
      },
    });
    expect(Object.isFrozen(result)).toBe(true);

    if (result.kind === 'planned') {
      expect(Object.isFrozen(result.plan)).toBe(true);
      expect(Object.isFrozen(result.plan.segments)).toBe(true);
      expect(Object.isFrozen(result.plan.directorySegments)).toBe(true);
    }
  });

  test('accepts an untracked nested-directory record and includes its final segment', () => {
    expect(
      planGitInventoryOwnershipPath({ kind: 'untracked', path: 'nested/worktree/' }),
    ).toStrictEqual({
      kind: 'planned',
      plan: {
        candidate: { kind: 'untracked', path: 'nested/worktree/' },
        directorySegments: ['nested', 'worktree'],
        hasGitControlSegment: false,
        isDirectoryRecord: true,
        segments: ['nested', 'worktree'],
      },
    });
  });

  test.each([
    { kind: 'untracked' as const, path: '' },
    { kind: 'untracked' as const, path: '/absolute' },
    { kind: 'untracked' as const, path: 'empty//segment' },
    { kind: 'untracked' as const, path: './relative' },
    { kind: 'untracked' as const, path: 'parent/../escape' },
    { kind: 'untracked' as const, path: 'windows\\separator' },
    { kind: 'tracked' as const, mode: '100644' as const, path: 'directory/', stage: 0 as const },
  ])('rejects an unsafe raw path before host access: $path', (candidate) => {
    expect(planGitInventoryOwnershipPath(candidate)).toStrictEqual({ kind: 'failed' });
  });

  test.each(['.git', '.git/config', 'nested/.git/index'])(
    'marks the exact Git control segment in %s',
    (candidatePath) => {
      const result = planGitInventoryOwnershipPath({ kind: 'untracked', path: candidatePath });

      expect(result.kind).toBe('planned');

      if (result.kind === 'planned') {
        expect(result.plan.hasGitControlSegment).toBe(true);
      }
    },
  );

  test.each(['.github/workflow.yml', '.gitignore', '.gitattributes', 'nested/.git-data'])(
    'does not treat a similar ordinary name as Git control data: %s',
    (candidatePath) => {
      const result = planGitInventoryOwnershipPath({ kind: 'untracked', path: candidatePath });

      expect(result.kind).toBe('planned');

      if (result.kind === 'planned') {
        expect(result.plan.hasGitControlSegment).toBe(false);
      }
    },
  );
});
