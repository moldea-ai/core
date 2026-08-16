import type { APIRoute } from 'astro';

import { loadWebsiteModel } from '../lib/generation/generation.ts';
import type { ISearchDocument } from '../lib/search/search.ts';
import { withBase } from '../lib/site/url.ts';

export const prerender = true;

/** Serves the deterministic public documentation search index. */
export const GET: APIRoute = () => {
  const documents: ISearchDocument[] = loadWebsiteModel().searchRecords.map((record) => ({
    description: record.description,
    searchText: record.searchText,
    title: record.title,
    url: withBase(record.route),
  }));

  return new Response(`${JSON.stringify(documents)}\n`, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
