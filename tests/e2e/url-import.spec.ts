import { expect, test } from '@playwright/test';

test('TC-URL-001: shows error notification for invalid URL', async ({
  page
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const urlInput = page.getByRole('textbox', {
    name: /Lien vers un fichier|Online file/i
  });
  await expect(urlInput).toBeVisible({ timeout: 15000 });
  await urlInput.fill('https://example.invalid/missing.geojson');

  // Wait for the 300ms debounce on URL validation to fire
  await page.waitForTimeout(500);

  const loadButton = page
    .locator('#khartis-create-new-project')
    .getByRole('button', { name: /Load|Charger/i });

  await loadButton.waitFor({ state: 'visible' });
  await expect(loadButton).toBeEnabled({ timeout: 5000 });
  await loadButton.click();

  await expect(
    page
      .getByRole('alert')
      .or(page.locator('.bx--inline-notification--error'))
      .first()
  ).toBeVisible({ timeout: 30000 });
});
