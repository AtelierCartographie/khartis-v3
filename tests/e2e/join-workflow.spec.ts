import { expect, test } from '@playwright/test';
import { uploadURL } from './helpers';

const FOSSIL_CSV_PATH = 'csv/fossil-fuel-subsidies-gdp-2021.csv';

test.describe
  .serial('TC-JOIN-001: Workflow tabulaire affiche 3 sections', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('affiche les sections Contrôler, Géolocaliser, Joindre pour dataset tabulaire', async ({
    page
  }) => {
    await uploadURL(page, FOSSIL_CSV_PATH);

    await page.waitForTimeout(2000);

    const dataTab = page.locator('#khartis-data-tab');
    await expect(dataTab).toBeVisible();

    await expect(
      page
        .locator('.bx--progress-step-button')
        .filter({ hasText: /Contrôler|Control/i })
        .first()
    ).toBeVisible();
    await expect(
      page
        .locator('.bx--progress-step-button')
        .filter({ hasText: /Géolocaliser|Geolocate/i })
        .first()
    ).toBeVisible();
    await expect(
      page
        .locator('.bx--progress-step-button')
        .filter({ hasText: /Joindre|Join/i })
        .first()
    ).toBeVisible();
  });
});
