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

test.describe('Create Project Modal', () => {
  test('should display modal with all tabs and allow switching', async ({
    page
  }) => {
    await freshStart(page);

    const modal = page.locator(MODAL_SELECTOR);
    await expect(modal).toBeVisible({ timeout: 15000 });

    await expect(modal.locator('[data-testid="tab-create-new"]')).toBeVisible();
    await expect(
      modal.locator('[data-testid="tab-open-project"]')
    ).toBeVisible();
    await expect(
      modal.locator('[data-testid="tab-try-example"]')
    ).toBeVisible();

    await modal.locator('[data-testid="tab-open-project"]').click();
    await page.waitForTimeout(500);
    await expect(modal.locator('#khartis-open-project')).toBeVisible();

    await modal.locator('[data-testid="tab-try-example"]').click();
    await page.waitForTimeout(500);
    await expect(modal.locator('#khartis-try-with-example')).toBeVisible();

    await modal.locator('[data-testid="tab-create-new"]').click();
    await page.waitForTimeout(500);
    await expect(
      modal.locator('[data-testid="create-new-project-section"]')
    ).toBeVisible();
  });

  test('should upload CSV and validate project name', async ({ page }) => {
    await freshStart(page);

    const modal = await waitForModal(page);
    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');

    await modal.locator('input[type="file"]').first().setInputFiles(csvPath);
    await page.waitForTimeout(3000);

    await expect(modal.locator('.bx--tag:has-text("CSV")')).toBeVisible();

    await modal.locator('[data-testid="project-name-input"]').clear();
    const createBtn = modal.getByRole('button', { name: 'Créer', exact: true });
    await expect(createBtn).toBeDisabled();
  });

  test('should upload GeoJSON file', async ({ page }) => {
    await freshStart(page);

    const modal = await waitForModal(page);
    const geoPath = join(GEOJSON_PATH, 'nuts2_data.geojson');

    await modal.locator('input[type="file"]').first().setInputFiles(geoPath);
    await page.waitForTimeout(3000);

    await expect(modal.locator('.bx--tag:has-text("GeoJSON")')).toBeVisible();
  });

  test('should upload ZIP archive', async ({ page }) => {
    await freshStart(page);

    const modal = await waitForModal(page);
    const zipPath = join(ZIP_PATH, 'single-csv.zip');

    await modal.locator('input[type="file"]').first().setInputFiles(zipPath);
    // ZIP might show as ZIP during extraction, then CSV after extraction
    await expect(modal.locator('.bx--tile')).toBeVisible({ timeout: 15000 });
  });

  test('should remove uploaded file', async ({ page }) => {
    await freshStart(page);

    const modal = await waitForModal(page);
    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');

    await modal.locator('input[type="file"]').first().setInputFiles(csvPath);
    await page.waitForTimeout(3000);

    await expect(modal.locator('.bx--tag:has-text("CSV")')).toBeVisible();

    const trashBtn = modal.locator('.bx--tile button').first();
    await trashBtn.click();
    await page.waitForTimeout(1000);

    await expect(modal.locator('.bx--tag:has-text("CSV")')).toBeHidden();
  });

  test('should create project and display map', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    await createProject(page, csvPath, `Test Project ${Date.now()}`);
    await waitForMap(page);

    await expect(page.locator('.map-container').first()).toBeVisible();
  });

  test('should create project from GeoJSON', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const geoPath = join(GEOJSON_PATH, 'nuts2_data.geojson');
    await createProject(page, geoPath, `GeoJSON Project ${Date.now()}`);
    await waitForMap(page);

    await expect(page.locator('.map-container').first()).toBeVisible();
  });

  test('should create project from example', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const modal = await waitForModal(page);

    await modal.locator('[data-testid="tab-try-example"]').click();
    await page.waitForTimeout(500);
    await expect(modal.locator('#khartis-try-with-example')).toBeVisible();

    const exampleCard = page.getByRole('button', {
      name: /Population Europe 2023/i
    });
    await expect(exampleCard).toBeVisible({ timeout: 10000 });
    await exampleCard.click();

    await waitForMap(page, 45000);
    await expect(page.locator('.map-container').first()).toBeVisible();
  });

  test('should filter examples by category', async ({ page }) => {
    await freshStart(page);

    const modal = await waitForModal(page);

    await modal.locator('[data-testid="tab-try-example"]').click();
    await page.waitForTimeout(500);

    const exampleSection = page.locator('#khartis-try-with-example');
    await expect(
      page.getByRole('button', { name: /Population Europe 2023/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Villes européennes/i })
    ).toBeVisible();

    // Click on "Symboles" category tag
    await exampleSection
      .getByRole('button', { name: 'Symboles', exact: true })
      .click();
    await page.waitForTimeout(300);

    await expect(
      page.getByRole('button', { name: /Villes européennes/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Population Europe 2023/i })
    ).toBeHidden();

    // Click on "Toutes" category tag to reset
    await exampleSection
      .getByRole('button', { name: 'Toutes', exact: true })
      .click();
    await page.waitForTimeout(300);

    await expect(
      page.getByRole('button', { name: /Population Europe 2023/i })
    ).toBeVisible();
  });

  test('should show saved projects in open tab', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    const projectName = `Saved Project ${Date.now()}`;
    await createProject(page, csvPath, projectName);
    await waitForMap(page);

    await openSideNav(page);
    await page.locator('[data-testid="sidenav-new-project"]').click();
    await page.waitForTimeout(500);

    const modal = page.locator(MODAL_SELECTOR);
    await modal.locator('[data-testid="tab-open-project"]').click();
    await page.waitForTimeout(1000);

    await expect(
      page.getByRole('button', { name: new RegExp(projectName, 'i') })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should open saved project from list', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    const projectName = `Open Test ${Date.now()}`;
    await createProject(page, csvPath, projectName);
    await waitForMap(page);

    await openSideNav(page);
    await page.locator('[data-testid="sidenav-new-project"]').click();
    await page.waitForTimeout(500);

    const modal = page.locator(MODAL_SELECTOR);
    await modal.locator('[data-testid="tab-open-project"]').click();
    await page.waitForTimeout(1000);

    const projectCard = page.getByRole('button', {
      name: new RegExp(projectName, 'i')
    });
    await expect(projectCard).toBeVisible({ timeout: 10000 });
    await projectCard.click();

    await waitForMap(page);
    await expect(page.locator('.map-container').first()).toBeVisible();
  });
});

