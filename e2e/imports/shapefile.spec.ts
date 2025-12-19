import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  SHP_PATH,
  ZIP_PATH,
  waitForMap,
  createProject,
  createShapefileProject,
  freshStart,
  assertNoConsoleErrors
} from '../helpers';

test.describe('Shapefile Import', () => {
  test.describe('Via ZIP archive', () => {
    test('should import shapefile-complete.zip', async ({ page }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const zipPath = join(ZIP_PATH, 'shapefile-complete.zip');
      await createProject(page, zipPath, {
        projectName: `SHP via ZIP ${Date.now()}`,
        fileAssertions: { minRows: 1, minColumns: 1 }
      });
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'Shapefile via ZIP import');
    });
  });

  test.describe('Direct shapefile folder (all components)', () => {
    test('should import ne_50m_admin_0_countries_lakes.shp (Natural Earth)', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const shpPath = join(
        SHP_PATH,
        'ne_50m',
        'ne_50m_admin_0_countries_lakes.shp'
      );
      await createShapefileProject(page, shpPath, {
        projectName: `SHP NaturalEarth ${Date.now()}`,
        fileAssertions: { minRows: 100, minColumns: 5 }
      });
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'Natural Earth shapefile import');
    });

    test('should import lignes-du-reseau-star-de-rennes-metropole.shp', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const shpPath = join(
        SHP_PATH,
        'lignes-du-reseau-star-de-rennes-metropole',
        'lignes-du-reseau-star-de-rennes-metropole.shp'
      );
      await createShapefileProject(page, shpPath, {
        projectName: `SHP STAR ${Date.now()}`,
        fileAssertions: { minRows: 10, minColumns: 2 }
      });
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'STAR shapefile import');
    });

    test.skip('should import mos_foncier_agrege_com.shp', async ({ page }) => {
      // Skip: 83MB file exceeds 50MB app limit, causes JSON.stringify RangeError
      test.slow();
      const errorTracker = await freshStart(page);

      const shpPath = join(
        SHP_PATH,
        'mos_foncier_agrege_com',
        'mos_foncier_agrege_com.shp'
      );
      await createShapefileProject(page, shpPath, {
        projectName: `SHP MOS ${Date.now()}`,
        fileAssertions: { minRows: 1000, minColumns: 5 }
      });
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'MOS foncier shapefile import');
    });

    test('should import EEZ_Land_v3_202030.shp (Marines regions)', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const shpPath = join(
        SHP_PATH,
        'Marines-regionsEEZ_land_union_v3_202003',
        'EEZ_Land_v3_202030.shp'
      );
      await createShapefileProject(page, shpPath, {
        projectName: `SHP Marines ${Date.now()}`,
        fileAssertions: { minRows: 100, minColumns: 5 }
      });
      await waitForMap(page, 120000);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'Marines EEZ shapefile import');
    });
  });
});
