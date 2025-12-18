import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  GPKG_PATH,
  waitForMap,
  createProject,
  freshStart,
  assertNoConsoleErrors
} from '../helpers';

test.describe('GeoPackage Import', () => {
  test('should import compagnies-herault-l93.gpkg (Lambert-93 projection)', async ({
    page
  }) => {
    test.slow();
    const errorTracker = await freshStart(page);

    const gpkgPath = join(GPKG_PATH, 'compagnies-herault-l93.gpkg');
    await createProject(page, gpkgPath, `GPKG Herault ${Date.now()}`);
    await waitForMap(page);

    await expect(page.locator('.map-container').first()).toBeVisible();
    assertNoConsoleErrors(errorTracker, 'GeoPackage Lambert-93 import');
  });

  test.skip('should import ADE_4-0_GPKG_RGAF09UTM20_GLP.gpkg (Guadeloupe UTM20)', async ({
    page
  }) => {
    // Skip: 13MB file causes DuckDB thread exhaustion in test environment
    test.slow();
    const errorTracker = await freshStart(page);

    const gpkgPath = join(
      GPKG_PATH,
      'ADMIN-EXPRESS_4-0__GPKG_RGAF09UTM20_GLP_2025-12-05',
      'ADE_4-0_GPKG_RGAF09UTM20_GLP-ED2025-12-05.gpkg'
    );
    await createProject(page, gpkgPath, `GPKG Guadeloupe ${Date.now()}`);
    await waitForMap(page, 120000);

    await expect(page.locator('.map-container').first()).toBeVisible();
    assertNoConsoleErrors(errorTracker, 'GeoPackage Guadeloupe UTM20 import');
  });
});
