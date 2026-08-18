// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { expectToThrowCode } from 'web-utils-kit';

import { parseSearchDocuments, searchDocuments, type ISearchDocument } from './index.js';

const createSearchDocument = (
  title: string,
  overrides: Partial<ISearchDocument> = {},
): ISearchDocument => ({
  description: `${title} description`,
  searchText: `${title} searchable content`,
  title,
  url: `/docs/${title.toLocaleLowerCase('en').replaceAll(' ', '-')}/`,
  ...overrides,
});

describe('website search utilities', () => {
  test('accepts complete documents with safe root-relative URLs', () => {
    const documents = [createSearchDocument('Repository')];

    expect(parseSearchDocuments(documents)).toBe(documents);
  });

  test.each([
    [{ description: '', searchText: '', title: '', url: 'javascript:alert(1)' }],
    [{ description: '', searchText: '', title: '', url: '//malicious.example/path' }],
    [{ description: '', searchText: '', title: '', url: '/safe\\malicious' }],
    [{ description: '', searchText: '', title: '' }],
    [{}],
    'invalid',
  ])('rejects malformed or unsafe search-index input', (source) => {
    expectToThrowCode(
      () => parseSearchDocuments(source),
      'INVALID_SEARCH_INDEX',
      'The documentation search index is invalid.',
    );
  });

  test('normalizes accents and ranks exact and title matches before body matches', () => {
    const documents = [
      createSearchDocument('Unrelated', { searchText: 'repository' }),
      createSearchDocument('Repository snapshots'),
      createSearchDocument('Repository'),
      createSearchDocument('Guide', { description: 'Repository overview' }),
    ];

    expect(searchDocuments('répository', documents).map(({ title }) => title)).toStrictEqual([
      'Repository',
      'Repository snapshots',
      'Guide',
      'Unrelated',
    ]);
  });

  test('requires every distinct query token and returns an empty list for blank input', () => {
    const documents = [
      createSearchDocument('Repository snapshots'),
      createSearchDocument('Repository only'),
    ];

    expect(
      searchDocuments('repository snapshots', documents).map(({ title }) => title),
    ).toStrictEqual(['Repository snapshots']);
    expect(searchDocuments('   ', documents)).toStrictEqual([]);
  });

  test('limits deterministic results to sixteen documents', () => {
    const documents = Array.from({ length: 20 }, (_, index) =>
      createSearchDocument(`Repository ${String(index).padStart(2, '0')}`),
    );

    expect(searchDocuments('repository', documents)).toHaveLength(16);
  });
});
