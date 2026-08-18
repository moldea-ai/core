import type { APIRoute } from 'astro';
import type { ISearchDocument } from '@moldea.ai/website-ui/search';
import { withBase } from '@moldea.ai/website-ui/site';

import { loadWebsiteModel } from '../lib/generation/generation.ts';

export const prerender = true;

/** Serves the deterministic public documentation search index. */
export const GET: APIRoute = () => {
  const basePath = import.meta.env.BASE_URL;
  const documents: ISearchDocument[] = loadWebsiteModel().searchRecords.map((record) => ({
    description: record.description,
    searchText: record.searchText,
    title: record.title,
    url: withBase(record.route, basePath),
  }));

  return new Response(`${JSON.stringify(documents)}\n`, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
