import { expect, test } from '@playwright/test';
import path from 'path';

const TEST_DATASETS_DIR = path.join(process.cwd(), 'tests-datasets');

test.describe.serial('TC-OSM-001: OSM basemap activation with GPS data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const modal = page.locator('[data-testid="create-project-modal"]');
    if (await modal.isVisible()) {
      await page.keyboard.press('Escape');
      await modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
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

  test.skip('activates OSM basemap when data has GPS coordinates', async ({
    page
  }) => {
    const gpsCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'sites-seveso-idf.csv'
    );

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(gpsCsvPath);

    await page.waitForTimeout(3000);

    const dataTab = page.locator('#khartis-data-tab');
    await expect(dataTab).toBeVisible();

    const gpsRadio = page.locator('input[type="radio"]').nth(1);
    if (await gpsRadio.isVisible()) {
      await gpsRadio.click({ force: true });
      await page.waitForTimeout(500);
    }

    const latSelect = page.locator('select').first();
    if (await latSelect.isVisible()) {
      await latSelect.selectOption({ label: 'Lat' });
    }

    const longSelect = page.locator('select').nth(1);
    if (await longSelect.isVisible()) {
      await longSelect.selectOption({ label: 'Long' });
    }

    await page.waitForTimeout(1000);

    const osmTab = page
      .locator('.basemap-tabs-wrapper')
      .getByRole('button', { name: /OSM/ });
    await osmTab.click({ force: true });

    await page.waitForTimeout(1000);

    await expect(
      page.getByText(/Coordonnées GPS requises|GPS Coordinates Required/i)
    ).not.toBeVisible({ timeout: 5000 });

    const addButton = page.getByRole('button', {
      name: /Ajouter au projet|Add to project/i
    });
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click({ force: true });

    await page.waitForTimeout(2000);

    await expect(page.getByText(/OpenStreetMap|OSM/i)).toBeVisible({
      timeout: 10000
    });
  });
});
