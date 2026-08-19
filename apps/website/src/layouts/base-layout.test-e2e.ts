// @vitest-environment node
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { DEFAULT_BASE_PATH, withBase } from '@moldea.ai/website-ui/site';

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

/** Converts an OKLCH token to clipped linear-sRGB relative luminance. */
const calculateRelativeLuminance = (color: string): number => {
  const match = /^oklch\(\s*([\d.]+)(%)?\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/[^)]+)?\s*\)$/u.exec(
    color.trim(),
  );

  if (match === null) {
    throw new Error(`Expected an OKLCH color token, received: ${color}`);
  }

  const lightness = Number(match[1]) / (match[2] === '%' ? 100 : 1);
  const chroma = Number(match[3]);
  const hue = (Number(match[4]) * Math.PI) / 180;
  const labA = chroma * Math.cos(hue);
  const labB = chroma * Math.sin(hue);
  const lPrime = lightness + 0.3963377774 * labA + 0.2158037573 * labB;
  const mPrime = lightness - 0.1055613458 * labA - 0.0638541728 * labB;
  const sPrime = lightness - 0.0894841775 * labA - 1.291485548 * labB;
  const lValue = lPrime ** 3;
  const mValue = mPrime ** 3;
  const sValue = sPrime ** 3;
  const clampChannel = (channel: number): number => Math.min(1, Math.max(0, channel));
  const red = clampChannel(4.0767416621 * lValue - 3.3077115913 * mValue + 0.2309699292 * sValue);
  const green = clampChannel(
    -1.2684380046 * lValue + 2.6097574011 * mValue - 0.3413193965 * sValue,
  );
  const blue = clampChannel(-0.0041960863 * lValue - 0.7034186147 * mValue + 1.707614701 * sValue);

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

/** Calculates the WCAG contrast ratio between two OKLCH color tokens. */
const calculateContrastRatio = (firstColor: string, secondColor: string): number => {
  const firstLuminance = calculateRelativeLuminance(firstColor);
  const secondLuminance = calculateRelativeLuminance(secondColor);
  const lighterLuminance = Math.max(firstLuminance, secondLuminance);
  const darkerLuminance = Math.min(firstLuminance, secondLuminance);

  return (lighterLuminance + 0.05) / (darkerLuminance + 0.05);
};

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

  await page.goto(toPublicPath('/packages/core/'));

  const description = page.locator('article > header > p').first();

  await expect(description.locator('code')).toHaveText('moldea');
  await expect(description).toContainText('composition for moldea repositories.');
});

