import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  CSV_PATH,
  MODAL_SELECTOR,
  waitForModal,
  waitForMap,
  createProject,
  freshStart,
  assertNoConsoleErrors
} from './helpers';

test.describe('Create Project Modal', () => {
  test.describe('Modal UI', () => {
    test('should display modal with all tabs and allow switching @smoke', async ({
      page
    }) => {
      await freshStart(page);

      const modal = page.locator(MODAL_SELECTOR);
      await expect(modal).toBeVisible({ timeout: 15000 });

      await expect(
        modal.locator('[data-testid="tab-create-new"]')
      ).toBeVisible();
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
      const createBtn = modal.getByRole('button', {
        name: 'Créer',
        exact: true
      });
      await expect(createBtn).toBeDisabled();
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
  });

  test.describe('Example projects', () => {
    test('should create project from example', async ({ page }) => {
      test.slow();
      const errorTracker = await freshStart(page);

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
      assertNoConsoleErrors(errorTracker, 'Example project creation');
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

      await exampleSection
        .getByRole('button', { name: 'Toutes', exact: true })
        .click();
      await page.waitForTimeout(300);

      await expect(
        page.getByRole('button', { name: /Population Europe 2023/i })
      ).toBeVisible();
    });
  });

  test.describe('Saved projects', () => {
    test('should show saved projects in open tab', async ({ page }) => {
      test.slow();
      await freshStart(page);

      const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
      const projectName = `Saved Project ${Date.now()}`;
      await createProject(page, csvPath, projectName);
      await waitForMap(page);

      const menuBtn = page.locator('button[aria-label="Open menu"]');
      await menuBtn.click();
      await page.waitForTimeout(500);

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

      const menuBtn = page.locator('button[aria-label="Open menu"]');
      await menuBtn.click();
      await page.waitForTimeout(500);

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
});
