import { expect, type Page, type Locator } from '@playwright/test';
import { join } from 'node:path';

export const MOCKS_PATH = join(process.cwd(), 'e2e', 'mocks');
export const CSV_MOCKS_PATH = join(MOCKS_PATH, 'csv');
export const SPATIAL_MOCKS_PATH = join(MOCKS_PATH, 'spatial');

export const MODAL_CONTAINER_SELECTOR =
  '#khartis-create-project .bx--modal-container';
export const CREATE_BUTTON_LABEL = 'Créer';

export async function waitForAppInitialization(page: Page, timeout = 10000) {
  await page.waitForSelector('.loading-container', {
    state: 'hidden',
    timeout
  });
  await page.waitForTimeout(500);
}

export async function waitForModalVisible(page: Page, timeout = 15000) {
  await waitForAppInitialization(page, timeout);
  const modal = page.locator(MODAL_CONTAINER_SELECTOR);
  await expect(modal).toBeVisible({ timeout });
  return modal;
}

export async function waitForMapRender(page: Page, timeout = 10000) {
  // Wait for map container to be visible
  await page.waitForSelector('.map-container', {
    state: 'visible',
    timeout
  });
  // Give DeckGL time to initialize
  await page.waitForTimeout(1000);
}

export async function createProjectFromCSV(
  page: Page,
  csvFileName: string,
  projectName?: string
): Promise<string> {
  const modal = await waitForModalVisible(page);

  const createTab = modal.locator('[data-testid="tab-create-new"]');
  await createTab.click();
  await page.waitForTimeout(500);

  const csvPath = join(CSV_MOCKS_PATH, csvFileName);
  const fileInput = modal.locator('input[type="file"]').first();
  await fileInput.setInputFiles(csvPath);

  // Wait for file processing (CSV tag appears when complete)
  await page.waitForTimeout(2000);

  const finalProjectName = projectName || `Test Project ${Date.now()}`;
  const projectNameInput = modal.locator('[data-testid="project-name-input"]');
  await projectNameInput.fill(finalProjectName);
  await page.waitForTimeout(500);

  const createButton = modal.getByRole('button', {
    name: CREATE_BUTTON_LABEL,
    exact: true
  });
  await expect(createButton).toBeEnabled({ timeout: 10000 });
  await createButton.click();
  await expect(modal).toBeHidden({ timeout: 20000 });

  return finalProjectName;
}

export async function createProjectFromGeoJSON(
  page: Page,
  geoJSONFileName: string,
  projectName?: string
): Promise<string> {
  const modal = await waitForModalVisible(page);

  const createTab = modal.locator('[data-testid="tab-create-new"]');
  await createTab.click();
  await page.waitForTimeout(500);

  const geoJSONPath = join(SPATIAL_MOCKS_PATH, geoJSONFileName);
  const fileInput = modal.locator('input[type="file"]').first();
  await fileInput.setInputFiles(geoJSONPath);

  await page.waitForTimeout(500);

  const finalProjectName = projectName || `GeoJSON Project ${Date.now()}`;
  const projectNameInput = modal.locator('[data-testid="project-name-input"]');
  await projectNameInput.fill(finalProjectName);
  await page.waitForTimeout(500);

  const createButton = modal.getByRole('button', {
    name: CREATE_BUTTON_LABEL,
    exact: true
  });
  await expect(createButton).toBeEnabled();
  await createButton.click();
  await expect(modal).toBeHidden({ timeout: 10000 });

  return finalProjectName;
}

export async function openHamburgerMenu(page: Page): Promise<Locator> {
  const hamburger = page.locator('button[aria-label="Open menu"]');
  await hamburger.click();
  await page.waitForTimeout(500);
  return page.locator('.bx--side-nav');
}

export async function reopenProjectModal(page: Page): Promise<Locator> {
  await openHamburgerMenu(page);
  const openProjectMenuItem = page.getByRole('button', {
    name: /Ouvrir un projet/
  });
  await openProjectMenuItem.click();
  return await waitForModalVisible(page);
}

export async function navigateToStep(
  page: Page,
  step: 'data' | 'visualizations' | 'styling'
) {
  const stepButton = page.locator(`[data-testid="step-${step}"]`);
  await stepButton.click();
  await page.waitForTimeout(500);
}

export async function getPolygonColor(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.deck-canvas') as HTMLCanvasElement;
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const imageData = ctx.getImageData(centerX, centerY, 1, 1);
    const [r, g, b] = imageData.data;

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  });
}

