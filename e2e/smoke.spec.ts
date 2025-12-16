import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  CSV_PATH,
  GEOJSON_PATH,
  ZIP_PATH,
  MODAL_SELECTOR,
  SIDENAV_SELECTOR,
  waitForModal,
  waitForMap,
  createProject,
  openSideNav,
  freshStart
} from './helpers';

/**
 * Smoke Tests - Khartis v3
 *
 * Tests essentiels pour vérifier que l'app fonctionne.
 * Les tests détaillés sont dans les tests unitaires Vitest.
 */

test.describe('App Startup', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
  });

  test('should display create project modal on load', async ({ page }) => {
    const modal = page.locator(MODAL_SELECTOR);
    await expect(modal).toBeVisible({ timeout: 15000 });

    await expect(modal.locator('[data-testid="tab-create-new"]')).toBeVisible();
    await expect(
      modal.locator('[data-testid="tab-open-project"]')
    ).toBeVisible();
    await expect(
      modal.locator('[data-testid="tab-try-example"]')
    ).toBeVisible();
  });

  test('should validate project name is required', async ({ page }) => {
    const modal = await waitForModal(page);

    const csvPath = join(CSV_PATH, 'world-bank-rural-pop.csv');
    await modal.locator('input[type="file"]').first().setInputFiles(csvPath);
    await page.waitForTimeout(2000);

    await modal.locator('[data-testid="project-name-input"]').clear();

    const createBtn = modal.getByRole('button', { name: 'Créer', exact: true });
    await expect(createBtn).toBeDisabled();
  });
});

test.describe('File Import', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
  });

  test('should import CSV and create project', async ({ page }) => {
    test.slow();
    const csvPath = join(CSV_PATH, 'world-bank-rural-pop.csv');
    await createProject(page, csvPath, `CSV Test ${Date.now()}`);
    await waitForMap(page);
  });

  test('should import GeoJSON and render map', async ({ page }) => {
    test.slow();
    const geoPath = join(GEOJSON_PATH, 'nuts2_data.geojson');
    await createProject(page, geoPath, `GeoJSON Test ${Date.now()}`);
    await waitForMap(page);

    const canvas = page.locator('.deck-canvas, canvas');
    await expect(canvas.first()).toBeVisible();
  });

  test('should import ZIP archive', async ({ page }) => {
    test.slow();
    const modal = await waitForModal(page);

    const zipPath = join(ZIP_PATH, 'single-csv.zip');
    await modal.locator('input[type="file"]').first().setInputFiles(zipPath);
    await page.waitForTimeout(5000);

    await expect(modal.locator('.bx--tag:has-text("CSV")')).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
  });

  test('should open and close side nav', async ({ page }) => {
    test.slow();
    const csvPath = join(CSV_PATH, 'world-bank-rural-pop.csv');
    await createProject(page, csvPath);
    await waitForMap(page);

    const sideNav = await openSideNav(page);
    await expect(sideNav).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await expect(page.locator(SIDENAV_SELECTOR)).toBeHidden();
  });

  test('should change language to English', async ({ page }) => {
    test.slow();
    const csvPath = join(CSV_PATH, 'world-bank-rural-pop.csv');
    await createProject(page, csvPath);
    await waitForMap(page);

    await openSideNav(page);

    await page.locator('#khartis-side-nav select').selectOption('en');
    await page.waitForTimeout(1000);

    const newProjectBtn = page.locator('[data-testid="sidenav-new-project"]');
    await expect(newProjectBtn).toContainText('New project');
  });

  test('delete button should be disabled without project', async ({ page }) => {
    const modal = page.locator(MODAL_SELECTOR);
    await expect(modal).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await openSideNav(page);

    const deleteBtn = page.locator('[data-testid="sidenav-delete-project"]');
    await expect(deleteBtn).toBeDisabled();
  });
});
