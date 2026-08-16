import type { APIRoute } from 'astro';

import { loadWebsiteModel } from '../lib/generation/generation.ts';
import { createCanonicalUrl } from '../lib/site/url.ts';

export const prerender = true;

export const GET: APIRoute = () => {
  const model = loadWebsiteModel();
  const siteUrl = import.meta.env.SITE;
  const basePath = import.meta.env.BASE_URL;
  const text = model.llmsText.replaceAll(/\]\((\/[^)]+)\)/g, (_match, route: string) => {
    return `](${createCanonicalUrl(route, siteUrl, basePath)})`;
  });

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
