// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { createCanonicalUrl, normalizeBasePath, withBase } from './url.ts';

describe('website URLs', () => {
  test.each([
    ['', '/'],
    ['/', '/'],
    ['packages', '/packages/'],
    ['/packages/', '/packages/'],
  ])('normalizeBasePath(%s) -> %s', (basePath, expected) => {
    expect(normalizeBasePath(basePath)).toBe(expected);
  });

  test('prefixes logical package routes under the GitHub Pages project base', () => {
    expect(withBase('/packages/core/', '/packages/')).toBe('/packages/packages/core/');
    expect(withBase('/adapters/openai/', '/packages/')).toBe('/packages/adapters/openai/');
  });

  test('keeps logical routes at the origin root for a future custom domain', () => {
    expect(withBase('/packages/core/', '/')).toBe('/packages/core/');
    expect(createCanonicalUrl('/packages/core/', 'https://docs.example.com', '/')).toBe(
      'https://docs.example.com/packages/core/',
    );
  });

  test('creates the default project-site canonical URL', () => {
    expect(
      createCanonicalUrl('/adapters/openai/', 'https://moldea-ai.github.io', '/packages/'),
    ).toBe('https://moldea-ai.github.io/packages/adapters/openai/');
  });
});