test('persists an explicit theme and exposes mobile navigation from the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ height: 740, width: 320 });
  await page.goto(toPublicPath('/'));

  await expect(
    page.getByRole('banner').getByLabel('moldea packages home').getByText('packages'),
  ).toBeVisible();

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

test('shows accessible progress during delayed client navigation and hides it after success', async ({
  page,
}) => {
  await page.setViewportSize({ height: 740, width: 320 });
  await page.goto(toPublicPath('/'));

  const progress = page.getByRole('progressbar', {
    includeHidden: true,
    name: 'Page navigation progress',
  });
  const delayedRequest = Promise.withResolvers<void>();

  await expect(progress).toBeHidden();
  await page.route(
    `**${toPublicPath('/packages/')}`,
    async (route) => {
      await delayedRequest.promise;
      await route.continue();
    },
    { times: 1 },
  );

  const navigation = page.getByRole('link', { name: 'Packages', exact: true }).first().click();

  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute('aria-valuetext', 'Loading next page');
  expect((await progress.boundingBox())?.width).toBe(320);

  const accessibilityResults = await new AxeBuilder({ page })
    .include('[data-navigation-progress]')
    .analyze();

  expect(accessibilityResults.violations).toStrictEqual([]);

  delayedRequest.resolve();
  await navigation;
  await expect(page).toHaveURL(toPublicPath('/packages/'));
  await expect(progress).toBeHidden();
});

test('cleans up progress after failed and interrupted navigation and across browser history', async ({
  page,
}) => {
  await page.goto(toPublicPath('/'));

  const progress = page.getByRole('progressbar', {
    includeHidden: true,
    name: 'Page navigation progress',
  });
  await page.evaluate(() => {
    type IFailedPreparationEvent = Event & { loader: () => Promise<void> };
    type IFailedPreparationWindow = Window & {
      __moldeaFailedNavigationPreparation?: IFailedPreparationEvent;
    };
    const preparationEvent = new Event('astro:before-preparation') as IFailedPreparationEvent;

    preparationEvent.loader = (): Promise<void> =>
      Promise.reject(new Error('Deliberate navigation preparation failure.'));
    (window as IFailedPreparationWindow).__moldeaFailedNavigationPreparation = preparationEvent;
    document.dispatchEvent(preparationEvent);
  });

  await expect(progress).toBeVisible();
  await page.evaluate(async () => {
    type IFailedPreparationEvent = Event & { loader: () => Promise<void> };
    type IFailedPreparationWindow = Window & {
      __moldeaFailedNavigationPreparation?: IFailedPreparationEvent;
    };
    const failedPreparationWindow = window as IFailedPreparationWindow;
    const preparationEvent = failedPreparationWindow.__moldeaFailedNavigationPreparation;

    if (preparationEvent === undefined) {
      throw new Error('The failed navigation preparation event is unavailable.');
    }

    try {
      await preparationEvent.loader();
    } catch {
      // the rejected loader is the expected navigation failure under test
    }

    delete failedPreparationWindow.__moldeaFailedNavigationPreparation;
  });
  await expect(progress).toBeHidden();

  await page.goto(toPublicPath('/'));

  const interruptedRequest = Promise.withResolvers<void>();

  await page.route(
    `**${toPublicPath('/packages/')}`,
    async (route) => {
      await interruptedRequest.promise;
      await route.continue();
    },
    { times: 1 },
  );

  const interruptedNavigation = page
    .getByRole('link', { name: 'Packages', exact: true })
    .first()
    .click();

  await expect(progress).toBeVisible();
  await page.getByRole('link', { name: 'Adapters', exact: true }).first().click();
  await expect(page).toHaveURL(toPublicPath('/adapters/'));
  await expect(progress).toBeHidden();

  interruptedRequest.resolve();
  await interruptedNavigation;
  await expect(page).toHaveURL(toPublicPath('/adapters/'));

  await page.getByRole('link', { name: 'Packages', exact: true }).first().click();
  await expect(page).toHaveURL(toPublicPath('/packages/'));
  await expect(progress).toBeHidden();

  await page.goBack();
  await expect(page).toHaveURL(toPublicPath('/adapters/'));
  await expect(progress).toBeHidden();

  await page.goForward();
  await expect(page).toHaveURL(toPublicPath('/packages/'));
  await expect(progress).toBeHidden();
});

test('uses sufficient navigation progress contrast in light and dark themes', async ({ page }) => {
  await page.goto(toPublicPath('/'));

  const progress = page.locator('[data-navigation-progress]');
  const indicator = progress.locator('[data-navigation-progress-indicator]');

  for (const theme of ['light', 'dark'] as const) {
    await page.locator('html').evaluate((root, activeTheme) => {
      root.classList.remove('light', 'dark');
      root.classList.add(activeTheme);
    }, theme);

    const colors = await progress.evaluate((progressElement) => {
      const indicatorElement = progressElement.querySelector<HTMLElement>(
        '[data-navigation-progress-indicator]',
      );
      const rootStyles = getComputedStyle(document.documentElement);

      if (indicatorElement === null) {
        throw new Error('The navigation progress indicator is unavailable.');
      }

      return {
        backgroundToken: rootStyles.getPropertyValue('--background'),
        foregroundToken: rootStyles.getPropertyValue('--foreground'),
        indicatorColor: getComputedStyle(indicatorElement).backgroundColor,
        pageBackground: getComputedStyle(document.body).backgroundColor,
        pageForeground: getComputedStyle(document.body).color,
        trackColor: getComputedStyle(progressElement).backgroundColor,
      };
    });

    expect(colors.indicatorColor).toBe(colors.pageForeground);
    expect(colors.trackColor).toBe(colors.pageBackground);
    expect(
      calculateContrastRatio(colors.foregroundToken, colors.backgroundToken),
    ).toBeGreaterThanOrEqual(3);
    await expect(indicator).toHaveCSS('background-color', colors.pageForeground);
  }
});

test('shows a static navigation segment when reduced motion is preferred', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(toPublicPath('/'));

  const delayedRequest = Promise.withResolvers<void>();

  await page.route(
    `**${toPublicPath('/packages/')}`,
    async (route) => {
      await delayedRequest.promise;
      await route.continue();
    },
    { times: 1 },
  );

  const navigation = page.getByRole('link', { name: 'Packages', exact: true }).first().click();
  const progress = page.getByRole('progressbar', { name: 'Page navigation progress' });
  const indicator = progress.locator('[data-navigation-progress-indicator]');

  await expect(progress).toBeVisible();

  const initialPresentation = await indicator.evaluate((element) => {
    const styles = getComputedStyle(element);

    return {
      animationName: styles.animationName,
      opacity: styles.opacity,
      transform: styles.transform,
    };
  });
  const progressBounds = await progress.boundingBox();
  const indicatorBounds = await indicator.boundingBox();

  await page.waitForTimeout(100);

  expect(initialPresentation.animationName).toBe('none');
  expect(initialPresentation.opacity).toBe('1');
  expect(initialPresentation.transform).not.toBe('none');
  expect(await indicator.evaluate((element) => getComputedStyle(element).transform)).toBe(
    initialPresentation.transform,
  );
  expect(indicatorBounds?.width).toBeGreaterThan((progressBounds?.width ?? 0) * 0.2);
  expect(indicatorBounds?.width).toBeLessThan((progressBounds?.width ?? 0) * 0.4);

  delayedRequest.resolve();
  await navigation;
  await expect(progress).toBeHidden();
});