export async function selectBasemap(page: Page, basemapName: string) {
  const basemapSelector = page.locator('[data-testid="basemap-selector"]');
  await basemapSelector.click();

  const basemapOption = page.getByRole('option', { name: basemapName });
  await basemapOption.click();
  await page.waitForTimeout(1000);
}

export async function createVisualization(
  page: Page,
  visualizationType: string,
  variableName: string
) {
  await navigateToStep(page, 'visualizations');

  const createVizButton = page.locator('[data-testid="create-visualization"]');
  await createVizButton.click();

  const vizTypeButton = page.locator(
    `[data-testid="viz-type-${visualizationType}"]`
  );
  await vizTypeButton.click();

  const variableSelect = page.locator('[data-testid="variable-select"]');
  await variableSelect.click();
  await page.getByRole('option', { name: variableName }).click();

  await page.waitForTimeout(1000);
}

export async function applyColorPalette(page: Page, paletteName: string) {
  const colorTool = page.locator('[data-testid="tool-color"]');
  await colorTool.click();

  const palette = page.locator(`[data-testid="palette-${paletteName}"]`);
  await palette.click();

  await page.waitForTimeout(500);
}

export async function exportMap(
  page: Page,
  format: 'svg' | 'jpg' | 'csv' | 'kh'
) {
  const exportButton = page.locator('[data-testid="export-menu"]');
  await exportButton.click();

  const downloadPromise = page.waitForEvent('download');

  const formatButton = page.locator(`[data-testid="export-${format}"]`);
  await formatButton.click();

  return await downloadPromise;
}

export async function uploadCSVContent(
  page: Page,
  csvContent: string,
  fileName = 'test.csv'
) {
  await page.evaluate(
    ({ content, name }) => {
      const file = new File([content], name, { type: 'text/csv' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    { content: csvContent, name: fileName }
  );

  await page.waitForTimeout(1000);
}

export async function openDataTable(page: Page) {
  const tableToggle = page.locator('[data-testid="toggle-data-table"]');
  await tableToggle.click();
  await page.waitForTimeout(500);
}

export async function applyFilter(
  page: Page,
  columnName: string,
  operator: string,
  value: string
) {
  const filterButton = page.locator('[data-testid="add-filter"]');
  await filterButton.click();

  const columnSelect = page.locator('[data-testid="filter-column"]');
  await columnSelect.click();
  await page.getByRole('option', { name: columnName }).click();

  const operatorSelect = page.locator('[data-testid="filter-operator"]');
  await operatorSelect.click();
  await page.getByRole('option', { name: operator }).click();

  const valueInput = page.locator('[data-testid="filter-value"]');
  await valueInput.fill(value);

  const applyButton = page.locator('[data-testid="apply-filter"]');
  await applyButton.click();

  await page.waitForTimeout(1000);
}

export async function addMapElement(
  page: Page,
  elementType: 'title' | 'legend' | 'scale' | 'annotation',
  content?: string
) {
  await navigateToStep(page, 'styling');

  const toolButton = page.locator(`[data-testid="tool-${elementType}"]`);
  await toolButton.click();

  if (content && (elementType === 'title' || elementType === 'annotation')) {
    const contentInput = page.locator(`[data-testid="${elementType}-content"]`);
    await contentInput.fill(content);
  }

  await page.waitForTimeout(500);
}

export async function cleanupIndexedDB(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      indexedDB
        .databases()
        .then((dbs) => {
          const deletePromises = dbs.map(
            (db) =>
              new Promise<void>((res) => {
                if (db.name) {
                  const req = indexedDB.deleteDatabase(db.name);
                  req.onsuccess = () => res();
                  req.onerror = () => res();
                } else {
                  res();
                }
              })
          );
          return Promise.all(deletePromises);
        })
        .then(() => {
          localStorage.clear();
          sessionStorage.clear();
          resolve();
        })
        .catch(() => {
          localStorage.clear();
          sessionStorage.clear();
          resolve();
        });
    });
  });
}

export async function ensureFreshStart(page: Page) {
  await page.goto('/');
  await cleanupIndexedDB(page);
  await page.goto('/');
  await waitForModalVisible(page);
}

export async function getProjectList(page: Page): Promise<string[]> {
  const modal = await reopenProjectModal(page);

  const projectCards = modal.locator('.bx--tile');
  const count = await projectCards.count();

  const projects: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await projectCards.nth(i).textContent();
    if (text) projects.push(text.trim());
  }

  return projects;
}
