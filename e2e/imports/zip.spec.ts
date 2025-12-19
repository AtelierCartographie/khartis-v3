import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  ZIP_PATH,
  TIMEOUTS,
  waitForMap,
  waitForModal,
  createProject,
  freshStart,
  assertNoConsoleErrors,
  assertFileImported
} from '../helpers';

test.describe('ZIP Import', () => {
  test('should import single-csv.zip', async ({ page }) => {
    test.slow();
    const errorTracker = await freshStart(page);

    const zipPath = join(ZIP_PATH, 'single-csv.zip');
    await createProject(page, zipPath, {
      projectName: `ZIP single CSV ${Date.now()}`,
      fileAssertions: { minRows: 10, minColumns: 3 }
    });
    await waitForMap(page);

    await expect(page.locator('.map-container').first()).toBeVisible();
    assertNoConsoleErrors(errorTracker, 'ZIP single CSV import');
  });

  test('should import all files from multiple-csv.zip', async ({ page }) => {
    test.slow();
    const errorTracker = await freshStart(page);

    const modal = await waitForModal(page);
    const zipPath = join(ZIP_PATH, 'multiple-csv.zip');

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(zipPath);

    // Wait for file processing to start
    const processingIndicator = modal.locator(
      '[data-testid="file-processing"]'
    );
    const completeIndicators = modal.locator('[data-testid="file-complete"]');

    await expect(
      processingIndicator.or(completeIndicators.first())
    ).toBeVisible({ timeout: 15000 });

    // Wait for all processing to complete
    await expect(processingIndicator).toBeHidden({ timeout: 75000 });

    // Verify multiple files were imported (multiple-csv.zip contains 2 CSV files)
    const fileCount = await completeIndicators.count();
    expect(fileCount).toBeGreaterThanOrEqual(2);

    // Validate file import for each extracted file
    await assertFileImported(modal, { minRows: 1, minColumns: 1 });

    // Fill project name
    const nameInput = modal.locator('[data-testid="project-name-input"]');
    await expect(nameInput).toBeVisible({ timeout: TIMEOUTS.action });
    await nameInput.fill(`ZIP multiple CSV ${Date.now()}`);

    // Select basemap
    const worldBasemap = modal.getByRole('button', {
      name: /World.*countries/i
    });
    const anyBasemap = modal.locator(
      'button[class*="basemap-card"], button:has-text("France > régions")'
    );

    await page.waitForTimeout(500);

    if (await worldBasemap.first().isVisible({ timeout: TIMEOUTS.action })) {
      await worldBasemap.first().click();
    } else if (
      await anyBasemap.first().isVisible({ timeout: TIMEOUTS.action })
    ) {
      await anyBasemap.first().click();
    }

    await page.waitForTimeout(500);

    const createBtn = modal.getByRole('button', { name: 'Créer', exact: true });
    await expect(createBtn).toBeEnabled({ timeout: TIMEOUTS.action * 2 });
    await createBtn.click();

    await expect(modal).toBeHidden({ timeout: TIMEOUTS.action * 4 });
    await waitForMap(page);

    await expect(page.locator('.map-container').first()).toBeVisible();
    assertNoConsoleErrors(errorTracker, 'ZIP multiple CSV import');
  });

  // Note: shapefile-complete.zip is already tested in shapefile.spec.ts
});
