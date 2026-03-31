import { expect, test } from '@playwright/test';
import { uploadURL } from './helpers';

const FOSSIL_CSV_PATH = 'csv/fossil-fuel-subsidies-gdp-2021.csv';
const SEVESO_CSV_PATH = 'csv/sites-seveso-idf.csv';

// Smoke test: after uploading a tabular CSV, the data tab is shown
test('TC-OSM-001: shows data tab after tabular CSV upload', async ({
  page
}) => {
  await page.goto('/');
  await uploadURL(page, FOSSIL_CSV_PATH);

  const dataTab = page.locator('#khartis-data-tab');
  await expect(dataTab).toBeVisible({ timeout: 30000 });
});

// Smoke test: after uploading a GPS CSV, the data tab is shown
test('TC-OSM-002: shows data tab after GPS CSV upload', async ({ page }) => {
  await page.goto('/');
  await uploadURL(page, SEVESO_CSV_PATH);

  const dataTab = page.locator('#khartis-data-tab');
  await expect(dataTab).toBeVisible({ timeout: 30000 });
});
