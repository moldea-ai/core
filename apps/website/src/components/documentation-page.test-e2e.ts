import { expect, test } from '@playwright/test';

import { DEFAULT_BASE_PATH, withBase } from '../lib/site/url.ts';

const basePath = process.env.BASE_PATH ?? DEFAULT_BASE_PATH;
const toPublicPath = (route: string): string => withBase(route, basePath);

test('identifies API reference pages in breadcrumbs and documentation navigation', async ({
  page,
}) => {
  for (const { packageName, packageRoute, path } of [
    {
      packageName: '@moldea.ai/core',
      packageRoute: '/packages/core/',
      path: '/packages/core/api/',
    },
    {
      packageName: '@moldea.ai/adapter-openai',
      packageRoute: '/adapters/openai/',
      path: '/adapters/openai/api/',
    },
  ]) {
    await page.goto(toPublicPath(path));

    const breadcrumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(breadcrumbs.getByRole('link', { name: packageName, exact: true })).toHaveAttribute(
      'href',
      toPublicPath(packageRoute),
    );
    await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText('API reference');

    const documentationNavigation = page.getByRole('navigation', {
      includeHidden: true,
      name: `${packageName} documentation`,
    });
    const activeApiLinks = documentationNavigation.getByRole('link', {
      includeHidden: true,
      name: 'API reference',
      exact: true,
    });

    await expect(documentationNavigation).toHaveCount(2);
    await expect(activeApiLinks).toHaveCount(2);
    await expect(activeApiLinks.nth(0)).toHaveAttribute('aria-current', 'page');
    await expect(activeApiLinks.nth(1)).toHaveAttribute('aria-current', 'page');
  }
});
