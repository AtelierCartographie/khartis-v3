import { expect, test } from '@playwright/test';
import path from 'path';

const TEST_DATASETS_DIR = path.join(process.cwd(), 'tests-datasets');

test.describe('TC-SHP-001: Incomplete shapefile upload', () => {
  test('shows error when uploading only .shp file without .shx/.dbf', async ({
    page
  }) => {
    const incompleteShpPath = path.join(
      TEST_DATASETS_DIR,
      'shp-incomplete',
      'ne_50m_admin_0_countries_lakes.shp'
    );

    await page.goto('/');

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(incompleteShpPath);

    await page.waitForTimeout(2000);

    const incompleteTile = page
      .getByTestId('tab-content')
      .getByTestId('file-incomplete');
    await expect(incompleteTile).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByText(/Incomplete shapefile|Shapefile incomplet/i).first()
    ).toBeVisible();

    await expect(incompleteTile.getByText('.shx')).toBeVisible();
    await expect(incompleteTile.getByText('.dbf')).toBeVisible();
  });

  test('shows .shp as present and .shx/.dbf as missing in component list', async ({
    page
  }) => {
    const incompleteShpPath = path.join(
      TEST_DATASETS_DIR,
      'shp-incomplete',
      'ne_50m_admin_0_countries_lakes.shp'
    );

    await page.goto('/');

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(incompleteShpPath);

    await page.waitForTimeout(2000);

    const incompleteTile = page
      .getByTestId('tab-content')
      .getByTestId('file-incomplete');
    await expect(incompleteTile).toBeVisible({ timeout: 10000 });

    const shapefileComponents = incompleteTile.locator('.shapefile-components');
    await expect(shapefileComponents).toBeVisible();

    await expect(incompleteTile.getByText('.shp')).toBeVisible();
    await expect(incompleteTile.getByText('.shx')).toBeVisible();
    await expect(incompleteTile.getByText('.dbf')).toBeVisible();
  });
});
