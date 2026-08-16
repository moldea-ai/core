// @vitest-environment node
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { DEFAULT_BASE_PATH, withBase } from '../lib/site/url.ts';

const basePath = process.env.BASE_PATH ?? DEFAULT_BASE_PATH;
const toPublicPath = (route: string): string => withBase(route, basePath);
const REPRESENTATIVE_PATHS = [
  '/',
  '/packages/',
  '/packages/core/',
  '/packages/core/api/',
  '/packages/core/diagnostics/',
  '/adapters/',
  '/adapters/openai/',
  '/adapters/openai/api/',
  '/compatibility/',
  '/search/',
] as const;

test('persists an explicit theme and exposes mobile navigation from the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ height: 740, width: 320 });
  await page.goto(toPublicPath('/'));

  const navigationButton = page.getByLabel('Open navigation');
  await navigationButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();

  const themeControl = page.getByRole('button', { name: 'Use dark theme' }).last();
  await themeControl.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await navigationButton.click();
  await expect(page.getByRole('button', { name: 'Use light theme' }).last()).toBeVisible();
});

test('uses smooth client-side navigation while preserving ordinary static routes', async ({
  page,
}) => {
  await page.goto(toPublicPath('/'));
  await expect(page.locator('meta[name="astro-view-transitions-enabled"]')).toHaveAttribute(
    'content',
    'true',
  );

  const navigationMarker = await page.evaluate(() => {
    const marker = crypto.randomUUID();
    (window as Window & { __moldeaNavigationMarker?: string }).__moldeaNavigationMarker = marker;

    return marker;
  });

  await page.getByRole('link', { name: 'Packages', exact: true }).first().click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'One foundation. Explicit responsibilities.' }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(toPublicPath('/packages/'));
  expect(
    await page.evaluate(
      () => (window as Window & { __moldeaNavigationMarker?: string }).__moldeaNavigationMarker,
    ),
  ).toBe(navigationMarker);

  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('has no page-level horizontal overflow at 320px on representative routes', async ({
  page,
}) => {
  await page.setViewportSize({ height: 740, width: 320 });

  for (const path of REPRESENTATIVE_PATHS) {
    await page.goto(toPublicPath(path));
    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));

    expect(widths.scroll, `${path} overflows horizontally`).toBeLessThanOrEqual(widths.client);
  }
});

test('keeps primary static routes free of serious automated accessibility violations', async ({
  page,
}) => {
  for (const path of REPRESENTATIVE_PATHS) {
    await page.goto(toPublicPath(path));
    const results = await new AxeBuilder({ page }).analyze();
    const materialViolations = results.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    );

    expect(materialViolations, `${path} has material accessibility violations`).toStrictEqual([]);
  }
});

test('searches the generated local index with a keyboard-submitted query', async ({ page }) => {
  await page.goto(toPublicPath('/'));
  await page.getByRole('link', { name: 'Search documentation' }).click();
  await page.waitForURL((url) => url.pathname === toPublicPath('/search/'));
  expect(new URL(page.url()).pathname).toBe(toPublicPath('/search/'));
  await page.getByRole('searchbox', { name: 'Search documentation' }).fill('snapshot');
  await page.getByRole('searchbox', { name: 'Search documentation' }).press('Enter');

  await expect(page.locator('[data-search-results] li').first()).toBeVisible();
  await expect(page.locator('[data-search-status]')).toContainText(/results? for “snapshot”/);
});

test('left-aligns generated API signatures without indentation whitespace', async ({ page }) => {
  for (const path of ['/packages/core/api/', '/adapters/openai/api/']) {
    await page.goto(toPublicPath(path));
    const signature = page.locator('pre').first();

    await expect(signature).toBeVisible();
    await expect(signature).toHaveAttribute('tabindex', '0');
    expect(
      await signature.evaluate((element) => element.textContent === element.textContent?.trim()),
      `${path} adds presentation whitespace around a signature`,
    ).toBe(true);
    await expect(signature).toHaveCSS('text-align', 'start');
    await signature.focus();
    await expect(signature).toBeFocused();
  }
});
