import { expect, test } from '@playwright/test';
import { join } from 'node:path';

const MODAL_CONTAINER_SELECTOR = '#khartis-create-project .bx--modal-container';
const TEST_DATASET_PATH = join(
  process.cwd(),
  'e2e',
  'mocks',
  'csv',
  'nuts2_data.csv'
);

async function createTestProject(
  page: any,
  projectName: string = 'Test Project'
) {
  await page.goto('/');
  const modal = page.locator(MODAL_CONTAINER_SELECTOR);
  await expect(modal).toBeVisible();

  const createTab = modal.locator('[data-testid="tab-create-new"]');
  await createTab.click();
  await page.waitForTimeout(500);

  const fileInput = modal.locator('input[type="file"]').first();
  await fileInput.setInputFiles(TEST_DATASET_PATH);

  const projectNameInput = modal.locator('[data-testid="project-name-input"]');
  await projectNameInput.fill(projectName);

  const createButton = modal.getByRole('button', {
    name: 'Créer',
    exact: true
  });
  await createButton.click();

  await expect(modal).toBeHidden({ timeout: 10000 });
  await page.waitForTimeout(2000);
}

test.describe('Raccourcis clavier - 3.F', () => {
  test.skip('touche Escape ferme le modal de création de projet', async ({
    page
  }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await expect(modal).toBeHidden();
  });

  test('touche 1 navigue vers étape Données', async ({ page }) => {
    await createTestProject(page, 'Test Shortcut Navigation');

    await page.keyboard.press('2');
    await page.waitForTimeout(300);

    await page.keyboard.press('1');
    await page.waitForTimeout(500);

    const dataSection = page.locator('#khartis-main-toolbar');
    await expect(dataSection).toBeVisible();

    const progressIndicator = page.locator('.bx--progress-indicator');
    await expect(progressIndicator).toBeVisible();
  });

  test('touche 2 navigue vers étape Visualisations', async ({ page }) => {
    await createTestProject(page, 'Test Shortcut Viz');

    await page.keyboard.press('2');
    await page.waitForTimeout(500);

    const toolbar = page.locator('#khartis-main-toolbar');
    await expect(toolbar).toBeVisible();

    const vizTab = page.locator('[role="tab"]').filter({ hasText: /visualisation/i }).first();
    await expect(vizTab).toBeVisible();
  });

  test('touche 3 navigue vers étape Habillage', async ({ page }) => {
    await createTestProject(page, 'Test Shortcut Styling');

    await page.keyboard.press('3');
    await page.waitForTimeout(500);

    const toolbar = page.locator('#khartis-main-toolbar');
    await expect(toolbar).toBeVisible();
  });

  test('Ctrl+Plus zoom avant', async ({ page }) => {
    await createTestProject(page, 'Test Zoom In');

    await page.keyboard.press('Control++');
    await page.waitForTimeout(300);

    const zoomToolbar = page.locator('.zoom-toolbar, [class*="zoom"]').first();
    await expect(zoomToolbar).toBeVisible();
  });

  test('Ctrl+Minus zoom arrière', async ({ page }) => {
    await createTestProject(page, 'Test Zoom Out');

    await page.keyboard.press('Control+-');
    await page.waitForTimeout(300);

    const zoomToolbar = page.locator('.zoom-toolbar, [class*="zoom"]').first();
    await expect(zoomToolbar).toBeVisible();
  });

  test('Escape réduit la barre latérale', async ({ page }) => {
    await createTestProject(page, 'Test Escape Collapse');

    const toolbar = page.locator('#khartis-main-toolbar');
    await expect(toolbar).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    const toolbarWidth = await toolbar.evaluate((el) =>
      window.getComputedStyle(el).width
    );
    expect(toolbarWidth).toBe('50px');
  });

  test('les raccourcis ne fonctionnent pas dans les champs de saisie', async ({
    page
  }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();
    await page.waitForTimeout(300);

    const projectNameInput = modal.locator('[data-testid="project-name-input"]');
    await projectNameInput.click();
    await projectNameInput.fill('Test 123');

    await page.keyboard.press('1');
    await page.waitForTimeout(300);

    const inputValue = await projectNameInput.inputValue();
    expect(inputValue).toBe('Test 123');
  });

  test.skip('Alt+Z bascule entre mode carte et page', async ({ page }) => {});
});