test.describe('Side Navigation', () => {
  test('should open/close side nav and change language', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    await createProject(page, csvPath);
    await waitForMap(page);

    const sideNav = await openSideNav(page);
    await expect(sideNav).toBeVisible();

    await expect(
      page.locator('[data-testid="sidenav-new-project"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="sidenav-save-project"]')
    ).toBeEnabled();

    await page.locator('#khartis-side-nav select').selectOption('en');
    await page.waitForTimeout(500);
    await expect(
      page.locator('[data-testid="sidenav-new-project"]')
    ).toContainText('New project');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await expect(page.locator(SIDENAV_SELECTOR)).toBeHidden();
  });

  test('should have all project buttons with correct states', async ({
    page
  }) => {
    test.slow();
    await freshStart(page);

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    await createProject(page, csvPath);
    await waitForMap(page);

    await openSideNav(page);

    await expect(
      page.locator('[data-testid="sidenav-new-project"]')
    ).toBeEnabled();
    await expect(
      page.locator('[data-testid="sidenav-open-project"]')
    ).toBeEnabled();
    await expect(
      page.locator('[data-testid="sidenav-save-project"]')
    ).toBeEnabled();
    await expect(
      page.locator('[data-testid="sidenav-duplicate-project"]')
    ).toBeEnabled();
    await expect(
      page.locator('[data-testid="sidenav-delete-project"]')
    ).toBeEnabled();
  });

  test('should open project modal on tab 2 from side nav', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    await createProject(page, csvPath);
    await waitForMap(page);

    await openSideNav(page);
    const openBtn = page.locator('[data-testid="sidenav-open-project"]');
    await expect(openBtn).toBeVisible();
    await openBtn.click();

    await expect(page.locator('#khartis-open-project')).toBeVisible({
      timeout: 10000
    });
  });

  test('should open new project modal from side nav', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    await createProject(page, csvPath);
    await waitForMap(page);

    await openSideNav(page);
    await page.locator('[data-testid="sidenav-new-project"]').click();
    await page.waitForTimeout(500);

    const modal = page.locator(MODAL_SELECTOR);
    await expect(modal).toBeVisible();
    await expect(
      modal.locator('[data-testid="create-new-project-section"]')
    ).toBeVisible();
  });

  test('should open delete confirmation modal', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    await createProject(page, csvPath);
    await waitForMap(page);

    await openSideNav(page);
    await page.locator('[data-testid="sidenav-delete-project"]').click();
    await page.waitForTimeout(500);

    const deleteModal = page.getByRole('dialog');
    await expect(deleteModal).toBeVisible();
    await expect(
      deleteModal.getByRole('button', { name: /supprimer|delete/i })
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  test('should open duplicate project modal', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    await createProject(page, csvPath);
    await waitForMap(page);

    await openSideNav(page);
    await page.locator('[data-testid="sidenav-duplicate-project"]').click();
    await page.waitForTimeout(500);

    const duplicateModal = page
      .locator('.bx--modal-container')
      .filter({ hasText: /dupliquer|duplicate/i });
    await expect(duplicateModal).toBeVisible();
  });
});
