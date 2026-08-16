// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  createCanonicalUrl,
  DEFAULT_BASE_PATH,
  DEFAULT_SITE_URL,
  normalizeBasePath,
  withBase,
} from './url.ts';

describe('website URLs', () => {
  test.each([
    ['', '/'],
    ['/', '/'],
    ['packages', '/packages/'],
    ['/packages/', '/packages/'],
  ])('normalizeBasePath(%s) -> %s', (basePath, expected) => {
    expect(normalizeBasePath(basePath)).toBe(expected);
  });

  test.each(['packages;command', 'packages path', 'packages?query'])(
    'normalizeBasePath(%s) rejects unsupported URL characters',
    (basePath) => {
      expect(() => normalizeBasePath(basePath)).toThrow(
        'The website base path contains unsupported URL characters.',
      );
    },
  );

  test('prefixes logical package routes under the GitHub Pages project base', () => {
    expect(withBase('/packages/core/', '/packages/')).toBe('/packages/packages/core/');
    expect(withBase('/adapters/openai/', '/packages/')).toBe('/packages/adapters/openai/');
  });

  test('keeps logical routes at the origin root for the custom domain', () => {
    expect(withBase('/packages/core/', '/')).toBe('/packages/core/');
    expect(createCanonicalUrl('/packages/core/', 'https://docs.example.com', '/')).toBe(
      'https://docs.example.com/packages/core/',
    );
  });

  test('creates the established custom-domain canonical URL by default', () => {
    expect(createCanonicalUrl('/adapters/openai/', DEFAULT_SITE_URL, DEFAULT_BASE_PATH)).toBe(
      'https://packages.moldea.ai/adapters/openai/',
    );
  });
});
