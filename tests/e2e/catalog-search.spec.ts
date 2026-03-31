import { expect, test } from '@playwright/test';

// Smoke test: on load the URL input for online file loading is accessible
test('TC-CATALOG-001: create project modal is functional on load', async ({
  page
}) => {
  await page.goto('/');

  // The URL input for online file loading is the primary signal that the
  // create-project modal is ready — check it directly rather than the modal wrapper
  const urlInput = page.locator('input[placeholder^="https"]').first();
  await expect(urlInput).toBeVisible({ timeout: 30000 });
});
