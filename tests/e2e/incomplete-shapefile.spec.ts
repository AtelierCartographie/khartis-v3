import { expect, test } from '@playwright/test';
import { uploadURL } from './helpers';

test('TC-SHP-001: shows error when uploading only .shp file without .shx/.dbf', async ({
  page
}) => {
  const incompleteShpPath = 'shp-incomplete/ne_50m_admin_0_countries_lakes.shp';

  await page.goto('/');
  await uploadURL(page, incompleteShpPath);

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
