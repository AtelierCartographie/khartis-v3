import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  ZIP_PATH,
  waitForModal,
  waitForMap,
  createProject,
  freshStart,
  assertNoConsoleErrors
} from '../helpers';

test.describe('ZIP Import', () => {
  test('should import single-csv.zip', async ({ page }) => {
    test.slow();
    const errorTracker = await freshStart(page);

    const zipPath = join(ZIP_PATH, 'single-csv.zip');
    await createProject(page, zipPath, `ZIP single CSV ${Date.now()}`);
    await waitForMap(page);

    await expect(page.locator('.map-container').first()).toBeVisible();
    assertNoConsoleErrors(errorTracker, 'ZIP single CSV import');
  });

  test('should handle multiple-csv.zip and show file selection', async ({
    page
  }) => {
    await freshStart(page);

    const modal = await waitForModal(page);
    const zipPath = join(ZIP_PATH, 'multiple-csv.zip');

    await modal.locator('input[type="file"]').first().setInputFiles(zipPath);
    await page.waitForTimeout(5000);

    await expect(modal.locator('.bx--tile')).toBeVisible({ timeout: 15000 });
  });

  test('should import shapefile-complete.zip', async ({ page }) => {
    test.slow();
    const errorTracker = await freshStart(page);

    const zipPath = join(ZIP_PATH, 'shapefile-complete.zip');
    await createProject(page, zipPath, `ZIP shapefile ${Date.now()}`);
    await waitForMap(page);

    await expect(page.locator('.map-container').first()).toBeVisible();
    assertNoConsoleErrors(errorTracker, 'ZIP shapefile import');
  });
});
