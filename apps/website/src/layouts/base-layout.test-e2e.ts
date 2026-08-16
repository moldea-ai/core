// @vitest-environment node
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const REPRESENTATIVE_PATHS = [
  '/packages/',
  '/packages/packages/',
  '/packages/packages/core/',
  '/packages/packages/core/api/',
  '/packages/packages/core/diagnostics/',
  '/packages/adapters/',
  '/packages/adapters/openai/',
  '/packages/adapters/openai/api/',
  '/packages/compatibility/',
  '/packages/search/',
] as const;

test('persists an explicit theme and exposes mobile navigation from the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ height: 740, width: 320 });
  await page.goto('/packages/');

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
  await page.goto('/packages/');
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
  await expect(page).toHaveURL(/\/packages\/packages\/$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'One foundation. Explicit responsibilities.' }),
  ).toBeVisible();
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
    await page.goto(path);
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
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const materialViolations = results.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    );

    expect(materialViolations, `${path} has material accessibility violations`).toStrictEqual([]);
  }
});

test('searches the generated local index with a keyboard-submitted query', async ({ page }) => {
  await page.goto('/packages/');
  await page.getByRole('link', { name: 'Search documentation' }).click();
  await expect(page).toHaveURL(/\/packages\/search\/$/);
  await page.getByRole('searchbox', { name: 'Search documentation' }).fill('snapshot');
  await page.getByRole('searchbox', { name: 'Search documentation' }).press('Enter');

  await expect(page.locator('[data-search-results] li').first()).toBeVisible();
  await expect(page.locator('[data-search-status]')).toContainText(/results? for “snapshot”/);
});

test('left-aligns generated API signatures without indentation whitespace', async ({ page }) => {
  for (const path of ['/packages/packages/core/api/', '/packages/adapters/openai/api/']) {
    await page.goto(path);
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
