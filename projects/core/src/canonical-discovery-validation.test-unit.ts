// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath, type IRepositoryEntryType } from '@moldea.ai/repository';

import { classifyCanonicalEntry } from './canonical-discovery-validation.js';

const classify = (path: string, type: IRepositoryEntryType) => {
  return classifyCanonicalEntry({ path: parseRepositoryPath(path), type });
};

describe('Core canonical entry classification', () => {
  test.each([
    ['/moldea/moldea.yaml', 'manifest', null],
    ['/moldea/project.md', 'project', null],
    ['/moldea/context/product.md', 'context', null],
    ['/moldea/context/security/privacy.md', 'context', null],
    ['/moldea/decisions/not-yet-valid.md', 'decision', null],
    ['/moldea/runtimes/custom/api.md', 'runtime-guidance', null],
    ['/moldea/agents/support/description.md', 'agent-description', 'support'],
    ['/moldea/agents/support/instruction.md', 'agent-instruction', 'support'],
    ['/moldea/agents/support/handoff-description.md', 'agent-handoff-description', 'support'],
  ])('classifyCanonicalEntry(%s, file) -> %s', (path, fileKind, agentId) => {
    expect(classify(path, 'file')).toStrictEqual({
      agentId,
      fileKind,
      kind: 'canonical-file',
    });
  });

  test.each([
    ['/moldea/context', { kind: 'structural-directory' }],
    ['/moldea/context/security', { kind: 'structural-directory' }],
    ['/moldea/runtimes/custom', { kind: 'structural-directory' }],
    ['/moldea/agents/support', { agentId: 'support', kind: 'agent-directory' }],
    ['/moldea/decisions/nested', { kind: 'ignored-directory' }],
    ['/moldea/unknown-empty', { kind: 'ignored-directory' }],
  ])('classifyCanonicalEntry(%s, directory)', (path, expected) => {
    expect(classify(path, 'directory')).toStrictEqual(expected);
  });

  test.each([
    ['/moldea/project.md', 'directory', 'file'],
    ['/moldea/context', 'file', 'directory'],
    ['/moldea/agents/support', 'symlink', 'directory'],
    ['/moldea/agents/support/instruction.md', 'directory', 'file'],
  ] as const)(
    'classifyCanonicalEntry(%s, %s) -> entry-type-invalid',
    (path, type, expectedType) => {
      expect(classify(path, type)).toStrictEqual({
        expectedType,
        kind: 'entry-type-invalid',
      });
    },
  );

  test('gives canonical file symlinks their specific classification', () => {
    expect(classify('/moldea/context/product.md', 'symlink')).toStrictEqual({
      kind: 'canonical-asset-symlink',
    });
  });

  test.each([
    ['/moldea/notes.txt', 'file'],
    ['/moldea/decisions/nested/1786131723456-choice.md', 'file'],
    ['/moldea/agents/support/notes.md', 'file'],
    ['/moldea/context/product.txt', 'symlink'],
  ] as const)('classifyCanonicalEntry(%s, %s) -> unrecognized', (path, type) => {
    expect(classify(path, type)).toStrictEqual({ kind: 'unrecognized' });
  });
});
