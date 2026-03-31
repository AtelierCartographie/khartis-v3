import { expect, test } from '@playwright/test';
import { uploadURL } from './helpers';

const FOSSIL_CSV_PATH = 'csv/fossil-fuel-subsidies-gdp-2021.csv';

// Smoke test: after project creation from CSV, the data tab is shown with step navigation
test.describe
  .serial('TC-JOIN-SECOND-001: data tab visible after CSV project creation', () => {
  test('shows data tab with step navigation after project is created from CSV', async ({
    page
  }) => {
    await page.goto('/');
    await uploadURL(page, FOSSIL_CSV_PATH);

    // After a CSV upload, the data tab (#khartis-data-tab) should be visible
    // with the geolocation/join workflow steps
    const dataTab = page.locator('#khartis-data-tab');
    await expect(dataTab).toBeVisible({ timeout: 30000 });
  });
});
