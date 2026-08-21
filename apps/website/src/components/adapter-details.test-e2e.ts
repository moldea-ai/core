// @vitest-environment node
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { DEFAULT_BASE_PATH, withBase } from '@moldea.ai/website-ui/site';

const basePath = process.env.BASE_PATH ?? DEFAULT_BASE_PATH;
const toPublicPath = (route: string): string => withBase(route, basePath);

test('links only profiled targets to canonical qualification evidence', async ({ page }) => {
  await page.setViewportSize({ height: 740, width: 320 });
  await page.goto(toPublicPath('/adapters/custom/'));

  const evidenceLink = page.getByRole('link', {
    name: 'View qualification evidence for custom target custom',
  });

  await expect(evidenceLink).toBeVisible();
  await expect(evidenceLink).toContainText('Qualification evidence');
  await expect(evidenceLink).toHaveAttribute(
    'href',
    'https://skill.moldea.ai/qualification/custom/custom/',
  );
  await expect(evidenceLink).toHaveAttribute('target', '_blank');
  await expect(evidenceLink).toHaveAttribute('rel', 'noopener noreferrer');

  await evidenceLink.focus();
  await expect(evidenceLink).toBeFocused();

  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));

  expect(widths.scroll).toBeLessThanOrEqual(widths.client);

  for (const theme of ['light', 'dark'] as const) {
    await page.locator('html').evaluate((root, activeTheme) => {
      root.classList.remove('light', 'dark');
      root.classList.add(activeTheme);
    }, theme);

    const accessibilityResults = await new AxeBuilder({ page }).analyze();
    const materialViolations = accessibilityResults.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    );

    expect(materialViolations).toStrictEqual([]);
  }

  await page.goto(toPublicPath('/adapters/openai/'));
  await expect(page.getByRole('link', { name: /qualification evidence/iu })).toHaveCount(0);
});
