import { expect, test } from '@playwright/test';

/**
 * Ornament must not occupy a phone screen.
 *
 * THE FAILURE THIS EXISTS FOR, and it is not hypothetical: the widget callout
 * is a 272x150 panel, and that size does not shrink with the viewport --
 * `min(17rem, ...)` resolves to 17rem on anything wider than a watch. On a
 * 390px phone it covered 70% of the width and 12% of the whole screen, parked
 * over the topic filters, the first card and the opening paragraph of every
 * article. It shipped that way and nothing noticed, because every check in this
 * repo either reads the build manifest -- which has no viewport -- or runs at a
 * desktop size.
 *
 * The callout is forced visible here rather than waited for. Its reveal is
 * driven by the third-party widget appearing, and that would make this test a
 * test of CloseBot's uptime. What is being asserted is the CSS rule, so the
 * widget is cut out of the question entirely.
 */

/** The iPhone 12 viewport, and a small Android, as the two realistic floors. */
const PHONES = [
  { label: 'iPhone 12', width: 390, height: 844 },
  { label: 'small Android', width: 360, height: 740 },
];

/** Reveal the callout the way its own script would, minus the widget. */
async function revealCallout(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    localStorage.removeItem('widget-callout-dismissed');
    const el = document.getElementById('widget-callout');
    if (el) el.hidden = false;
  });
}

for (const phone of PHONES) {
  test(`the widget callout is not rendered on a ${phone.label}`, async ({ page }) => {
    await page.setViewportSize({ width: phone.width, height: phone.height });
    await page.goto('/writing/');

    const callout = page.locator('#widget-callout');
    await expect(callout).toHaveCount(1); // it is in the HTML, just not painted

    await revealCallout(page);

    await expect(
      callout,
      'the callout covers ~12% of a phone screen; it is desktop-only on purpose',
    ).toBeHidden();
  });
}

test('the widget callout still appears on a desktop viewport', async ({ page }) => {
  /*
   * The other half of the rule. Without this, deleting the component entirely
   * would also make the tests above pass, and the mobile assertion would stop
   * meaning "hidden on phones" and start meaning "gone".
   */
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/writing/');

  await revealCallout(page);

  await expect(page.locator('#widget-callout')).toBeVisible();
});
