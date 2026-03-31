import { expect, test } from '@playwright/test';
import { uploadURL } from './helpers';

const FOSSIL_CSV_PATH = 'csv/fossil-fuel-subsidies-gdp-2021.csv';

// Smoke test: after project creation, "Add files" button is available
test.describe
  .serial('TC-JOIN-SECOND-001: add-files button available after CSV project creation', () => {
  test('shows Ajouter des fichiers button after project is created from CSV', async ({
    page
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await uploadURL(page, FOSSIL_CSV_PATH);

    const addFilesButton = page.getByRole('button', {
      name: /Ajouter des fichiers|Add files/i
    });
    await expect(addFilesButton).toBeVisible({ timeout: 30000 });
  });
});
