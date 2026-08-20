// @vitest-environment node
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { DEFAULT_BASE_PATH, withBase } from '@moldea.ai/website-ui/site';

const basePath = process.env.BASE_PATH ?? DEFAULT_BASE_PATH;
const toPublicPath = (route: string): string => withBase(route, basePath);

test('renders the maturity legend and one target per compatibility row', async ({ page }) => {
  await page.goto(toPublicPath('/compatibility/'));

  const maturityLegend = page.getByRole('region', { name: 'Target maturity' });
  const compatibilityTable = page.getByRole('table', {
    name: 'Official moldea runtime adapter compatibility summary',
  });
  const targetCells = compatibilityTable.locator('[headers="target-maturity-heading"]');
  const experimentalTargets = compatibilityTable.getByRole('link', { name: /, experimental$/u });
  const customTarget = compatibilityTable.getByRole('link', { name: 'custom, supported' });
  const langChainTarget = compatibilityTable.getByRole('link', {
    name: 'typescript-create-agent-1-5, experimental',
  });

  await expect(maturityLegend.getByRole('list', { name: 'Target maturity legend' })).toContainText(
    'supportedexperimentaldeprecated',
  );
  await expect(
    maturityLegend.getByTitle('Production-ready within its exact published scope.'),
  ).toBeVisible();
  await expect(
    maturityLegend.getByTitle('Verified and fixture-backed, but not production-ready.'),
  ).toBeVisible();
  await expect(
    maturityLegend.getByTitle('Documented for existing users; new adoption is discouraged.'),
  ).toBeVisible();
  await expect(experimentalTargets).toHaveCount(11);
  await expect(compatibilityTable.getByRole('link', { name: /, supported$/u })).toHaveCount(1);
  await expect(compatibilityTable.getByRole('link', { name: /, deprecated$/u })).toHaveCount(0);
  expect(
    await targetCells.evaluateAll((cells) =>
      cells.every((cell) => cell.querySelectorAll('a').length <= 1),
    ),
  ).toBe(true);
  await expect(customTarget).toHaveAttribute('title', 'custom');
  await expect(langChainTarget).toHaveAttribute('title', 'typescript-create-agent-1-5');
  await expect(
    compatibilityTable.getByRole('link', {
      name: 'typescript-think-0-16-ai-sdk-7, experimental',
    }),
  ).toBeVisible();
  await expect(
    compatibilityTable.getByRole('link', {
      name: 'typescript-ai-chat-agent-0-10-ai-sdk-7, experimental',
    }),
  ).toBeVisible();
  await expect(
    compatibilityTable
      .getByRole('row', { name: /langgraph/u })
      .locator('[headers="target-maturity-heading"]'),
  ).toHaveText('Not available');
  expect(
    await customTarget
      .locator('span')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe(
    await langChainTarget
      .locator('span')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  );
  expect(
    await Promise.all([
      customTarget.locator('span').evaluate((element) => getComputedStyle(element).borderStyle),
      langChainTarget.locator('span').evaluate((element) => getComputedStyle(element).borderStyle),
      maturityLegend
        .getByText('deprecated', { exact: true })
        .evaluate((element) => getComputedStyle(element).borderStyle),
    ]),
  ).toStrictEqual(['solid', 'dashed', 'dotted']);

  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  const materialViolations = accessibilityResults.violations.filter(
    ({ impact }) => impact === 'critical' || impact === 'serious',
  );

  expect(materialViolations).toStrictEqual([]);
});

test('truncates long targets and keeps target navigation usable at 320px', async ({ page }) => {
  await page.setViewportSize({ height: 740, width: 320 });
  await page.goto(toPublicPath('/compatibility/'));

  const targetLink = page.getByRole('link', {
    name: 'typescript-create-agent-1-5, experimental',
  });
  const targetBadge = targetLink.locator('span');
  const expectedTargetPath = `${toPublicPath(
    '/adapters/langchain/',
  )}#langchain-typescript-create-agent-1-5`;
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));

  await expect(targetLink).toHaveAttribute('href', expectedTargetPath);
  await expect(targetLink).toHaveAttribute('title', 'typescript-create-agent-1-5');
  expect(
    await targetBadge.evaluate((element) => {
      const style = getComputedStyle(element);

      return {
        display: style.display,
        hasOverflowingText: element.scrollWidth > element.clientWidth,
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
      };
    }),
  ).toStrictEqual({
    display: 'block',
    hasOverflowingText: true,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });
  expect((await targetLink.boundingBox())?.width).toBeLessThanOrEqual(192);
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);

  await targetLink.focus();
  await expect(targetLink).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(new RegExp(`${expectedTargetPath.replaceAll('/', '\\/')}$`, 'u'));
  await expect(
    page.getByRole('heading', { level: 2, name: 'typescript-create-agent-1-5' }),
  ).toBeVisible();
});
