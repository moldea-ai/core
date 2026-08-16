// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseSearchDocuments, searchDocuments, type ISearchDocument } from './search.ts';

const DOCUMENTS: ISearchDocument[] = [
  {
    description: 'Filesystem-backed repository snapshots.',
    searchText: 'verified capture symlink cache',
    title: '@moldea.ai/repository-fs',
    url: '/packages/packages/repository-fs/',
  },
  {
    description: 'Source-neutral repository access.',
    searchText: 'logical paths snapshot consistency',
    title: '@moldea.ai/repository',
    url: '/packages/packages/repository/',
  },
  {
    description: 'Runtime status.',
    searchText: 'openai experimental responses api',
    title: 'openai runtime adapter',
    url: '/packages/adapters/openai/',
  },
];

describe('parseSearchDocuments', () => {
  test('accepts the generated public search contract', () => {
    expect(parseSearchDocuments(DOCUMENTS)).toStrictEqual(DOCUMENTS);
  });

  test('rejects malformed index records', () => {
    expect(() => parseSearchDocuments([{ title: 'Incomplete' }])).toThrow(
      'The documentation search index is invalid.',
    );
  });
});

describe('searchDocuments', () => {
  test('ranks title matches before body-only matches', () => {
    expect(searchDocuments('repository', DOCUMENTS).map(({ title }) => title)).toStrictEqual([
      '@moldea.ai/repository',
      '@moldea.ai/repository-fs',
    ]);
  });

  test('requires every query token and ignores case', () => {
    expect(searchDocuments('OPENAI experimental', DOCUMENTS)).toStrictEqual([DOCUMENTS[2]]);
    expect(searchDocuments('openai supported', DOCUMENTS)).toStrictEqual([]);
  });

  test('returns an empty result for an empty query', () => {
    expect(searchDocuments('   ', DOCUMENTS)).toStrictEqual([]);
  });

  test('orders equal-scoring results deterministically', () => {
    const reversedDocuments = [...DOCUMENTS].reverse();

    expect(searchDocuments('snapshot', reversedDocuments)).toStrictEqual(
      searchDocuments('snapshot', DOCUMENTS),
    );
  });
});
