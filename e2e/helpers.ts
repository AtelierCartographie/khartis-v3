import { expect, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';

const isCI = !!process.env.CI;

// Paths - utilise tests-datasets/ (pas de mocks dupliqués)
export const TEST_DATASETS = join(process.cwd(), 'tests-datasets');
export const CSV_PATH = join(TEST_DATASETS, 'csv');
export const GEOJSON_PATH = join(TEST_DATASETS, 'geojson');
export const ZIP_PATH = join(TEST_DATASETS, 'zip');

// Selectors
export const MODAL_SELECTOR = '#khartis-create-project .bx--modal-container';
export const SIDENAV_SELECTOR = '#khartis-side-nav .bx--side-nav';

// Timeouts adaptés pour CI
const TIMEOUTS = {
  modal: isCI ? 30000 : 15000,
  map: isCI ? 60000 : 30000,
  fileUpload: isCI ? 10000 : 5000,
  action: isCI ? 20000 : 10000,
  transition: isCI ? 1000 : 500
};

// Core helpers
export async function waitForModal(
  page: Page,
  timeout = TIMEOUTS.modal
): Promise<Locator> {
  // Wait for loading to finish (if present)
  const loadingContainer = page.locator('.loading-container');
  if (await loadingContainer.isVisible().catch(() => false)) {
    await loadingContainer.waitFor({ state: 'hidden', timeout });
  }
  const modal = page.locator(MODAL_SELECTOR);
  await expect(modal).toBeVisible({ timeout });
  return modal;
}

export async function waitForMap(page: Page, timeout?: number): Promise<void> {
  const mapTimeout = timeout ?? TIMEOUTS.map;
  await page.waitForSelector('.map-container', {
    state: 'visible',
    timeout: mapTimeout
  });
  // Wait for map to stabilize
  await page.waitForTimeout(isCI ? 2000 : 1000);
}

export async function createProject(
  page: Page,
  filePath: string,
  projectName?: string
): Promise<void> {
  const modal = await waitForModal(page);

  const fileInput = modal.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  // Wait for file processing
  await page.waitForTimeout(TIMEOUTS.fileUpload);

  const name = projectName || `Test ${Date.now()}`;
  await modal.locator('[data-testid="project-name-input"]').fill(name);

  const createBtn = modal.getByRole('button', { name: 'Créer', exact: true });
  await expect(createBtn).toBeEnabled({ timeout: TIMEOUTS.action });
  await createBtn.click();

  await expect(modal).toBeHidden({ timeout: TIMEOUTS.action * 2 });
}

export async function openSideNav(page: Page): Promise<Locator> {
  const menuBtn = page.locator('button[aria-label="Open menu"]');
  await expect(menuBtn).toBeVisible({ timeout: TIMEOUTS.action });
  await menuBtn.click();
  await page.waitForTimeout(TIMEOUTS.transition);
  const sideNav = page.locator(SIDENAV_SELECTOR);
  await expect(sideNav).toBeVisible({ timeout: TIMEOUTS.action });
  return sideNav;
}

export async function freshStart(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      localStorage.clear();
      sessionStorage.clear();
      indexedDB.databases().then((dbs) => {
        const deletePromises = dbs.map((db) => {
          if (db.name) {
            return new Promise<void>((res) => {
              const req = indexedDB.deleteDatabase(db.name);
              req.onsuccess = () => res();
              req.onerror = () => res();
            });
          }
          return Promise.resolve();
        });
        Promise.all(deletePromises).then(() => resolve());
      });
    });
  });
  await page.waitForTimeout(TIMEOUTS.transition);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await waitForModal(page, TIMEOUTS.modal * 1.5);
}
