import { expect, test } from '@playwright/test';

/**
 * The site with JavaScript disabled.
 *
 * Runs under the `no-javascript` Playwright project. Everything asserted here
 * must work without a single byte of client JS -- which is the whole premise
 * of the architecture, and the property most likely to be eroded quietly by a
 * future change.
 */

test('the homepage renders its content without JavaScript', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('h1')).toHaveText('Bryce DeCora');
  await expect(page.locator('h1')).toHaveCount(1);

  // Content, not just chrome.
  await expect(page.getByRole('heading', { name: 'The catalogue' })).toBeVisible();

  /*
   * The catalog is a visual treatment over an honest list, so every article
   * title is a real heading in source order whether or not anything renders
   * the cards as a tilted pile.
   */
  const cardHeadings = page.locator('.catalog-card h3');
  expect(await cardHeadings.count()).toBeGreaterThan(0);
  await expect(cardHeadings.first()).toBeVisible();
});

test('primary navigation works without JavaScript', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Writing' }).click();

  await expect(page).toHaveURL('/writing/');
  await expect(page.locator('h1')).toHaveText('Writing');
});

test('an article is fully readable without JavaScript', async ({ page }) => {
  await page.goto('/writing/');

  const firstArticle = page.locator('main h2 a').first();
  const title = await firstArticle.textContent();
  await firstArticle.click();

  await expect(page.locator('h1')).toHaveText(title!.trim());
  // The rendered Markdown body, not just the header.
  await expect(page.locator('article .prose p').first()).toBeVisible();
});

test('breadcrumbs match the structured data trail', async ({ page }) => {
  await page.goto('/writing/when-an-ai-appointment-setter-is-the-wrong-tool/');

  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('listitem');
  await expect(crumbs).toHaveCount(3); // Home / Writing / <title>

  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  const graph = JSON.parse(jsonLd!)['@graph'] as Array<Record<string, unknown>>;
  const breadcrumb = graph.find((node) => node['@type'] === 'BreadcrumbList');

  expect(breadcrumb, 'no BreadcrumbList in the graph').toBeDefined();
  expect((breadcrumb!['itemListElement'] as unknown[]).length).toBe(3);
});

test('the skip link is reachable by keyboard and targets main', async ({ page }) => {
  await page.goto('/');

  await page.keyboard.press('Tab');

  const focused = page.locator(':focus');
  await expect(focused).toHaveText('Skip to content');
  await expect(focused).toHaveAttribute('href', '#main');
  await expect(page.locator('main#main')).toHaveCount(1);
});

test('scripts are limited to the known set, on every path', async ({ page }) => {
  /*
   * The budget in tests/seo/javascript.spec.ts is a ceiling of three. This is
   * the per-path assertion that stops it becoming an allowance: every page
   * carries the theme bootstrap, the widget callout, and -- when an account is
   * configured -- the CloseBot widget, and nothing else. A fourth script
   * anywhere fails HERE.
   *
   * The homepage used to be the exception, carrying "CLOCK TOOL 1.1" as a
   * fourth. With the clock gone there is no exception left, and every path is
   * now held to the same count.
   *
   * WHY THE EXPECTED NUMBER IS DERIVED RATHER THAN LITERAL. The widget renders
   * only when CLOSEBOT_SOURCE is set at build time, so a contributor or a fork
   * building without that variable legitimately ships two scripts, not three.
   * Hard-coding 3 would fail their checkout for doing nothing wrong, and the
   * usual reflex -- relaxing it to `toBeLessThanOrEqual(3)` -- would quietly
   * stop catching a third script that is not one of ours. Deriving the
   * expectation from whether the widget is present keeps the assertion exact
   * in both cases.
   */
  const scripts = page.locator('script:not([type="application/ld+json"])');
  const widget = page.locator('script[src*="closebot.com"]');

  for (const path of ['/', '/about/', '/writing/', '/writing/when-an-ai-appointment-setter-is-the-wrong-tool/']) {
    await page.goto(path);

    // The theme bootstrap and the widget callout are unconditional.
    const expected = 2 + (await widget.count());

    expect(
      await scripts.count(),
      `${path} ships an unexpected number of script tags; expected the theme ` +
        'bootstrap, the widget callout, and the CloseBot widget if configured',
    ).toBe(expected);

    expect(expected, `${path} exceeds the three-script budget`).toBeLessThanOrEqual(3);
  }
});

test('the only third-party script is the CloseBot widget', async ({ page }) => {
  /*
   * A named allowlist rather than a count. This is what actually stops an
   * analytics tag or a font CDN appearing later: a new third-party origin fails
   * even if the total script count happens to stay the same.
   */
  await page.goto('/');

  const external = await page
    .locator('script[src^="http"]')
    .evaluateAll((nodes) =>
      nodes.map((n) => new URL((n as HTMLScriptElement).src).origin),
    );

  for (const origin of external) {
    expect(origin, `unexpected third-party script origin: ${origin}`).toBe(
      'https://api.closebot.com',
    );
  }
});

