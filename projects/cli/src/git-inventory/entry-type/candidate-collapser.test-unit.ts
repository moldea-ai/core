// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { collapseGitInventoryCandidates } from './candidate-collapser.js';

describe('collapseGitInventoryCandidates', () => {
  test('collapses index stages by first path appearance and numeric stage order', () => {
    const result = collapseGitInventoryCandidates([
      { kind: 'tracked', mode: '120000', path: 'conflict', stage: 3 },
      { kind: 'untracked', path: 'ordinary.txt' },
      { kind: 'tracked', mode: '100644', path: 'conflict', stage: 1 },
      { kind: 'tracked', mode: '100755', path: 'conflict', stage: 2 },
    ]);

    expect(result).toStrictEqual({
      candidates: [
        {
          indexEntries: [
            { mode: '100644', stage: 1 },
            { mode: '100755', stage: 2 },
            { mode: '120000', stage: 3 },
          ],
          kind: 'tracked',
          path: 'conflict',
        },
        { kind: 'untracked', path: 'ordinary.txt' },
      ],
      kind: 'collapsed',
    });
    expect(Object.isFrozen(result)).toBe(true);

    if (result.kind === 'collapsed') {
      expect(Object.isFrozen(result.candidates)).toBe(true);
      expect(result.candidates.every(Object.isFrozen)).toBe(true);

      const trackedCandidate = result.candidates[0];

      if (trackedCandidate?.kind === 'tracked') {
        expect(Object.isFrozen(trackedCandidate.indexEntries)).toBe(true);
        expect(trackedCandidate.indexEntries.every(Object.isFrozen)).toBe(true);
      }
    }
  });

  test.each([
    [
      'tracked and untracked collision',
      [
        { kind: 'tracked', mode: '100644', path: 'same', stage: 0 },
        { kind: 'untracked', path: 'same' },
      ],
    ],
    [
      'duplicate untracked path',
      [
        { kind: 'untracked', path: 'same' },
        { kind: 'untracked', path: 'same' },
      ],
    ],
    [
      'duplicate tracked stage',
      [
        { kind: 'tracked', mode: '100644', path: 'same', stage: 2 },
        { kind: 'tracked', mode: '120000', path: 'same', stage: 2 },
      ],
    ],
    [
      'stage zero mixed with conflict stages',
      [
        { kind: 'tracked', mode: '100644', path: 'same', stage: 0 },
        { kind: 'tracked', mode: '100644', path: 'same', stage: 1 },
      ],
    ],
    ['surviving gitlink', [{ kind: 'tracked', mode: '160000', path: 'module', stage: 0 }]],
  ] as const)('rejects a %s', (_description, candidates) => {
    expect(collapseGitInventoryCandidates(candidates)).toStrictEqual({ kind: 'failed' });
  });
});