test('marks the current desktop and mobile navigation destinations', async ({ page }) => {
  await page.goto(toPublicPath('/packages/core/api/'));

  const primaryNavigation = page.getByRole('navigation', { name: 'Primary navigation' });
  const activeDesktopLink = primaryNavigation.locator('a[aria-current="page"]');
  const inactiveDesktopLink = primaryNavigation.getByRole('link', { name: 'Adapters' });

  await expect(activeDesktopLink).toHaveText('Packages');
  expect(
    await activeDesktopLink.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe(
    await inactiveDesktopLink.evaluate((element) => getComputedStyle(element).backgroundColor),
  );

  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(
    await activeDesktopLink.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe(
    await inactiveDesktopLink.evaluate((element) => getComputedStyle(element).backgroundColor),
  );

  await page.goto(toPublicPath('/search/'));
  await expect(page.getByRole('link', { name: 'Search documentation' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.setViewportSize({ height: 740, width: 320 });
  await page.goto(toPublicPath('/adapters/openai/api/'));
  await page.getByLabel('Open navigation').click();

  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
  const activeMobileLink = mobileNavigation.locator('a[aria-current="page"]');
  const inactiveMobileLink = mobileNavigation.getByRole('link', { name: 'Packages' });

  await expect(activeMobileLink).toHaveText('Adapters');
  expect(
    await activeMobileLink.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe(
    await inactiveMobileLink.evaluate((element) => getComputedStyle(element).backgroundColor),
  );
});

test('presents available runtime adapters without promoting planned inventory', async ({
  page,
}) => {
  await page.goto(toPublicPath('/'));

  const adapterSection = page.locator('section[aria-labelledby="available-adapters-title"]');

  await expect(
    adapterSection.getByRole('heading', { level: 2, name: 'Runtime-specific evidence, built in.' }),
  ).toBeVisible();
  await expect(adapterSection.getByRole('link', { name: /anthropic/ })).toBeVisible();
  await expect(adapterSection.getByRole('link', { name: /custom/ })).toBeVisible();
  await expect(adapterSection.getByRole('link', { name: /openai/ })).toHaveCount(2);
  await expect(adapterSection.getByAltText('Anthropic company logo')).toHaveCount(2);
  await expect(adapterSection.getByRole('img', { name: 'Custom adapter icon' })).toBeVisible();
  await expect(adapterSection.getByAltText('OpenAI company logo')).toHaveCount(2);
  await expect(adapterSection.getByRole('link', { name: /claude-agent-sdk/ })).toBeVisible();
  await expect(adapterSection.getByRole('link', { name: /cloudflare-agents/ })).toBeVisible();
  await expect(adapterSection.getByRole('link', { name: /vercel-ai-sdk/ })).toBeVisible();
  await expect(adapterSection.getByAltText('Vercel company logo')).toHaveCount(1);
  await expect(adapterSection.getByRole('link', { name: 'View all adapters' })).toHaveAttribute(
    'href',
    toPublicPath('/adapters/'),
  );
});

test('shows company marks for provider adapters and keeps the custom adapter icon', async ({
  page,
}) => {
  await page.goto(toPublicPath('/adapters/'));

  for (const [companyName, expectedCount] of [
    ['Anthropic', 2],
    ['Cloudflare', 1],
    ['Google', 1],
    ['LangChain', 2],
    ['OpenAI', 2],
    ['Vercel', 2],
  ] as const) {
    await expect(page.getByAltText(`${companyName} company logo`)).toHaveCount(expectedCount);
  }

  const companyMarks = page.locator('img[alt$=" company logo"]');

  await expect(companyMarks).toHaveCount(10);
  await companyMarks.last().scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      companyMarks.evaluateAll((images) =>
        images.every(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);

  const customAdapterCard = page.getByRole('link', { name: /Custom adapter icon/ });

  await expect(customAdapterCard.getByRole('img', { name: 'Custom adapter icon' })).toBeVisible();
  await expect(customAdapterCard.locator('img')).toHaveCount(0);

  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(
    await page
      .getByAltText('OpenAI company logo')
      .first()
      .evaluate((element) => getComputedStyle(element).filter),
  ).not.toBe('none');
});

test('shows the same company marks in the compatibility summary and accordions', async ({
  page,
}) => {
  await page.goto(toPublicPath('/compatibility/'));

  const compatibilityTable = page.getByRole('table', {
    name: 'Official moldea runtime adapter compatibility summary',
  });
  const compatibilityAccordions = page.locator('details');
  const vercelAiSdkRow = compatibilityTable.getByRole('row', { name: /vercel-ai-sdk/ });

  await expect(vercelAiSdkRow.getByText('experimental', { exact: true })).toHaveCount(1);

  for (const [companyName, expectedCount] of [
    ['Anthropic', 2],
    ['Cloudflare', 1],
    ['Google', 1],
    ['LangChain', 2],
    ['OpenAI', 2],
    ['Vercel', 2],
  ] as const) {
    await expect(compatibilityTable.getByAltText(`${companyName} company logo`)).toHaveCount(
      expectedCount,
    );
    await expect(compatibilityAccordions.getByAltText(`${companyName} company logo`)).toHaveCount(
      expectedCount,
    );
  }

  const customAdapterLink = compatibilityTable.getByRole('link', {
    name: /Custom adapter icon/,
  });

  await expect(customAdapterLink.getByRole('img', { name: 'Custom adapter icon' })).toBeVisible();
  await expect(customAdapterLink.locator('img')).toHaveCount(0);
  await expect(
    compatibilityAccordions.getByRole('img', { name: 'Custom adapter icon' }),
  ).toBeVisible();
});

test('shows company marks for runtime adapters on the packages page', async ({ page }) => {
  await page.goto(toPublicPath('/packages/'));

  const runtimeAdapters = page.locator('section[aria-labelledby="adapter-packages-title"]');

  await expect(runtimeAdapters.getByAltText('Anthropic company logo')).toHaveCount(2);
  await expect(runtimeAdapters.getByAltText('OpenAI company logo')).toHaveCount(2);
  await expect(runtimeAdapters.getByRole('img', { name: 'Custom adapter icon' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Website Foundations' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /@moldea.ai\/website-ui/ })).toHaveCount(0);
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

test('uses branded action states in both themes and respects reduced motion', async ({ page }) => {
  await page.goto(toPublicPath('/'));

  const primaryAction = page.getByRole('link', { name: 'Explore packages' });
  const outlineAction = page.getByRole('link', { name: 'Source', exact: true });
  const inlineAction = page.getByRole('link', { name: 'View all packages' });
  const lightPrimaryBackground = await primaryAction.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  const lightOutlineBackground = await outlineAction.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  await primaryAction.hover();
  await expect
    .poll(() => primaryAction.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(lightPrimaryBackground);

  await outlineAction.hover();
  await expect
    .poll(() => outlineAction.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(lightOutlineBackground);

  const primaryActionBounds = await primaryAction.boundingBox();

  if (primaryActionBounds === null) {
    throw new Error('The primary action bounds could not be resolved.');
  }

  await page.mouse.move(
    primaryActionBounds.x + primaryActionBounds.width / 2,
    primaryActionBounds.y + primaryActionBounds.height / 2,
  );
  await page.mouse.down();
  await expect
    .poll(() => primaryAction.evaluate((element) => getComputedStyle(element).translate))
    .not.toBe('none');
  await page.mouse.move(0, 0);
  await page.mouse.up();

  await inlineAction.hover();
  await expect
    .poll(() => inlineAction.evaluate((element) => getComputedStyle(element).textDecorationLine))
    .toContain('underline');

  await inlineAction.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  expect(await inlineAction.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
    'none',
  );

  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const darkPrimaryBackground = await primaryAction.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  await primaryAction.hover();
  await expect
    .poll(() => primaryAction.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(darkPrimaryBackground);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await primaryAction.hover();
  await page.mouse.down();
  await expect(primaryAction).toHaveCSS('translate', 'none');
  await expect(primaryAction).toHaveCSS('transition-property', 'none');
  await page.mouse.move(0, 0);
  await page.mouse.up();
});

test('uses the branded input surface in light and dark themes', async ({ page }) => {
  await page.goto(toPublicPath('/search/'));

  const searchInput = page.getByRole('searchbox', { name: 'Search documentation' });
  await searchInput.blur();
  const lightInputStyles = await searchInput.evaluate((element) => {
    const styles = getComputedStyle(element);

    return {
      backgroundColor: styles.backgroundColor,
      borderTopWidth: styles.borderTopWidth,
      boxShadow: styles.boxShadow,
    };
  });

  expect(lightInputStyles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(lightInputStyles.borderTopWidth).toBe('1px');
  expect(lightInputStyles.boxShadow).not.toBe('none');

  await searchInput.focus();
  await expect(searchInput).toBeFocused();
  expect(await searchInput.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
    lightInputStyles.boxShadow,
  );

  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(
    await searchInput.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe('rgba(0, 0, 0, 0)');
});

test('focuses the search input on direct and client-side page loads', async ({ page }) => {
  const searchInput = page.getByRole('searchbox', { name: 'Search documentation' });

  await page.goto(toPublicPath('/search/'));
  await expect(searchInput).toBeFocused();

  await page.goto(toPublicPath('/'));
  await page.getByRole('link', { name: 'Search documentation' }).click();
  await page.waitForURL((url) => url.pathname === toPublicPath('/search/'));
  await expect(searchInput).toBeFocused();
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
