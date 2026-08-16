// one base-aware public document delivered by the static search index
export interface ISearchDocument {
  description: string;
  searchText: string;
  title: string;
  url: string;
}

const SEARCH_RESULT_LIMIT = 16;

const normalizeSearchValue = (source: string): string =>
  source
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replaceAll(/\s+/g, ' ')
    .trim();

const isSearchDocument = (source: unknown): source is ISearchDocument => {
  if (!source || typeof source !== 'object') return false;

  const candidate = source as Record<string, unknown>;

  return (
    typeof candidate.description === 'string' &&
    typeof candidate.searchText === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.url === 'string'
  );
};

/** Validates the generated browser search-index boundary. */
export const parseSearchDocuments = (source: unknown): ISearchDocument[] => {
  if (!Array.isArray(source) || !source.every(isSearchDocument)) {
    throw new Error('The documentation search index is invalid.');
  }

  return source;
};

const getSearchScore = (query: string, tokens: string[], document: ISearchDocument): number => {
  const title = normalizeSearchValue(document.title);
  const description = normalizeSearchValue(document.description);
  const searchText = normalizeSearchValue(document.searchText);
  const completeText = `${title} ${description} ${searchText}`;

  if (!tokens.every((token) => completeText.includes(token))) return -1;

  let score = title === query ? 64 : title.startsWith(query) ? 32 : 0;

  for (const token of tokens) {
    if (title.includes(token)) score += 16;
    if (description.includes(token)) score += 4;
    if (searchText.includes(token)) score += 1;
  }

  return score;
};

/** Searches public documentation locally with deterministic relevance and ordering. */
export const searchDocuments = (query: string, documents: ISearchDocument[]): ISearchDocument[] => {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) return [];

  const tokens = [...new Set(normalizedQuery.split(' '))];

  return documents
    .map((document) => ({ document, score: getSearchScore(normalizedQuery, tokens, document) }))
    .filter(({ score }) => score >= 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.document.title.localeCompare(right.document.title) ||
        left.document.url.localeCompare(right.document.url),
    )
    .slice(0, SEARCH_RESULT_LIMIT)
    .map(({ document }) => document);
};
