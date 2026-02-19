import { expect, test } from '@playwright/test';

test('TC-URL-001: shows error notification for invalid URL', async ({
  page
}) => {
  await page.goto('/');

  const urlInput = page.getByRole('textbox', {
    name: /Lien vers un fichier|Online file/i
  });
  await urlInput.fill('https://example.invalid/missing.geojson');

  const loadButton = page
    .locator('#khartis-create-new-project')
    .getByRole('button', { name: /Load|Charger/i });

  await loadButton.waitFor({ state: 'visible' });
  await loadButton.click();

  await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 30000 });
});
