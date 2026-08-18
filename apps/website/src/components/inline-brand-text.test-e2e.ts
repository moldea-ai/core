// @vitest-environment jsdom
import { expect, test } from '@playwright/test';

import { DEFAULT_BASE_PATH, withBase } from '../lib/site/url.ts';

const basePath = process.env.BASE_PATH ?? DEFAULT_BASE_PATH;
const toPublicPath = (route: string): string => withBase(route, basePath);

test('renders standalone moldea references as inline code in visible prose', async ({ page }) => {
  await page.goto(toPublicPath('/'));

  const heroCopy = page
    .locator('main p')
    .filter({ hasText: 'moldea is the behavioral integrity layer for AI agents.' });
  const heroBrandName = heroCopy.locator('code');

  await expect(heroBrandName).toHaveText('moldea');
  await expect(heroCopy).toContainText(
    'moldea is the behavioral integrity layer for AI agents. This repository provides the deterministic readers',
  );

  const architectureDescription = page
    .locator('[aria-labelledby="architecture-title"] a p')
    .filter({ hasText: 'Source-neutral, deterministic interpretation and indexing' });

  await expect(architectureDescription.locator('code')).toHaveText('moldea');

  const lightBackground = await heroBrandName.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  await page.getByRole('button', { name: 'Use dark theme' }).first().click();

  const darkBackground = await heroBrandName.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  expect(darkBackground).not.toBe(lightBackground);

  await page.goto(toPublicPath('/packages/core/'));

  const description = page.locator('article > header > p').first();

  await expect(description.locator('code')).toHaveText('moldea');
  await expect(description).toContainText('composition for moldea repositories.');
});
