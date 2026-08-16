import type { APIRoute } from 'astro';

import { createCanonicalUrl, withBase } from '../lib/site/url.ts';

export const prerender = true;

export const GET: APIRoute = () => {
  const siteUrl = import.meta.env.SITE;
  const basePath = import.meta.env.BASE_URL;
  const contents = [
    'User-agent: *',
    `Allow: ${withBase('/', basePath)}`,
    `Sitemap: ${createCanonicalUrl('/sitemap-index.xml', siteUrl, basePath)}`,
    '',
  ].join('\n');

  return new Response(contents, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
