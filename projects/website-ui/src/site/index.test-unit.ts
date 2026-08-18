// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { expectToThrowCode } from 'web-utils-kit';

import { createCanonicalUrl, isPublicRouteActive, normalizeBasePath, withBase } from './index.js';

describe('website site utilities', () => {
  test.each([
    ['', '/'],
    ['/', '/'],
    ['docs', '/docs/'],
    ['/docs/', '/docs/'],
    ['//docs//v1', '/docs/v1/'],
  ])('normalizeBasePath(%s) -> %s', (basePath, expectedPath) => {
    expect(normalizeBasePath(basePath)).toBe(expectedPath);
  });

  test.each(['/<script>/', '/docs?preview/', '/docs v1/', '/docs/%2f/'])(
    'normalizeBasePath(%s) rejects unsupported URL characters',
    (basePath) => {
      expectToThrowCode(
        () => normalizeBasePath(basePath),
        'INVALID_BASE_PATH',
        'The website base path contains unsupported URL characters.',
      );
    },
  );

  test('prefixes public routes without duplicating separators', () => {
    expect(withBase('/packages/repository/', '/docs/')).toBe('/docs/packages/repository/');
  });

  test('does not mark the root route active for every descendant', () => {
    expect(isPublicRouteActive('/', '/', '/')).toBe(true);
    expect(isPublicRouteActive('/packages/', '/', '/')).toBe(false);
    expect(isPublicRouteActive('/docs/packages/', '/packages/', '/docs/')).toBe(true);
  });

  test('creates one canonical URL through the configured deployment base', () => {
    expect(createCanonicalUrl('/search/', 'https://packages.moldea.ai', '/docs/')).toBe(
      'https://packages.moldea.ai/docs/search/',
    );
  });
});
