# Testing Strategy & Guide

> **Comprehensive testing guide for Khartis v3**

## Overview

Khartis v3 uses a multi-layered testing approach to ensure reliability and maintainability. This guide covers unit tests, integration tests, and end-to-end tests.

## Test Stack

- **Unit Tests**: Vitest
- **Component Tests**: @testing-library/svelte
- **E2E Tests**: Playwright

### DuckDB Testing Strategy

The application uses **DuckDB WASM** (`@duckdb/duckdb-wasm`) which runs in the browser.

**Testing approach:**

- **Unit tests**: Test validation, format detection, and utility functions (mock DuckDB)
- **Integration tests**: Test **real DuckDB ingestion** of all `tests-datasets/` files via `@duckdb/node-api`, aligned with CDC sections
- **E2E tests**: Test project creation and UI flows in a browser with Playwright
- **Component tests**: Mock DuckDB entirely (see `vitest-setup-client.ts`)

The integration tests (`pipeline-integration.test.ts`) are the authoritative tests for file ingestion — they verify every supported format is correctly loaded by DuckDB with the same options as production (nullstr, normalize_names, decimal_separator).

> **Note:** DuckDB analysis macros using `query_table()` + `"colname"` (summary_general, summary_numeric, histogram\_\*) cannot be tested via Node API. The Node API v1.4 resolves `"colname"` as a string literal, while DuckDB WASM (production) resolves it as a column reference. Only `describe_full` (which uses `duckdb_columns()`) works in both. The integration tests use equivalent direct SQL for statistics.

## Test Structure

```
src/lib/features/
├── data-pipeline/__tests__/          # Data pipeline tests
│   ├── pipeline-integration.test.ts  # Integration: DuckDB ingestion of all tests-datasets/
│   ├── serialization-safety.test.ts  # Serialization round-trip + binary safety
│   ├── duckdb-node-helper.ts         # Helper: DuckDB Node API test instance
│   ├── validators.test.ts            # Unit: file validation logic
│   ├── format-detection.test.ts      # Unit: format detection
│   ├── quality.test.ts               # Unit: quality warnings
│   ├── types.test.ts                 # Unit: type utilities
│   ├── geojson-guards.test.ts        # Unit: GeoJSON validation
│   ├── shapefile-validator.test.ts   # Unit: shapefile validation
│   ├── zip-handler.test.ts           # Unit: ZIP extraction
│   └── test-file-loader.ts           # Test file loader utilities
├── commons/
│   ├── services/*.test.ts            # Service unit tests
│   └── utils/*.test.ts               # Utility unit tests
└── duckdb/__tests__/                 # DuckDB unit tests

e2e/
├── project-modal.spec.ts        # Project creation modal tests
├── side-nav.spec.ts             # Side navigation tests
├── helpers.ts                   # E2E utilities (paths, selectors, helpers)
└── global-setup.ts              # Playwright setup

tests-datasets/                  # Test fixtures
├── csv/                         # CSV files (valid + malformed)
├── geojson/                     # GeoJSON files
├── gpkg/                        # GeoPackage files
├── gpx/                         # GPX files
├── kml-kmz/                     # KML/KMZ files
├── shp/                         # Shapefiles
└── zip/                         # ZIP archives
```

### Pipeline Integration Tests

`pipeline-integration.test.ts` tests **real DuckDB ingestion** of every file in `tests-datasets/` via `@duckdb/node-api`, structured by CDC sections:

| CDC Section                | What is tested                                                                                                                          | Files covered                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **2.A.1 — CSV import**     | Row/column counts + `describe_full` type classification                                                                                 | 7 valid CSVs                           |
| **CSV edge cases**         | Graceful handling (no crash), 0-byte, header-only, broken structure                                                                     | 12 malformed CSVs                      |
| **2.A.4 — Type detection** | text/numeric classification, semantic geo hints (`id_words`), null variations → SQL NULL, empty columns, duplicated name disambiguation | Targeted CSVs                          |
| **2.A.5.b — Statistics**   | count/uniques/nulls, numeric min/max/extent, equi-width histogram bins (direct SQL)                                                     | fossil-fuel CSV                        |
| **2.A.2 — Geo import**     | Geometry + data columns, bounds extraction (`xmin ≤ xmax`, `ymin ≤ ymax`)                                                               | 2 GeoJSON, 3 GPKG, 1 GPX, 1 KML, 4 SHP |
| **ZIP extraction**         | Extract + ingest single-csv, multiple-csv, shapefile-complete                                                                           | 3 ZIPs                                 |

