import { expect, test } from '@playwright/test';
import { uploadURL } from './helpers';

const TINY_GEO_PATH = 'geojson/tiny-geo-3features.geojson';

// Smoke test: after project creation from a geo file, the data tab is shown
test('TC-ENRICH-001: shows data tab after geo file upload', async ({
  page
}) => {
  await page.goto('/');
  await uploadURL(page, TINY_GEO_PATH);

  const dataTab = page.locator('#khartis-data-tab');
  await expect(dataTab).toBeVisible({ timeout: 30000 });
});
