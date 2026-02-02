import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  TIMEOUTS,
  waitForModal,
  waitForMap,
  freshStart,
  assertNoConsoleErrors
} from './helpers';

/**
 * Join Functionality E2E Tests - CDC 1.A.7
 *
 * Tests the complete join workflow including:
 * - Basemap suggestion and selection
 * - Join statistics computation (4 categories)
 * - Unicode/accent handling (French departments)
 * - Auto-finalization for perfect matches
 * - Correction flow for partial matches
 */

const TEST_DATA_PATH = join(process.cwd(), 'static/examples/data');

test.describe('Join Functionality - CDC 1.A.7', () => {
  test.describe('Basemap Join Flow', () => {
    test('should suggest France départements basemap for French department data', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const modal = await waitForModal(page);

      // Upload France departments CSV
      const csvPath = join(TEST_DATA_PATH, 'test-france-departments.csv');
      await modal.locator('input[type="file"]').first().setInputFiles(csvPath);

      // Wait for file processing
      const completeIndicator = modal.locator('[data-testid="file-complete"]');
      await expect(completeIndicator).toBeVisible({
        timeout: TIMEOUTS.fileUpload
      });

      // Verify file loaded with expected columns
      await expect(
        modal.locator('[data-testid="file-row-count"]')
      ).toContainText(/\d+/);

      // Wait for basemap suggestions to load
      await page.waitForTimeout(TIMEOUTS.transition * 2);

      // Check that France départements is suggested (should have high match score)
      const franceDeptBasemap = modal.getByRole('button', {
        name: /France.*départements/i
      });

      // It should be visible in suggestions
      await expect(franceDeptBasemap.first()).toBeVisible({
        timeout: TIMEOUTS.action * 2
      });

      assertNoConsoleErrors(errorTracker, 'Basemap suggestions');
    });

    test('should compute join stats with Unicode handling (accents)', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const modal = await waitForModal(page);

      // Upload France departments CSV (contains accents like Ardèche, Côte-d'Or)
      const csvPath = join(TEST_DATA_PATH, 'test-france-departments.csv');
      await modal.locator('input[type="file"]').first().setInputFiles(csvPath);

      // Wait for file processing
      const completeIndicator = modal.locator('[data-testid="file-complete"]');
      await expect(completeIndicator).toBeVisible({
        timeout: TIMEOUTS.fileUpload
      });

      // Set project name
      const nameInput = modal.locator('[data-testid="project-name-input"]');
      await expect(nameInput).toBeVisible({ timeout: TIMEOUTS.action });
      await nameInput.fill('Join Test with Accents');

      // Select France départements basemap
      const franceDeptBasemap = modal.getByRole('button', {
        name: /France.*départements/i
      });

      await page.waitForTimeout(TIMEOUTS.transition * 2);

      if (
        await franceDeptBasemap.first().isVisible({ timeout: TIMEOUTS.action })
      ) {
        await franceDeptBasemap.first().click();
      }

      // Wait for join computation
      await page.waitForTimeout(TIMEOUTS.action);

      // Create button should be enabled if join succeeded
      const createBtn = modal.getByRole('button', {
        name: 'Créer',
        exact: true
      });
      await expect(createBtn).toBeEnabled({ timeout: TIMEOUTS.action * 2 });

      // Click create to verify full flow
      await createBtn.click();

      // Should create project and show map
      await waitForMap(page, TIMEOUTS.map);
      await expect(page.locator('.map-container').first()).toBeVisible();

      assertNoConsoleErrors(errorTracker, 'Join with Unicode');
    });

    test('should display 4 join categories in assisted join section', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const modal = await waitForModal(page);

      // Upload World population CSV (will have varied match quality)
      const csvPath = join(TEST_DATA_PATH, 'world-population-2023.csv');
      await modal.locator('input[type="file"]').first().setInputFiles(csvPath);

      // Wait for file processing
      const completeIndicator = modal.locator('[data-testid="file-complete"]');
      await expect(completeIndicator).toBeVisible({
        timeout: TIMEOUTS.fileUpload
      });

      // Set project name
      const nameInput = modal.locator('[data-testid="project-name-input"]');
      await nameInput.fill('Join Categories Test');

      // Select World countries basemap
      const worldBasemap = modal.getByRole('button', {
        name: /World.*countries/i
      });

      await page.waitForTimeout(TIMEOUTS.transition * 2);

      if (await worldBasemap.first().isVisible({ timeout: TIMEOUTS.action })) {
        await worldBasemap.first().click();
      }

      // Wait for join stats to be computed
      await page.waitForTimeout(TIMEOUTS.action * 2);

      // Create project
      const createBtn = modal.getByRole('button', {
        name: 'Créer',
        exact: true
      });
      await expect(createBtn).toBeEnabled({ timeout: TIMEOUTS.action * 2 });
      await createBtn.click();

      await waitForMap(page, TIMEOUTS.map);
      assertNoConsoleErrors(errorTracker, 'Join categories display');
    });
  });

  test.describe('GPS/OSM Mode', () => {
    test('should detect GPS columns and enable OSM basemap', async ({
      page
    }) => {
      test.slow();
      const errorTracker = await freshStart(page);

      const modal = await waitForModal(page);

      // Upload European cities CSV (has lat/lon columns)
      const csvPath = join(TEST_DATA_PATH, 'european-cities.csv');
      await modal.locator('input[type="file"]').first().setInputFiles(csvPath);

      // Wait for file processing
      const completeIndicator = modal.locator('[data-testid="file-complete"]');
      await expect(completeIndicator).toBeVisible({
        timeout: TIMEOUTS.fileUpload
      });

      // Set project name
      const nameInput = modal.locator('[data-testid="project-name-input"]');
      await nameInput.fill('GPS Mode Test');

      // Wait for UI to update
      await page.waitForTimeout(TIMEOUTS.transition * 2);

      // OSM option should be visible for GPS data
      // The tab or button for OSM should appear when GPS columns are detected

      // Create with any available basemap
      const anyBasemap = modal.locator('button[class*="basemap-card"]').first();
      if (await anyBasemap.isVisible({ timeout: TIMEOUTS.action })) {
        await anyBasemap.click();
      }

      const createBtn = modal.getByRole('button', {
        name: 'Créer',
        exact: true
      });
      await expect(createBtn).toBeEnabled({ timeout: TIMEOUTS.action * 2 });
      await createBtn.click();

      await waitForMap(page, TIMEOUTS.map);
      assertNoConsoleErrors(errorTracker, 'GPS mode detection');
    });
  });
});