test('the CloseBot send button ends up with an accessible name', async ({ page }, testInfo) => {
  /*
   * The widget ships `button.cb-send` unlabelled, which Lighthouse flags as
   * `button-name` and which alone drops the accessibility score below the 0.95
   * floor. The bootstrap in BaseLayout.astro patches it (see the long note
   * there; the real fix belongs in cb.js).
   *
   * This test exists because that patch is selector-coupled to someone else's
   * markup. If the widget renames the class, the patch silently stops working
   * and the score quietly regresses -- unless this fails first.
   */
  test.skip(testInfo.project.name === 'no-javascript', 'the widget needs JavaScript to render');

  await page.goto('/');

  const send = page.locator('.cb-send');
  try {
    await send.first().waitFor({ state: 'attached', timeout: 15000 });
  } catch {
    /*
     * Third-party, over the network. Not reaching it is an environment problem,
     * not a regression in this repo, so do not fail the suite for it.
     */
    test.skip(true, 'CloseBot widget did not load; nothing to assert');
    return;
  }

  const name = await send.first().evaluate(
    (el) => el.getAttribute('aria-label') || el.textContent?.trim() || '',
  );
  expect(name, '.cb-send has no accessible name; the bootstrap patch is not reaching it').not.toBe(
    '',
  );
});

test('the theme toggle is hidden without JavaScript, and persists with it', async (
  { page },
  testInfo,
) => {
  await page.goto('/');
  const toggle = page.locator('#theme-toggle');
  const html = page.locator('html');

  if (testInfo.project.name === 'no-javascript') {
    /*
     * A control that cannot work must not be offered. Without JS the theme
     * still follows prefers-color-scheme -- it just cannot be overridden.
     */
    await expect(toggle).toBeHidden();
    return;
  }

  await expect(toggle).toBeVisible();

  const before = await html.getAttribute('data-theme');
  const widthBefore = (await toggle.boundingBox())!.width;

  await toggle.click();
  const after = await html.getAttribute('data-theme');

  expect(after, 'clicking the toggle did not change the theme').not.toBe(before);
  expect(['light', 'dark']).toContain(after);

  /*
   * The label names the theme the button switches TO, so it alternates between
   * two strings of different widths. Sized to the current label, the button
   * resized on every click and shoved the rest of the header row sideways --
   * a user-triggered layout shift, on a sticky element, on every page.
   *
   * ThemeToggle.astro pins the width to the wider label with an invisible
   * sizer. This is the assertion that keeps it pinned.
   */
  const widthAfter = (await toggle.boundingBox())!.width;
  expect(widthAfter, 'the toggle changed width when clicked; the header row will shift').toBe(
    widthBefore,
  );

  /*
   * The reason this needed JavaScript at all. A CSS-only toggle cannot remember
   * a choice across a navigation on a static multi-page site, so if this
   * assertion ever fails the script has stopped earning its place in the budget.
   */
  await page.goto('/about/');
  await expect(html).toHaveAttribute('data-theme', after!);
});

test('the card catalog sifts with JavaScript disabled', async ({ page }) => {
  /*
   * The whole justification for building the filter in CSS is that it works
   * without hydration. This asserts that claim in the `no-javascript` project,
   * where nothing can quietly rescue it.
   */
  await page.goto('/writing/');

  const cards = page.locator('.catalog-card');
  const total = await cards.count();
  expect(total, 'no cards to sift').toBeGreaterThan(1);

  // Resting state: the whole pile is visible.
  await expect(cards).toHaveCount(total);
  for (let i = 0; i < total; i += 1) {
    await expect(cards.nth(i)).toBeVisible();
  }

  // Pull a drawer. Labels are the visible control; the radio is sr-only.
  const drawer = page.locator('.catalog-tab').nth(1);
  const drawerName = (await drawer.textContent())!.trim();
  await drawer.click();

  const visible = page.locator('.catalog-card:visible');
  const remaining = await visible.count();

  expect(remaining, `"${drawerName}" hid everything`).toBeGreaterThan(0);
  expect(remaining, `"${drawerName}" hid nothing`).toBeLessThan(total);

  // Every surviving card actually carries the chosen topic.
  const topic = await page.locator('.catalog-radio:checked').getAttribute('value');
  for (let i = 0; i < remaining; i += 1) {
    await expect(visible.nth(i)).toHaveAttribute('data-topics', new RegExp(`\\b${topic}\\b`));
  }

  // And the stack squares up — the angle is the whole visual payoff.
  await expect(visible.first()).toHaveCSS('rotate', '0deg');
});
