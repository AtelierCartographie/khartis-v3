import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  GEOJSON_PATH,
  SHP_PATH,
  GPKG_PATH,
  createShapefileProject,
  createProject,
  freshStart,
  waitForMap
} from './helpers';

test.describe('Geographic File Import', () => {
  test('should import GeoJSON file with geometry', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const geojsonPath = join(GEOJSON_PATH, 'nuts2_data.geojson');
    await createProject(page, geojsonPath, {
      projectName: 'Test GeoJSON Import'
    });

    await waitForMap(page);

    // Verify map canvas is visible
    const mapCanvas = page.locator('.map-canvas').first();
    await expect(mapCanvas).toBeVisible();

    // Verify geometries are rendered
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });

  test('should import Shapefile with all components', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const shpPath = join(SHP_PATH, 'ne_50m/ne_50m_admin_0_countries_lakes.shp');
    await createShapefileProject(page, shpPath, {
      projectName: 'Test Shapefile Import'
    });

    await waitForMap(page);

    // Verify map canvas is visible
    const mapCanvas = page.locator('.map-canvas').first();
    await expect(mapCanvas).toBeVisible();
  });

  test('should import GeoPackage file', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const gpkgPath = join(GPKG_PATH, 'compagnies-herault-l93.gpkg');
    await createProject(page, gpkgPath, {
      projectName: 'Test GeoPackage Import'
    });

    await waitForMap(page);

    // Verify map canvas is visible
    const mapCanvas = page.locator('.map-canvas').first();
    await expect(mapCanvas).toBeVisible();
  });
});
