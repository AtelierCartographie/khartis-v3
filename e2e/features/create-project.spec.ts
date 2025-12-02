import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import {
  ensureFreshStart,
  waitForModalVisible,
  waitForMapRender,
  MODAL_CONTAINER_SELECTOR,
  CSV_MOCKS_PATH
} from '../utils/test-helpers';

test.describe('Create Project', () => {
  test.beforeEach(async ({ page }) => {
    await ensureFreshStart(page);
  });

  test('should display create project modal on first load', async ({
    page
  }) => {
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible({ timeout: 15000 });

    // Verify tabs are visible
    await expect(modal.locator('[data-testid="tab-create-new"]')).toBeVisible();
    await expect(
      modal.locator('[data-testid="tab-open-project"]')
    ).toBeVisible();
    await expect(
      modal.locator('[data-testid="tab-try-example"]')
    ).toBeVisible();

    // Tab "Create new" should be selected by default
    await expect(
      modal.locator('[data-testid="tab-create-new"]')
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('should import CSV file and display it in file list', async ({
    page
  }) => {
    const modal = await waitForModalVisible(page);

    // Ensure we're on the create new tab
    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();
    await page.waitForTimeout(500);

    // Upload CSV file
    const csvPath = join(CSV_MOCKS_PATH, 'nuts2_data.csv');
    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(csvPath);

    // Wait for file processing
    await page.waitForTimeout(2000);

    // Verify file appears in the list with CSV tag
    const fileList = modal.locator('.files-section');
    await expect(fileList).toContainText('nuts2_data.csv');
    await expect(fileList.locator('.bx--tag:has-text("CSV")')).toBeVisible();
  });

  test('should create project with CSV file', async ({ page }) => {
    test.slow();
    const modal = await waitForModalVisible(page);

    // Upload CSV file
    const csvPath = join(CSV_MOCKS_PATH, 'nuts2_data.csv');
    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(csvPath);

    await page.waitForTimeout(2000);

    // Fill project name
    const projectName = `Test NUTS2 ${Date.now()}`;
    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.fill(projectName);
    await page.waitForTimeout(500);

    // Click create button
    const createButton = modal.getByRole('button', {
      name: 'Créer',
      exact: true
    });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    // Modal should close
    await expect(modal).toBeHidden({ timeout: 15000 });

    // Map should render
    await waitForMapRender(page, 30000);
  });

  test('should validate project name is required', async ({ page }) => {
    const modal = await waitForModalVisible(page);

    // Upload file first
    const csvPath = join(CSV_MOCKS_PATH, 'nuts2_data.csv');
    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(csvPath);

    await page.waitForTimeout(2000);

    // Clear project name (in case there's a default)
    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.clear();

    // Create button should be disabled
    const createButton = modal.getByRole('button', {
      name: 'Créer',
      exact: true
    });
    await expect(createButton).toBeDisabled();
  });

  test('should prevent creating project without files', async ({ page }) => {
    const modal = await waitForModalVisible(page);

    // Fill project name without uploading files
    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.fill('Project Without Files');

    // Create button should be disabled (no files)
    const createButton = modal.getByRole('button', {
      name: 'Créer',
      exact: true
    });
    await expect(createButton).toBeDisabled();
  });

  test('should allow removing uploaded file', async ({ page }) => {
    const modal = await waitForModalVisible(page);

    // Upload CSV file
    const csvPath = join(CSV_MOCKS_PATH, 'nuts2_data.csv');
    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(csvPath);

    await page.waitForTimeout(2000);

    // Verify file is in the list
    const fileList = modal.locator('.files-section');
    await expect(fileList).toContainText('nuts2_data.csv');

    // Click remove button (TrashCan icon)
    const removeButton = fileList.locator(
      'button[aria-label="Remove file"], button:has([aria-label="Remove file"])'
    );
    await removeButton.first().click();
    await page.waitForTimeout(500);

    // File should be removed
    await expect(fileList).not.toContainText('nuts2_data.csv');
  });

  test('should switch between tabs', async ({ page }) => {
    const modal = await waitForModalVisible(page);

    // Click on "Open project" tab
    const openProjectTab = modal.locator('[data-testid="tab-open-project"]');
    await openProjectTab.click();
    await page.waitForTimeout(500);
    await expect(openProjectTab).toHaveAttribute('aria-pressed', 'true');

    // Click on "Try example" tab
    const tryExampleTab = modal.locator('[data-testid="tab-try-example"]');
    await tryExampleTab.click();
    await page.waitForTimeout(500);
    await expect(tryExampleTab).toHaveAttribute('aria-pressed', 'true');

    // Click back on "Create new" tab
    const createNewTab = modal.locator('[data-testid="tab-create-new"]');
    await createNewTab.click();
    await page.waitForTimeout(500);
    await expect(createNewTab).toHaveAttribute('aria-pressed', 'true');
  });
});
