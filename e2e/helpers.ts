import { expect, type Locator, type Page } from '@playwright/test';
import { accessSync } from 'node:fs';
import { join } from 'node:path';

const isCI = !!process.env.CI;

// Console error tracking
export interface ConsoleError {
  type: 'error' | 'warning';
  text: string;
  location?: string;
}

const IGNORED_CONSOLE_PATTERNS = [
  'ResizeObserver loop',
  'favicon.ico',
  '[vite]',
  'HMR',
  'hot module replacement'
] as const;

export interface ConsoleErrorTracker {
  start: () => void;
  getErrors: () => ConsoleError[];
  hasErrors: () => boolean;
  getErrorSummary: () => string;
  clear: () => void;
}

export function createConsoleErrorTracker(page: Page): ConsoleErrorTracker {
  let errors: ConsoleError[] = [];

  function start(): void {
    errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push({
          type: 'error',
          text: msg.text(),
          location: msg.location()?.url
        });
      }
    });

    page.on('pageerror', (error) => {
      errors.push({
        type: 'error',
        text: error.message,
        location: error.stack
      });
    });
  }

  function getErrors(): ConsoleError[] {
    return errors.filter((trackedError) => {
      return !IGNORED_CONSOLE_PATTERNS.some((pattern) =>
        trackedError.text.toLowerCase().includes(pattern.toLowerCase())
      );
    });
  }

  function hasErrors(): boolean {
    return getErrors().length > 0;
  }

  function getErrorSummary(): string {
    const currentErrors = getErrors();
    if (currentErrors.length === 0) return 'No errors';
    return currentErrors
      .map((trackedError) => {
        if (trackedError.location) {
          return `[${trackedError.type}] ${trackedError.text}\n  at ${trackedError.location}`;
        }
        return `[${trackedError.type}] ${trackedError.text}`;
      })
      .join('\n');
  }

  function clear(): void {
    errors = [];
  }

  return {
    start,
    getErrors,
    hasErrors,
    getErrorSummary,
    clear
  };
}

// Paths - utilise tests-datasets/ (pas de mocks dupliqués)
export const TEST_DATASETS = join(process.cwd(), 'tests-datasets');
export const CSV_PATH = join(TEST_DATASETS, 'csv');
export const GEOJSON_PATH = join(TEST_DATASETS, 'geojson');
export const ZIP_PATH = join(TEST_DATASETS, 'zip');
export const GPKG_PATH = join(TEST_DATASETS, 'gpkg');
export const GPX_PATH = join(TEST_DATASETS, 'gpx');
export const KML_PATH = join(TEST_DATASETS, 'kml-kmz');
export const SHP_PATH = join(TEST_DATASETS, 'shp');

// Selectors
export const MODAL_SELECTOR = '#khartis-create-project .bx--modal-container';
export const SIDENAV_SELECTOR = '#khartis-side-nav .bx--side-nav';

// Timeouts adaptés pour CI et exécution locale parallèle (2+ workers)
export const TIMEOUTS = {
  modal: isCI ? 30000 : 30000,
  map: isCI ? 60000 : 60000,
  fileUpload: isCI ? 15000 : 15000,
  action: isCI ? 25000 : 25000,
  transition: isCI ? 1000 : 500,
  // DuckDB WASM init - higher for parallel execution (resource contention)
  duckdbInit: isCI ? 120000 : 120000
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
  await page.waitForSelector('.map-canvas, canvas', {
    state: 'visible',
    timeout: mapTimeout
  });
  // Wait for map to stabilize
  await page.waitForTimeout(isCI ? 2000 : 1000);
}

export interface FileImportAssertions {
  minRows?: number;
  minColumns?: number;
  exactRows?: number;
  exactColumns?: number;
}

export interface CreateProjectOptions {
  projectName?: string;
  fileAssertions?: FileImportAssertions;
}

