import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  ZIP_PATH,
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

  test('should handle multiple-csv.zip and process first file', async ({
    page
  }) => {
    test.slow();
    const errorTracker = await freshStart(page);

    const zipPath = join(ZIP_PATH, 'multiple-csv.zip');
    await createProject(page, zipPath, `ZIP multiple CSV ${Date.now()}`);
    await waitForMap(page);

    await expect(page.locator('.map-container').first()).toBeVisible();
    assertNoConsoleErrors(errorTracker, 'ZIP multiple CSV import');
  });

  // Note: shapefile-complete.zip is already tested in shapefile.spec.ts
});
