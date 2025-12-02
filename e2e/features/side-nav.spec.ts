import { test, expect } from '@playwright/test';
import {
  ensureFreshStart,
  createProjectFromCSV,
  waitForMapRender,
  openHamburgerMenu,
  waitForModalVisible,
  MODAL_CONTAINER_SELECTOR
} from '../utils/test-helpers';

const SIDENAV_SELECTOR = '#khartis-side-nav .bx--side-nav';

test.describe('Side Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await ensureFreshStart(page);
  });

  test('should open and close side nav', async ({ page }) => {
    test.slow();
    await createProjectFromCSV(page, 'nuts2_data.csv');
    await waitForMapRender(page, 30000);

    const sideNav = await openHamburgerMenu(page);
    await expect(sideNav).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await expect(page.locator(SIDENAV_SELECTOR)).toBeHidden();
  });

  test('should create new project from side nav', async ({ page }) => {
    test.slow();
    await createProjectFromCSV(page, 'nuts2_data.csv', 'Project A');
    await waitForMapRender(page, 30000);

    await openHamburgerMenu(page);

    const newProjectButton = page.locator(
      '[data-testid="sidenav-new-project"]'
    );
    await newProjectButton.click();

    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible({ timeout: 10000 });

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await expect(createTab).toHaveAttribute('aria-pressed', 'true');
  });

  test('should open duplicate project modal', async ({ page }) => {
    test.slow();
    await createProjectFromCSV(page, 'nuts2_data.csv', 'Project To Duplicate');
    await waitForMapRender(page, 30000);

    await openHamburgerMenu(page);

    const duplicateButton = page.locator(
      '[data-testid="sidenav-duplicate-project"]'
    );
    await duplicateButton.click();

    const duplicateModal = page.locator('.bx--modal.is-visible');
    await expect(duplicateModal).toBeVisible({ timeout: 10000 });
    await expect(duplicateModal).toContainText('Project To Duplicate');
  });

  test('should delete current project and reset app', async ({ page }) => {
    test.slow();
    await createProjectFromCSV(page, 'nuts2_data.csv', 'Project To Delete');
    await waitForMapRender(page, 30000);

    await openHamburgerMenu(page);

    const deleteButton = page.locator('[data-testid="sidenav-delete-project"]');
    await deleteButton.click();

    const confirmModal = page.locator('.bx--modal--danger.is-visible');
    await expect(confirmModal).toBeVisible({ timeout: 10000 });
    await expect(confirmModal).toContainText('Project To Delete');

    const confirmButton = confirmModal.locator(
      'button.bx--btn--danger:has-text("Supprimer")'
    );
    await confirmButton.click();
    await page.waitForTimeout(1000);

    const createModal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(createModal).toBeVisible({ timeout: 15000 });
  });

  test('should verify deleted project is no longer accessible', async ({
    page
  }) => {
    test.slow();
    const projectName = `Delete Test ${Date.now()}`;
    await createProjectFromCSV(page, 'nuts2_data.csv', projectName);
    await waitForMapRender(page, 30000);

    await page.waitForTimeout(3000);

    await openHamburgerMenu(page);

    const deleteButton = page.locator('[data-testid="sidenav-delete-project"]');
    await deleteButton.click();

    const confirmModal = page.locator('.bx--modal--danger.is-visible');
    await expect(confirmModal).toBeVisible({ timeout: 10000 });

    const confirmButton = confirmModal.locator(
      'button.bx--btn--danger:has-text("Supprimer")'
    );
    await confirmButton.click();
    await page.waitForTimeout(1000);

    const modal = await waitForModalVisible(page, 20000);

    const savedProjectsTab = modal.locator(
      '[data-testid="tab-saved-projects"]'
    );
    await savedProjectsTab.click();
    await page.waitForTimeout(1000);

    const projectCards = modal.locator('.bx--tile');
    const count = await projectCards.count();

    let projectFound = false;
    for (let i = 0; i < count; i++) {
      const text = await projectCards.nth(i).textContent();
      if (text?.includes(projectName)) {
        projectFound = true;
        break;
      }
    }

    expect(projectFound).toBe(false);
  });

  test('should open saved projects tab from side nav', async ({ page }) => {
    test.slow();
    await createProjectFromCSV(page, 'nuts2_data.csv', 'Saved Project');
    await waitForMapRender(page, 30000);

    await page.waitForTimeout(3000);

    await openHamburgerMenu(page);

    const openProjectButton = page.locator(
      '[data-testid="sidenav-open-project"]'
    );
    await openProjectButton.click();

    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible({ timeout: 10000 });

    const savedProjectsTab = modal.locator(
      '[data-testid="tab-saved-projects"]'
    );
    await expect(savedProjectsTab).toHaveAttribute('aria-pressed', 'true');
  });

  test('should change language to English', async ({ page }) => {
    test.slow();
    await createProjectFromCSV(page, 'nuts2_data.csv');
    await waitForMapRender(page, 30000);

    await openHamburgerMenu(page);

    const languageSelect = page.locator('#khartis-side-nav select');
    await languageSelect.selectOption('en');
    await page.waitForTimeout(1000);

    const newProjectButton = page.locator(
      '[data-testid="sidenav-new-project"]'
    );
    await expect(newProjectButton).toContainText('New project');
  });

  test('delete button should be disabled without project', async ({ page }) => {
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await openHamburgerMenu(page);

    const deleteButton = page.locator('[data-testid="sidenav-delete-project"]');
    await expect(deleteButton).toBeDisabled();
  });

  test('should preserve old project when creating new one', async ({
    page
  }) => {
    test.slow();
    const firstProjectName = `First Project ${Date.now()}`;
    await createProjectFromCSV(page, 'nuts2_data.csv', firstProjectName);
    await waitForMapRender(page, 30000);

    await page.waitForTimeout(3000);

    await openHamburgerMenu(page);

    const newProjectButton = page.locator(
      '[data-testid="sidenav-new-project"]'
    );
    await newProjectButton.click();

    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible({ timeout: 10000 });

    const savedProjectsTab = modal.locator(
      '[data-testid="tab-saved-projects"]'
    );
    await savedProjectsTab.click();
    await page.waitForTimeout(1000);

    const projectCards = modal.locator('.bx--tile');
    const count = await projectCards.count();

    let projectFound = false;
    for (let i = 0; i < count; i++) {
      const text = await projectCards.nth(i).textContent();
      if (text?.includes(firstProjectName)) {
        projectFound = true;
        break;
      }
    }

    expect(projectFound).toBe(true);
  });
});
