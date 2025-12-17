import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  CSV_PATH,
  waitForModal,
  waitForMap,
  createProject,
  freshStart,
  assertNoConsoleErrors
} from '../helpers';

test.describe('CSV Import', () => {
  test.describe('Valid CSV files', () => {
    test('should import fossil-fuel-subsidies-gdp-2021.csv', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
      await createProject(page, csvPath, `CSV fossil-fuel ${Date.now()}`);
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'fossil-fuel-subsidies CSV import');
    });

    test('should import naissances-par-commune-departement-et-region-2018.csv (large file)', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const csvPath = join(
        CSV_PATH,
        'naissances-par-commune-departement-et-region-2018.csv'
      );
      await createProject(page, csvPath, `CSV naissances ${Date.now()}`);
      await waitForMap(page, 90000);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'naissances CSV import');
    });

    test('should import world-bank-rural-pop.csv', async ({ page }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const csvPath = join(CSV_PATH, 'world-bank-rural-pop.csv');
      await createProject(page, csvPath, `CSV world-bank ${Date.now()}`);
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'world-bank CSV import');
    });

    test('should import sites-seveso-idf.csv', async ({ page }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const csvPath = join(CSV_PATH, 'sites-seveso-idf.csv');
      await createProject(page, csvPath, `CSV seveso ${Date.now()}`);
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'sites-seveso CSV import');
    });
  });

  test.describe('Edge case CSV files', () => {
    test('should handle csv-malformed--with-100-columns.csv', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const csvPath = join(CSV_PATH, 'csv-malformed--with-100-columns.csv');
      await createProject(page, csvPath, `CSV 100cols ${Date.now()}`);
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'CSV with 100 columns');
    });

    test('should handle csv-malformed--with-duplicated-column-name.csv', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const csvPath = join(
        CSV_PATH,
        'csv-malformed--with-duplicated-column-name.csv'
      );
      await createProject(page, csvPath, `CSV dupcol ${Date.now()}`);
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'CSV with duplicated column names');
    });

    test('should handle csv-malformed--with-empty-columns.csv', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const csvPath = join(CSV_PATH, 'csv-malformed--with-empty-columns.csv');
      await createProject(page, csvPath, `CSV emptycol ${Date.now()}`);
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'CSV with empty columns');
    });

    test('should handle csv-malformed--with-empty-lines.csv', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const csvPath = join(CSV_PATH, 'csv-malformed--with-empty-lines.csv');
      await createProject(page, csvPath, `CSV emptylines ${Date.now()}`);
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'CSV with empty lines');
    });

    test('should handle csv-malformed--with-european-numeric-format.csv', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const csvPath = join(
        CSV_PATH,
        'csv-malformed--with-european-numeric-format.csv'
      );
      await createProject(page, csvPath, `CSV euronum ${Date.now()}`);
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'CSV with European numeric format');
    });

    test('should handle csv-malformed--with-special-characters.csv', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const csvPath = join(
        CSV_PATH,
        'csv-malformed--with-special-characters.csv'
      );
      await createProject(page, csvPath, `CSV special ${Date.now()}`);
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'CSV with special characters');
    });

    test('should handle csv-malformed--with-null-variations.csv', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const csvPath = join(CSV_PATH, 'csv-malformed--with-null-variations.csv');
      await createProject(page, csvPath, `CSV nulls ${Date.now()}`);
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'CSV with null variations');
    });

    test('should handle csv-malformed--with-numeric-all-edge-cases.csv', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const csvPath = join(
        CSV_PATH,
        'csv-malformed--with-numeric-all-edge-cases.csv'
      );
      await createProject(page, csvPath, `CSV numedge ${Date.now()}`);
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'CSV with numeric edge cases');
    });

    test('should handle csv-malformed--with-numeric-formats-mixed.csv', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const csvPath = join(
        CSV_PATH,
        'csv-malformed--with-numeric-formats-mixed.csv'
      );
      await createProject(page, csvPath, `CSV nummix ${Date.now()}`);
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'CSV with mixed numeric formats');
    });
  });

  test.describe('Error handling CSV files', () => {
    test('should reject csv-malformed--with-nothing.csv (empty file)', async ({
      page
    }) => {
      await freshStart(page);

      const modal = await waitForModal(page);
      const csvPath = join(CSV_PATH, 'csv-malformed--with-nothing.csv');

      await modal.locator('input[type="file"]').first().setInputFiles(csvPath);
      await page.waitForTimeout(3000);

      const createBtn = modal.getByRole('button', {
        name: 'Créer',
        exact: true
      });
      await expect(createBtn).toBeDisabled();
    });

    test('should handle csv-malformed--with-header-only.csv', async ({
      page
    }) => {
      await freshStart(page);

      const modal = await waitForModal(page);
      const csvPath = join(CSV_PATH, 'csv-malformed--with-header-only.csv');

      await modal.locator('input[type="file"]').first().setInputFiles(csvPath);
      await page.waitForTimeout(3000);

      const createBtn = modal.getByRole('button', {
        name: 'Créer',
        exact: true
      });
      await expect(createBtn).toBeDisabled();
    });

    test('should handle csv-malformed--with-no-header.csv', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const csvPath = join(CSV_PATH, 'csv-malformed--with-no-header.csv');
      await createProject(page, csvPath, `CSV noheader ${Date.now()}`);
      await waitForMap(page);

      await expect(page.locator('.map-container').first()).toBeVisible();
      assertNoConsoleErrors(errorTracker, 'CSV with no header');
    });
  });
});
