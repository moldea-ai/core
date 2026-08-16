import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

import { DEFAULT_BASE_PATH, DEFAULT_SITE_URL, normalizeBasePath } from './src/lib/site/url.ts';

const site = process.env.SITE_URL ?? DEFAULT_SITE_URL;
const base = normalizeBasePath(process.env.BASE_PATH ?? DEFAULT_BASE_PATH);

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light-default',
        dark: 'github-dark-default',
      },
      wrap: true,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
