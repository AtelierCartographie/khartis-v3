import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  GEOJSON_PATH,
  waitForMap,
  createProject,
  freshStart,
  assertNoConsoleErrors
} from '../helpers';

test.describe('GeoJSON Import', () => {
  test('should import nuts2_data.geojson', async ({ page }) => {
    test.slow();
    const errorTracker = await freshStart(page);

    const geoPath = join(GEOJSON_PATH, 'nuts2_data.geojson');
    await createProject(page, geoPath, `GeoJSON NUTS2 ${Date.now()}`);
    await waitForMap(page);

    await expect(page.locator('.map-container').first()).toBeVisible();
    assertNoConsoleErrors(errorTracker, 'NUTS2 GeoJSON import');
  });

  test('should import lignes-du-reseau-star-de-rennes-metropole.geojson (large file with lines)', async ({
    page
  }) => {
    test.slow();
    const errorTracker = await freshStart(page);

    const geoPath = join(
      GEOJSON_PATH,
      'lignes-du-reseau-star-de-rennes-metropole.geojson'
    );
    await createProject(page, geoPath, `GeoJSON STAR ${Date.now()}`);
    await waitForMap(page, 90000);

    await expect(page.locator('.map-container').first()).toBeVisible();
    assertNoConsoleErrors(errorTracker, 'STAR lines GeoJSON import');
  });
});
