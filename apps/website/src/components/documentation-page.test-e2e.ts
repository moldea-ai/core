import { expect, test } from '@playwright/test';

test('identifies API reference pages in breadcrumbs and documentation navigation', async ({
  page,
}) => {
  for (const { packageName, packageRoute, path } of [
    {
      packageName: '@moldea.ai/core',
      packageRoute: '/packages/packages/core/',
      path: '/packages/packages/core/api/',
    },
    {
      packageName: '@moldea.ai/adapter-openai',
      packageRoute: '/packages/adapters/openai/',
      path: '/packages/adapters/openai/api/',
    },
  ]) {
    await page.goto(path);

    const breadcrumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(breadcrumbs.getByRole('link', { name: packageName, exact: true })).toHaveAttribute(
      'href',
      packageRoute,
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