export async function createProject(
  page: Page,
  filePath: string,
  projectNameOrOptions?: string | CreateProjectOptions
): Promise<{ rowCount?: number; columnCount?: number }> {
  const options: CreateProjectOptions =
    typeof projectNameOrOptions === 'string'
      ? { projectName: projectNameOrOptions }
      : (projectNameOrOptions ?? {});

  const modal = await waitForModal(page);

  const fileInput = modal.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  // Small delay to ensure file processing starts
  await page.waitForTimeout(500);

  // Wait for file processing to complete (not just timeout)
  // Use data-testid selectors for reliability
  const processingIndicator = modal.locator('[data-testid="file-processing"]');
  const completeIndicator = modal.locator('[data-testid="file-complete"]');
  const errorIndicator = modal.locator('[data-testid="file-error"]');

  // Wait for processing to start or complete (longer timeout for larger files)
  await expect(
    processingIndicator.or(completeIndicator).or(errorIndicator)
  ).toBeVisible({ timeout: TIMEOUTS.fileUpload * 2 });

  // Wait for processing to complete (longer timeout for geo files)
  await expect(processingIndicator).toBeHidden({
    timeout: TIMEOUTS.action * 6
  });

  // Check for errors
  if (await errorIndicator.isVisible()) {
    const errorText = await errorIndicator.textContent();
    throw new Error(`File processing failed: ${errorText}`);
  }

  // Ensure complete tile is visible
  await expect(completeIndicator).toBeVisible({ timeout: TIMEOUTS.action });

  // Validate file import if assertions provided
  let importResult: { rowCount: number; columnCount: number } | undefined;
  if (options.fileAssertions) {
    importResult = await assertFileImported(modal, options.fileAssertions);
  }

  const name = options.projectName || `Test ${Date.now()}`;
  const nameInput = modal.locator('[data-testid="project-name-input"]');

  // Wait for input to be ready
  await expect(nameInput).toBeVisible({ timeout: TIMEOUTS.action });
  await expect(nameInput).toBeEnabled({ timeout: TIMEOUTS.action });
  await nameInput.fill(name);

  // Select a basemap (required step) - prefer "World > countries" as universal default
  const worldBasemap = modal.getByRole('button', {
    name: /World.*countries/i
  });
  const anyBasemap = modal.locator(
    'button[class*="basemap-card"], button:has-text("France > régions")'
  );

  // Wait for basemap suggestions to load
  await page.waitForTimeout(TIMEOUTS.transition);

  // Try to click World basemap first, then any available basemap
  if (await worldBasemap.first().isVisible({ timeout: TIMEOUTS.action })) {
    await worldBasemap.first().click();
  } else if (await anyBasemap.first().isVisible({ timeout: TIMEOUTS.action })) {
    await anyBasemap.first().click();
  }

  // Wait for basemap selection to be processed
  await page.waitForTimeout(TIMEOUTS.transition);

  const createBtn = modal.getByRole('button', { name: 'Créer', exact: true });
  await expect(createBtn).toBeEnabled({ timeout: TIMEOUTS.action * 2 });
  await createBtn.click();

  // Longer timeout for project creation (includes dataset registration, map rendering)
  await expect(modal).toBeHidden({ timeout: TIMEOUTS.action * 4 });

  return importResult ?? {};
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

export async function freshStart(page: Page): Promise<ConsoleErrorTracker> {
  // Start error tracking before navigation
  const errorTracker = createConsoleErrorTracker(page);
  errorTracker.start();

  await page.goto('/');
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      localStorage.clear();
      sessionStorage.clear();
      indexedDB.databases().then((dbs) => {
        const deletePromises = dbs.map((db) => {
          if (db.name) {
            return new Promise<void>((res) => {
              const req = indexedDB.deleteDatabase(db.name!);
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
  // DuckDB WASM init can be slow (WASM binary + extensions download)
  await waitForModal(page, TIMEOUTS.duckdbInit);

  return errorTracker;
}

export function assertNoConsoleErrors(
  errorTracker: ConsoleErrorTracker,
  context?: string
): void {
  const errors = errorTracker.getErrors();
  if (errors.length > 0) {
    const contextMsg = context ? ` during ${context}` : '';
    throw new Error(
      `Console errors detected${contextMsg}:\n${errorTracker.getErrorSummary()}`
    );
  }
}

export function getShapefileComponents(shpPath: string): string[] {
  const baseName = shpPath.replace(/\.shp$/i, '');
  const extensions = ['.shp', '.dbf', '.shx', '.prj', '.cpg'];
  return extensions
    .map((ext) => baseName + ext)
    .filter((filePath) => {
      try {
        accessSync(filePath);
        return true;
      } catch {
        return false;
      }
    });
}

export async function createShapefileProject(
  page: Page,
  shpPath: string,
  projectNameOrOptions?: string | CreateProjectOptions
): Promise<{ rowCount?: number; columnCount?: number }> {
  const options: CreateProjectOptions =
    typeof projectNameOrOptions === 'string'
      ? { projectName: projectNameOrOptions }
      : (projectNameOrOptions ?? {});

  const modal = await waitForModal(page);
  const shapefileComponents = getShapefileComponents(shpPath);

  const dropContainer = modal.locator('[data-testid="file-upload-container"]');
  const fileInput = dropContainer.locator('input[type="file"]');
  await fileInput.setInputFiles(shapefileComponents);

  // Small delay to ensure file processing starts
  await page.waitForTimeout(500);

  // Wait for file processing to complete (not just timeout)
  // Use data-testid selectors for reliability
  const processingIndicator = modal.locator('[data-testid="file-processing"]');
  const completeIndicator = modal.locator('[data-testid="file-complete"]');
  const errorIndicator = modal.locator('[data-testid="file-error"]');

  // Wait for processing to start (longer timeout for shapefiles)
  await expect(
    processingIndicator.or(completeIndicator).or(errorIndicator)
  ).toBeVisible({ timeout: TIMEOUTS.fileUpload * 2 });

  // Wait for processing to complete (longer timeout for shapefiles)
  await expect(processingIndicator).toBeHidden({
    timeout: TIMEOUTS.action * 6
  });

  // Check for errors
  if (await errorIndicator.isVisible()) {
    const errorText = await errorIndicator.textContent();
    throw new Error(`Shapefile processing failed: ${errorText}`);
  }

  // Ensure complete tile is visible
  await expect(completeIndicator).toBeVisible({ timeout: TIMEOUTS.action });

  // Validate file import if assertions provided
  let importResult: { rowCount: number; columnCount: number } | undefined;
  if (options.fileAssertions) {
    importResult = await assertFileImported(modal, options.fileAssertions);
  }

  const name = options.projectName || `Test ${Date.now()}`;
  const nameInput = modal.locator('[data-testid="project-name-input"]');

  // Wait for input to be ready
  await expect(nameInput).toBeVisible({ timeout: TIMEOUTS.action });
  await expect(nameInput).toBeEnabled({ timeout: TIMEOUTS.action });
  await nameInput.fill(name);

  const createBtn = modal.getByRole('button', { name: 'Créer', exact: true });

  // For geo files (shapefile, geojson), button might be enabled without basemap
  // since they have their own geometry
  const isEnabled = await createBtn.isEnabled().catch(() => false);

  if (!isEnabled) {
    // Select a basemap if needed
    const worldBasemap = modal.getByRole('button', {
      name: /World.*countries/i
    });
    const anyBasemap = modal.locator(
      'button[class*="basemap-card"], button:has-text("France > régions")'
    );

    await page.waitForTimeout(TIMEOUTS.transition);

    if (await worldBasemap.first().isVisible({ timeout: TIMEOUTS.action })) {
      await worldBasemap.first().click();
    } else if (
      await anyBasemap.first().isVisible({ timeout: TIMEOUTS.action })
    ) {
      await anyBasemap.first().click();
    }

    await page.waitForTimeout(TIMEOUTS.transition);
  }

  await expect(createBtn).toBeEnabled({ timeout: TIMEOUTS.action * 2 });
  await createBtn.click();

  // Longer timeout for shapefile project creation
  await expect(modal).toBeHidden({ timeout: TIMEOUTS.action * 4 });

  return importResult ?? {};
}

export async function assertFileImported(
  modal: Locator,
  options?: FileImportAssertions
): Promise<{ rowCount: number; columnCount: number }> {
  const completeIndicator = modal.locator('[data-testid="file-complete"]');
  await expect(completeIndicator.first()).toBeVisible({
    timeout: TIMEOUTS.action
  });

  const rowCountEl = modal.locator('[data-testid="file-row-count"]').first();
  const colCountEl = modal.locator('[data-testid="file-column-count"]').first();

  // Get actual counts (may not be present for all file types)
  const rowCountText = await rowCountEl.textContent().catch(() => '0');
  const colCountText = await colCountEl.textContent().catch(() => '0');

  const rowCount = parseInt(rowCountText || '0', 10);
  const columnCount = parseInt(colCountText || '0', 10);

  // Validate against options if provided
  if (options?.minRows !== undefined) {
    expect(
      rowCount,
      `Expected at least ${options.minRows} rows, got ${rowCount}`
    ).toBeGreaterThanOrEqual(options.minRows);
  }

  if (options?.minColumns !== undefined) {
    expect(
      columnCount,
      `Expected at least ${options.minColumns} columns, got ${columnCount}`
    ).toBeGreaterThanOrEqual(options.minColumns);
  }

  if (options?.exactRows !== undefined) {
    expect(
      rowCount,
      `Expected exactly ${options.exactRows} rows, got ${rowCount}`
    ).toBe(options.exactRows);
  }

  if (options?.exactColumns !== undefined) {
    expect(
      columnCount,
      `Expected exactly ${options.exactColumns} columns, got ${columnCount}`
    ).toBe(options.exactColumns);
  }

  return { rowCount, columnCount };
}
