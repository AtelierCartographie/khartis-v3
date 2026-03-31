import { expect, test } from '@playwright/test';

// Smoke test: create-project modal opens and has a URL input
test('TC-CATALOG-001: create project modal is functional on load', async ({
  page
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const createProjectModal = page.getByTestId('create-project-modal');
  await expect(createProjectModal).toBeVisible({ timeout: 30000 });

  // URL input is accessible for online file loading
  const urlInput = createProjectModal.locator('input[placeholder^="https"]').first();
  await expect(urlInput).toBeVisible({ timeout: 10000 });
});
