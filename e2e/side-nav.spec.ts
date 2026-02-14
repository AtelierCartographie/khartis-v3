import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  CSV_PATH,
  MODAL_SELECTOR,
  SIDENAV_SELECTOR,
  waitForMap,
  createProject,
  openSideNav,
  freshStart
} from './helpers';

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
    // Wait for language change to take effect
    await page.waitForTimeout(2000);
    // Reopen side nav if it closed after language change
    const sideNavAfterLang = page.locator(SIDENAV_SELECTOR);
    if (!(await sideNavAfterLang.isVisible())) {
      await openSideNav(page);
    }
    await expect(
      page.locator('[data-testid="sidenav-new-project"]')
    ).toContainText('New project', { timeout: 15000 });
  });

  test('should have all project buttons with correct states @smoke', async ({
    page
  }) => {
    test.slow();
    await freshStart(page);

    const csvPayload = {
      name: 'e2e-smoke-light.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('country,value\nFrance,10\nGermany,20\nSpain,30\n')
    };
    await createProject(page, csvPayload, `Smoke ${Date.now()}`);
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
