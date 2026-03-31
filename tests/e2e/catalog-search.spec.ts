import { expect, test } from '@playwright/test';
import {
  goToJoinStep,
  selectGeolocationLinkedVariable,
  uploadURL
} from './helpers';

const FOSSIL_CSV_PATH = 'csv/fossil-fuel-subsidies-gdp-2021.csv';

// Smoke test: catalog loads with suggestions and other basemaps sections
test('TC-CATALOG-001: catalog shows suggestions and other basemaps', async ({
  page
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await uploadURL(page, FOSSIL_CSV_PATH);
  await selectGeolocationLinkedVariable(page, /Code/i);
  await goToJoinStep(page);

  await page.waitForTimeout(2000);

  const basemapStep = page.locator('#basemap-join-step');

  const catalogTab = basemapStep
    .getByRole('button', { name: /Catalogue|Catalog/i })
    .first();
  await expect(catalogTab).toBeVisible({ timeout: 10000 });
  await catalogTab.click();

  const suggestionsSection = basemapStep
    .getByText(/Suggestion|suggestion/i)
    .first();
  await expect(suggestionsSection).toBeVisible({ timeout: 10000 });

  const otherSection = basemapStep
    .getByText(/Autre|Other|Autres fonds/i)
    .first();
  await expect(otherSection).toBeVisible({ timeout: 5000 });
});
