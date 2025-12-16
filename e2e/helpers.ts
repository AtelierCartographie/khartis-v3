import { expect, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';

// Paths - utilise tests-datasets/ (pas de mocks dupliqués)
export const TEST_DATASETS = join(process.cwd(), 'tests-datasets');
export const CSV_PATH = join(TEST_DATASETS, 'csv');
export const GEOJSON_PATH = join(TEST_DATASETS, 'geojson');
export const ZIP_PATH = join(TEST_DATASETS, 'zip');

// Selectors
export const MODAL_SELECTOR = '#khartis-create-project .bx--modal-container';
export const SIDENAV_SELECTOR = '#khartis-side-nav .bx--side-nav';

// Core helpers
export async function waitForModal(
  page: Page,
  timeout = 15000
): Promise<Locator> {
  await page.waitForSelector('.loading-container', {
    state: 'hidden',
    timeout
  });
  const modal = page.locator(MODAL_SELECTOR);
  await expect(modal).toBeVisible({ timeout });
  return modal;
}

export async function waitForMap(page: Page, timeout = 30000): Promise<void> {
  await page.waitForSelector('.map-container', { state: 'visible', timeout });
  await page.waitForTimeout(1000);
}

export async function createProject(
  page: Page,
  filePath: string,
  projectName?: string
): Promise<void> {
  const modal = await waitForModal(page);

  const fileInput = modal.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(3000);

  const name = projectName || `Test ${Date.now()}`;
  await modal.locator('[data-testid="project-name-input"]').fill(name);

  const createBtn = modal.getByRole('button', { name: 'Créer', exact: true });
  await expect(createBtn).toBeEnabled({ timeout: 10000 });
  await createBtn.click();

  await expect(modal).toBeHidden({ timeout: 20000 });
}

export async function openSideNav(page: Page): Promise<Locator> {
  await page.locator('button[aria-label="Open menu"]').click();
  await page.waitForTimeout(500);
  return page.locator(SIDENAV_SELECTOR);
}

export async function freshStart(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    indexedDB.databases().then((dbs) => {
      dbs.forEach((db) => db.name && indexedDB.deleteDatabase(db.name));
    });
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/');
  await waitForModal(page);
}
