import { expect, test } from '@playwright/test';
import path from 'path';

const TEST_DATASETS_DIR = path.join(process.cwd(), 'tests-datasets');

test.describe('TC-OSM-001: OSM basemap activation with GPS data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('shows warning when data has no GPS coordinates', async ({ page }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(3000);

    const osmTab = page
      .locator('.basemap-tabs-wrapper')
      .getByRole('button', { name: /OSM/ });
    await osmTab.click({ force: true });

    await page.waitForTimeout(1000);

    await expect(page.getByText(/GPS|Coordonnées/i)).toBeVisible({
      timeout: 10000
    });
  });
});