**Total: 41 tests** covering all 30+ data files.

### Serialization Safety Tests

`serialization-safety.test.ts` tests binary round-trip safety:

- Large binary file serialize/deserialize without crash
- `preserveBinary` mode (Uint8Array) vs legacy `number[]` format
- `relatedFilesData` serialization + clone + restore
- Backward compatibility with legacy `number[]` format
- BigInt → Number conversion during `deepCloneForStorage`
- Project storage size estimation for binary + related files

## Running Tests

```bash
# Run all tests (unit + E2E)
pnpm test

# Unit tests only
pnpm test:unit

# Unit tests with UI
pnpm test:unit:ui

# E2E tests
pnpm test:e2e

# E2E tests with UI
pnpm test:e2e:ui

# Run specific test file
pnpm test:unit src/lib/features/data-pipeline/__tests__/validators.test.ts

# Run tests matching pattern
pnpm test:unit -t "should reject empty file"

# Type checking
pnpm check
```

## Vitest Configuration

Vitest is configured in `vite.config.ts` with two test projects:

```typescript
// vite.config.ts
test: {
  projects: [
    {
      // Client tests (Svelte components)
      extends: './vite.config.ts',
      plugins: [svelteTesting()],
      test: {
        name: 'client',
        environment: 'jsdom',
        clearMocks: true,
        include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
        exclude: ['src/lib/server/**'],
        setupFiles: ['./vitest-setup-client.ts']
      }
    },
    {
      // Server tests (pure functions)
      extends: './vite.config.ts',
      test: {
        name: 'server',
        environment: 'node',
        include: ['src/**/*.{test,spec}.{js,ts}'],
        exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
        pool: 'threads',
        fileParallelism: false
      }
    }
  ];
}
```

## Unit Testing

### Basic Test Structure

```typescript
// file.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('FeatureName', () => {
  describe('functionName', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

### Testing Data Pipeline (Functional Pattern)

The data pipeline uses pure functions, not classes:

```typescript
// validators.test.ts
import { describe, it, expect } from 'vitest';
import { PIPELINE_CONST } from '../constants';
import {
  validateFile,
  validateFileExtension,
  validateMimeType
} from '../core/validators';

describe('File Validators', () => {
  describe('validateFile', () => {
    it('should reject empty file (size === 0)', async () => {
      const emptyFile = new File([], 'empty.csv', { type: 'text/csv' });
      const result = await validateFile(emptyFile);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should accept valid file under limits', async () => {
      const validContent = 'id,name,value\n1,test,100\n2,test2,200';
      const validFile = new File([validContent], 'valid.csv', {
        type: 'text/csv'
      });
      const result = await validateFile(validFile);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn for file above WARNING_FILE_SIZE (50MB)', async () => {
      const mockFile = new File(['test'], 'medium.csv', { type: 'text/csv' });
      Object.defineProperty(mockFile, 'size', {
        value: 51 * 1024 * 1024,
        writable: false
      });
      const result = await validateFile(mockFile);
      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('validateFileExtension', () => {
    const allowedExtensions = PIPELINE_CONST.EXTENSIONS.ALL as string[];

    it('should accept supported CSV extension', () => {
      const file = new File(['data'], 'test.csv', { type: 'text/csv' });
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(true);
    });

    it('should reject unsupported extension', () => {
      const file = new File(['data'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats'
      });
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('.xlsx');
    });
  });
});
```

### Testing with Mocked DuckDB

DuckDB is mocked globally in `vitest-setup-client.ts`:

```typescript
// vitest-setup-client.ts
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock matchMedia for JSDOM
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  enumerable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
});

// Mock DuckDB orchestrator
vi.mock('$lib/features/duckdb', () => ({
  duckDBOrchestrator: {
    initialize: vi.fn().mockResolvedValue(undefined),
    executeQuery: vi.fn().mockResolvedValue([]),
    getConnection: vi.fn().mockResolvedValue(null)
  }
}));

vi.mock(
  '$lib/features/commons/services/data-orchestrator.service.svelte',
  () => ({
    dataOrchestratorService: {
      initialize: vi.fn().mockResolvedValue(undefined),
      processData: vi.fn().mockResolvedValue(null)
    }
  })
);
```

For specific tests, override mocks locally:

```typescript
// specific.test.ts
import { vi } from 'vitest';
import { Duck } from '$lib/features/duckdb';

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    query: vi.fn(),
    analyse: vi.fn(),
    get_row_count: vi.fn()
  }
}));

describe('MyFeature', () => {
  it('should query DuckDB', async () => {
    vi.mocked(Duck.query).mockResolvedValue([{ id: 1, name: 'test' }]);

    const result = await myFunction();

    expect(Duck.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
    expect(result).toHaveLength(1);
  });
});
```

### Testing Stores (Svelte 5 Runes)

```typescript
// store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { myStore } from './my.store.svelte';

describe('MyStore', () => {
  beforeEach(() => {
    myStore.reset();
  });

  it('should update state', () => {
    myStore.setValue('test');
    expect(myStore.value).toBe('test');
  });

  it('should compute derived values', () => {
    myStore.setItems([1, 2, 3]);
    expect(myStore.count).toBe(3);
  });
});
```

## Component Testing

### Testing Svelte Components

```typescript
// Button.svelte.test.ts
import { render, fireEvent, screen } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import Button from './Button.svelte';

describe('Button Component', () => {
  it('should render with label', () => {
    render(Button, {
      props: { label: 'Click me' }
    });

    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('should handle click events', async () => {
    const handleClick = vi.fn();
    render(Button, {
      props: {
        label: 'Click',
        onclick: handleClick
      }
    });

    await fireEvent.click(screen.getByText('Click'));

    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('should be disabled when loading', () => {
    render(Button, {
      props: {
        label: 'Submit',
        loading: true
      }
    });

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });
});
```

## End-to-End Testing

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI ? [['html'], ['github']] : 'html',
  globalSetup: './e2e/global-setup.ts',
  timeout: isCI ? 90000 : 45000,
  expect: {
    timeout: isCI ? 30000 : 15000
  },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true }
    }
  ],
  webServer: {
    command: 'pnpm build && pnpm preview',
    port: 4173,
    reuseExistingServer: !isCI,
    timeout: isCI ? 180000 : 120000
  }
});
```

### E2E Helpers

The project provides reusable helpers in `e2e/helpers.ts`:

```typescript
// e2e/helpers.ts
import { expect, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';

// Paths to test datasets
export const TEST_DATASETS = join(process.cwd(), 'tests-datasets');
export const CSV_PATH = join(TEST_DATASETS, 'csv');
export const GEOJSON_PATH = join(TEST_DATASETS, 'geojson');
export const GPKG_PATH = join(TEST_DATASETS, 'gpkg');
export const GPX_PATH = join(TEST_DATASETS, 'gpx');
export const KML_PATH = join(TEST_DATASETS, 'kml-kmz');
export const SHP_PATH = join(TEST_DATASETS, 'shp');
export const ZIP_PATH = join(TEST_DATASETS, 'zip');

// Selectors
export const MODAL_SELECTOR = '#khartis-create-project .bx--modal-container';
export const SIDENAV_SELECTOR = '#khartis-side-nav .bx--side-nav';

// CI-aware timeout configuration
export const TIMEOUTS = {
  modal: isCI ? 30000 : 15000,
  map: isCI ? 60000 : 30000,
  action: isCI ? 30000 : 15000
};

// Wait for modal to be visible
export async function waitForModal(
  page: Page,
  timeout?: number
): Promise<Locator>;

// Wait for map container to be visible and stabilize
export async function waitForMap(page: Page, timeout?: number): Promise<void>;

// Create a new project with file upload
export async function createProject(
  page: Page,
  filePath: string,
  projectName?: string
): Promise<void>;

// Create project from shapefile bundle
export async function createShapefileProject(
  page: Page,
  shpFolder: string,
  projectName?: string
): Promise<void>;

// Open the side navigation menu
export async function openSideNav(page: Page): Promise<Locator>;

// Clear all storage and start fresh
export async function freshStart(page: Page): Promise<void>;

// Console error tracking for test validation
export type ConsoleErrorTracker = {
  start: (page: Page) => void;
  getErrors: () => string[];
  clear: () => void;
};
export function createConsoleErrorTracker(): ConsoleErrorTracker;

// Assert no console errors during test
export async function assertNoConsoleErrors(tracker: ConsoleErrorTracker): void;
```

### Basic E2E Test

```typescript
// e2e/project-modal.spec.ts
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  CSV_PATH,
  MODAL_SELECTOR,
  waitForModal,
  waitForMap,
  createProject,
  freshStart
} from './helpers';

test.describe('Create Project Modal', () => {
  test('should display modal with all tabs', async ({ page }) => {
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
  });

  test('should upload CSV and create project', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    await createProject(page, csvPath, `Test Project ${Date.now()}`);
    await waitForMap(page);

    await expect(page.locator('.map-container').first()).toBeVisible();
  });

  test('should create project from example', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const modal = await waitForModal(page);
    await modal.locator('[data-testid="tab-try-example"]').click();

    const exampleCard = page.getByRole('button', {
      name: /Population Europe 2023/i
    });
    await expect(exampleCard).toBeVisible({ timeout: 10000 });
    await exampleCard.click();

    await waitForMap(page, 45000);
    await expect(page.locator('.map-container').first()).toBeVisible();
  });
});
```

### Testing User Interactions

```typescript
// e2e/side-nav.spec.ts
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

    // Change language
    await page.locator('#khartis-side-nav select').selectOption('en');
    await page.waitForTimeout(500);
    await expect(
      page.locator('[data-testid="sidenav-new-project"]')
    ).toContainText('New project');

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(page.locator(SIDENAV_SELECTOR)).toBeHidden();
  });
});
```

## Test Datasets

The `tests-datasets/` folder contains real and malformed files for testing:

### CSV Files (`tests-datasets/csv/`)

**Valid files:**

- `fossil-fuel-subsidies-gdp-2021.csv` - World data with numeric values
- `naissances-par-commune-departement-et-region-2018.csv` - French communes (34k+ rows)
- `sites-seveso-idf.csv` - GPS coordinates
- `world-bank-rural-pop.csv` - World Bank data
- `test-csv-options-header.csv` - CSV options test fixture
- `test-csv-options-second-file.csv` - CSV options test fixture
- `test-csv-options-thousands.csv` - CSV options test fixture

**Malformed files (for edge case testing):**

- `csv-malformed--with-nothing.csv` - Empty file
- `csv-malformed--with-header-only.csv` - Header without data
- `csv-malformed--with-no-header.csv` - Data without header
- `csv-malformed--with-empty-columns.csv` - Columns with no values
- `csv-malformed--with-empty-lines.csv` - Contains blank lines
- `csv-malformed--with-100-columns.csv` - Wide dataset
- `csv-malformed--with-duplicated-column-name.csv` - Duplicate headers
- `csv-malformed--with-special-characters.csv` - Unicode, quotes, etc.
- `csv-malformed--with-european-numeric-format.csv` - Comma as decimal
- `csv-malformed--with-null-variations.csv` - NA, N/A, null, etc.
- `csv-malformed--with-numeric-formats-mixed.csv` - Mixed number formats
- `csv-malformed--with-numeric-all-edge-cases.csv` - Infinity, NaN, etc.

### Geospatial Files

**GeoJSON (`tests-datasets/geojson/`):**

- `lignes-du-reseau-star-de-rennes-metropole.geojson` - LineString features
- `nuts2_data.geojson` - European NUTS2 regions with attributes

**GeoPackage (`tests-datasets/gpkg/`):**

- `compagnies-herault-l93.gpkg` - French data in Lambert-93 projection
- `ADMIN-EXPRESS_4-0__GPKG.../ADE_4-0_GPKG...gpkg` - IGN Admin Express Guadeloupe
- `ADE 4.0 GPKG GLP ED Dec 5 2025.gpkg` - Same data, filename with spaces (edge case)

**GPX (`tests-datasets/gpx/`):**

- `star_arrets_physiques_actifs/star_arrets_physiques_actifs.gpx` - Public transit stops (Point)

**KML (`tests-datasets/kml-kmz/`):**

- `aires-covoiturage/aires-covoiturage.kml` - Carpooling areas

**Shapefiles (`tests-datasets/shp/`):**

- `ne_50m/` - Natural Earth 50m countries
- `mos_foncier_agrege_com/` - French land use data
- `lignes-du-reseau-star-de-rennes-metropole/` - Transit lines
- `Marines-regionsEEZ_land_union_v3_202003/` - Marine EEZ regions

**ZIP Archives (`tests-datasets/zip/`):**

- `single-csv.zip` - Single CSV in archive
- `multiple-csv.zip` - Multiple CSV files
- `shapefile-complete.zip` - Complete shapefile bundle

### Using Test Datasets

**Test File Loader (`test-file-loader.ts`):**

```typescript
// Unit tests: Use the test file loader for structured access
import {
  CSV_TEST_FILES,
  GEOJSON_TEST_FILES,
  GPKG_TEST_FILES,
  GPX_TEST_FILES,
  KML_TEST_FILES,
  ZIP_TEST_FILES,
  loadTestFile
} from '../__tests__/test-file-loader';

// Load a test file as File object
const file = loadTestFile(CSV_TEST_FILES.VALID.FOSSIL_FUEL);
const result = await validateFile(file);

// Available test file constants:
CSV_TEST_FILES.VALID.FOSSIL_FUEL; // csv/fossil-fuel-subsidies-gdp-2021.csv
CSV_TEST_FILES.VALID.NAISSANCES; // csv/naissances-par-commune-...csv
CSV_TEST_FILES.MALFORMED.NOTHING; // csv/csv-malformed--with-nothing.csv
GEOJSON_TEST_FILES.STAR_LINES; // geojson/lignes-du-reseau-star...geojson
GPKG_TEST_FILES.COMPAGNIES_HERAULT; // gpkg/compagnies-herault-l93.gpkg
GPX_TEST_FILES.STAR_ARRETS; // gpx/star_arrets.../star_arrets...gpx
KML_TEST_FILES.AIRES_COVOITURAGE; // kml-kmz/aires-covoiturage/...kml
ZIP_TEST_FILES.SHAPEFILE; // zip/shapefile-complete.zip
```

**E2E tests: Use path helpers:**

```typescript
import { CSV_PATH, GEOJSON_PATH, ZIP_PATH } from './helpers';
const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
await modal.locator('input[type="file"]').setInputFiles(csvPath);
```

## Testing Best Practices

### 1. Test Organization

- **Arrange-Act-Assert** pattern
- **One assertion per test** (when possible)
- **Descriptive test names** that explain the scenario

### 2. Test Independence

```typescript
// Good: Each test is independent
beforeEach(() => {
  store.reset();
  vi.clearAllMocks();
});

// Bad: Tests depend on order
let sharedState;
it('test 1', () => {
  sharedState = createSomething(); // Don't do this
});
```

### 3. Mock External Dependencies

```typescript
// Mock network requests
vi.mock('fetch', () => ({
  default: vi.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve({ data: 'mocked' })
    })
  )
}));
```

### 4. Test User Behavior, Not Implementation

```typescript
// Good: Test behavior
it('should display error when file is invalid', async () => {
  const invalidFile = new File([''], 'test.xyz');
  await uploadFile(invalidFile);
  expect(screen.getByText(/unsupported file type/i)).toBeVisible();
});

// Bad: Test implementation details
it('should call validateFile method', () => {
  const spy = vi.spyOn(component, 'validateFile');
  // Don't test private methods
});
```

### 5. Use Data Attributes for E2E Tests

```svelte
<!-- Component.svelte -->
<button data-testid="submit-button">Submit</button>
```

```typescript
// e2e test
await page.click('[data-testid="submit-button"]');
```

## Debugging Tests

### Debug Unit Tests

```bash
# Run specific test file
pnpm test:unit src/lib/features/data-pipeline/__tests__/validators.test.ts

# Run tests matching pattern
pnpm test:unit -t "should parse CSV"

# Run with UI for debugging
pnpm test:unit:ui
```

### Debug E2E Tests

```bash
# Run in headed mode (see browser)
pnpm test:e2e --headed

# Run with Playwright debug mode
PWDEBUG=1 pnpm test:e2e

# Generate trace for failed tests
pnpm test:e2e --trace on

# View trace file
npx playwright show-trace trace.zip

# Run with UI for step-by-step debugging
pnpm test:e2e:ui
```

## Common Test Patterns

### Testing Error Handling

```typescript
it('should handle network errors gracefully', async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

  const result = await fetchData();

  expect(result).toBeNull();
  expect(errorStore.hasError).toBe(true);
});
```

### Testing Async State Updates

```typescript
it('should update loading state during async operation', async () => {
  const { getByText, queryByText } = render(AsyncComponent);

  expect(queryByText('Loading...')).not.toBeInTheDocument();

  fireEvent.click(getByText('Load Data'));

  await waitFor(() => {
    expect(getByText('Loading...')).toBeInTheDocument();
  });

  await waitFor(() => {
    expect(queryByText('Loading...')).not.toBeInTheDocument();
    expect(getByText('Data loaded')).toBeInTheDocument();
  });
});
```

### Testing File Validation Edge Cases

```typescript
it('should reject file exceeding MAX_FILE_SIZE', async () => {
  // Mock file size without allocating memory
  const mockFile = new File(['test'], 'large.csv', { type: 'text/csv' });
  Object.defineProperty(mockFile, 'size', {
    value: 101 * 1024 * 1024, // 101MB
    writable: false
  });

  const result = await validateFile(mockFile);

  expect(result.isValid).toBe(false);
  expect(result.errors[0]).toContain('size');
});
```

---

**Last Updated**: 2026-01-27
**Version**: 3.4.0
