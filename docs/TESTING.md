# Testing Strategy & Guide

> **Comprehensive testing guide for Khartis v3**

## Overview

Khartis v3 uses a multi-layered testing approach to ensure reliability and maintainability. This guide covers unit tests, integration tests, end-to-end tests, and performance testing.

## Test Stack

- **Unit Tests**: Vitest
- **Component Tests**: @testing-library/svelte
- **E2E Tests**: Playwright
- **Performance**: Lighthouse CI
- **Visual Regression**: Percy (optional)

## Test Structure

```
tests/
├── unit/                 # Unit tests for utilities and logic
├── integration/          # Integration tests for features
└── e2e/                  # End-to-end user flows

src/
└── lib/
    └── features/
        └── feature-name/
            ├── *.test.ts        # Unit tests
            └── *.svelte.test.ts # Component tests
```

## Running Tests

```bash
# Run all tests
yarn test

# Unit tests only
yarn test:unit

# Unit tests in watch mode
yarn test:unit:watch

# E2E tests
yarn test:e2e

# E2E tests with UI
yarn test:e2e:ui

# Coverage report
yarn test:coverage

# Type checking
yarn check
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

### Testing Data Pipeline

```typescript
// parsers/csv.parser.test.ts
import { describe, it, expect, vi } from 'vitest';
import { CSVParser } from './csv.parser';
import { Duck } from '$lib/features/duckdb';

// Mock DuckDB
vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    read_csv: vi.fn(),
    query: vi.fn()
  }
}));

describe('CSVParser', () => {
  const parser = new CSVParser();

  it('should parse CSV file', async () => {
    // Arrange
    const file = new File(['col1,col2\n1,2'], 'test.csv');
    const mockTable = 'test_table_123';

    Duck.read_csv.mockResolvedValue(mockTable);
    Duck.query.mockResolvedValue([
      { col1: 1, col2: 2 }
    ]);

    // Act
    const result = await parser.parse(file);

    // Assert
    expect(result.tableName).toBe(mockTable);
    expect(Duck.read_csv).toHaveBeenCalledWith(file);
  });

  it('should handle parsing errors', async () => {
    // Arrange
    const file = new File(['invalid'], 'bad.csv');
    Duck.read_csv.mockRejectedValue(new Error('Parse error'));

    // Act & Assert
    await expect(parser.parse(file)).rejects.toThrow('Parse error');
  });
});
```

### Testing Stores (Svelte 5 Runes)

```typescript
// visualization.store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { visualizationStore } from './visualization.store.svelte';

describe('VisualizationStore', () => {
  beforeEach(() => {
    visualizationStore.reset();
  });

  it('should create visualization', () => {
    // Arrange
    const config = {
      type: 'choropleth',
      datasetId: 'dataset-1',
      column: 'population'
    };

    // Act
    const viz = visualizationStore.create(config);

    // Assert
    expect(viz.id).toBeDefined();
    expect(viz.type).toBe('choropleth');
    expect(visualizationStore.visualizations).toHaveLength(1);
  });

  it('should update visualization', () => {
    // Arrange
    const viz = visualizationStore.create({ type: 'choropleth' });

    // Act
    visualizationStore.update(viz.id, { type: 'proportional' });

    // Assert
    const updated = visualizationStore.getById(viz.id);
    expect(updated.type).toBe('proportional');
  });
});
```

### Testing Async Operations

```typescript
// duckdb.service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Duck } from './duck.service';

describe('DuckDB Service', () => {
  it('should execute query with timeout', async () => {
    // Use fake timers
    vi.useFakeTimers();

    // Start async operation
    const queryPromise = Duck.query('SELECT * FROM large_table');

    // Fast-forward time
    vi.advanceTimersByTime(5000);

    // Assert timeout
    await expect(queryPromise).rejects.toThrow('Query timeout');

    vi.useRealTimers();
  });

  it('should cache query results', async () => {
    // Arrange
    const sql = 'SELECT COUNT(*) FROM table';
    const spy = vi.spyOn(Duck, '_executeQuery');

    // Act - first call
    const result1 = await Duck.query(sql);

    // Act - second call (should use cache)
    const result2 = await Duck.query(sql);

    // Assert
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(result2);
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
    // Arrange & Act
    render(Button, {
      props: {
        label: 'Click me'
      }
    });

    // Assert
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('should handle click events', async () => {
    // Arrange
    const handleClick = vi.fn();
    render(Button, {
      props: {
        label: 'Click',
        onclick: handleClick
      }
    });

    // Act
    await fireEvent.click(screen.getByText('Click'));

    // Assert
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('should be disabled when loading', () => {
    // Arrange & Act
    render(Button, {
      props: {
        label: 'Submit',
        loading: true
      }
    });

    // Assert
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveClass('loading');
  });
});
```

### Testing Reactive State (Svelte 5)

```typescript
// DataTable.svelte.test.ts
import { render, screen, waitFor } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import DataTable from './DataTable.svelte';

describe('DataTable with $state', () => {
  it('should update when data changes', async () => {
    // Arrange
    const { component } = render(DataTable, {
      props: {
        data: [{ id: 1, name: 'Item 1' }]
      }
    });

    // Assert initial state
    expect(screen.getByText('Item 1')).toBeInTheDocument();

    // Act - update props
    component.$set({
      data: [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' }
      ]
    });

    // Assert updated state
    await waitFor(() => {
      expect(screen.getByText('Item 2')).toBeInTheDocument();
    });
  });
});
```

## Integration Testing

### Testing Feature Flows

```typescript
// import-flow.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { dataPipeline } from '$lib/features/data-pipeline';
import { datasetsStore } from '$lib/features/commons/store';

describe('Data Import Flow', () => {
  beforeEach(() => {
    datasetsStore.clear();
  });

  it('should import and process CSV file', async () => {
    // Arrange
    const csvContent = 'name,value\nParis,100\nLyon,50';
    const file = new File([csvContent], 'cities.csv');

    // Act
    const dataset = await dataPipeline.processFile(file);
    datasetsStore.add(dataset);

    // Assert
    expect(dataset.rowCount).toBe(2);
    expect(dataset.columns).toHaveLength(2);
    expect(dataset.columns[0].name).toBe('name');
    expect(dataset.columns[0].type).toBe('text');
    expect(dataset.columns[1].name).toBe('value');
    expect(dataset.columns[1].type).toBe('numeric');
    expect(datasetsStore.datasets).toHaveLength(1);
  });

  it('should handle invalid files', async () => {
    // Arrange
    const file = new File(['binary content'], 'invalid.xyz');

    // Act & Assert
    await expect(dataPipeline.processFile(file)).rejects.toThrow(
      'Unsupported file type'
    );
    expect(datasetsStore.datasets).toHaveLength(0);
  });
});
```

### Testing Store Interactions

```typescript
// project-flow.test.ts
import { describe, it, expect } from 'vitest';
import { projectStore } from '$lib/features/commons/store/project.store.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';

describe('Project Management', () => {
  it('should create project with dataset', async () => {
    // Arrange
    const dataset = await createTestDataset();
    datasetsStore.add(dataset);

    // Act
    const project = projectStore.create({
      name: 'Test Project',
      datasets: [dataset.id]
    });

    // Assert
    expect(project.id).toBeDefined();
    expect(project.datasets).toContain(dataset.id);
    expect(projectStore.current?.id).toBe(project.id);
  });

  it('should auto-save project changes', async () => {
    // Arrange
    const project = projectStore.create({ name: 'Test' });
    const saveSpy = vi.spyOn(projectStore, 'save');

    // Act
    projectStore.updateName('Updated Name');

    // Wait for debounced save (30s in prod, mocked to instant in tests)
    await vi.advanceTimersByTime(30000);

    // Assert
    expect(saveSpy).toHaveBeenCalled();
    expect(projectStore.current?.name).toBe('Updated Name');
  });
});
```

## End-to-End Testing

### Basic E2E Test

```typescript
// e2e/import-visualize.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Import and Visualize', () => {
  test('should import CSV and create choropleth', async ({ page }) => {
    // Navigate to app
    await page.goto('/');

    // Click create project
    await page.click('button:has-text("Create New Project")');
    await page.fill('input[name="projectName"]', 'E2E Test Project');
    await page.click('button:has-text("Create")');

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('tests/fixtures/sample.csv');

    // Wait for processing
    await expect(page.locator('.dataset-card')).toBeVisible();

    // Select visualization type
    await page.click('button:has-text("Choropleth")');

    // Configure visualization
    await page.selectOption('select[name="column"]', 'population');
    await page.selectOption('select[name="classification"]', 'quantile');
    await page.fill('input[name="classes"]', '5');

    // Apply visualization
    await page.click('button:has-text("Apply")');

    // Verify map is rendered
    await expect(page.locator('#map canvas')).toBeVisible();
    await expect(page.locator('.legend')).toBeVisible();
  });

  test('should handle large file', async ({ page }) => {
    await page.goto('/');

    // Set up file upload listener
    page.on('filechooser', async (fileChooser) => {
      await fileChooser.setFiles('tests/fixtures/large-dataset.csv');
    });

    // Trigger file chooser
    await page.click('button:has-text("Import Data")');

    // Verify progress bar
    await expect(page.locator('.progress-bar')).toBeVisible();

    // Wait for completion (with timeout)
    await expect(page.locator('.dataset-card')).toBeVisible({
      timeout: 30000
    });
  });
});
```

### Testing User Interactions

```typescript
// e2e/map-interactions.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Map Interactions', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Create project with dataset
    await page.goto('/');
    await setupTestProject(page);
  });

  test('should pan and zoom', async ({ page }) => {
    // Get initial viewport
    const initialView = await page.evaluate(() => {
      return window.map.getCenter();
    });

    // Pan map
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(500, 400);
    await page.mouse.up();

    // Verify pan
    const newView = await page.evaluate(() => {
      return window.map.getCenter();
    });
    expect(newView.lat).not.toBe(initialView.lat);

    // Zoom in
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(500);

    // Verify zoom
    const zoomLevel = await page.evaluate(() => {
      return window.map.getZoom();
    });
    expect(zoomLevel).toBeGreaterThan(1);
  });

  test('should show feature popup on click', async ({ page }) => {
    // Click on a feature
    await page.click('#map canvas', { position: { x: 400, y: 300 } });

    // Verify popup
    await expect(page.locator('.maplibregl-popup')).toBeVisible();
    await expect(page.locator('.popup-content')).toContainText('Population');
  });
});
```

## Performance Testing

### Unit Performance Tests

```typescript
// performance.test.ts
import { describe, it, expect } from 'vitest';
import { classifyQuantile } from '$lib/features/map/utils/classification';

describe('Performance: Classification', () => {
  it('should classify 100k values in <100ms', () => {
    // Arrange
    const values = Array.from({ length: 100000 }, () => Math.random() * 1000);

    // Act
    const start = performance.now();
    const breaks = classifyQuantile(values, 5);
    const duration = performance.now() - start;

    // Assert
    expect(duration).toBeLessThan(100);
    expect(breaks).toHaveLength(6); // n+1 breaks
  });
});
```

### E2E Performance Tests

```typescript
// e2e/performance.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Performance Metrics', () => {
  test('should load page within 3 seconds', async ({ page }) => {
    // Start measuring
    const startTime = Date.now();

    // Navigate
    await page.goto('/');

    // Wait for app ready
    await page.waitForSelector('[data-app-ready]');

    // Calculate load time
    const loadTime = Date.now() - startTime;

    // Assert
    expect(loadTime).toBeLessThan(3000);
  });

  test('should maintain 60fps during map interactions', async ({ page }) => {
    await page.goto('/');
    await setupTestVisualization(page);

    // Measure frame rate
    const metrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        let frames = 0;
        const startTime = performance.now();

        function countFrame() {
          frames++;
          if (performance.now() - startTime < 1000) {
            requestAnimationFrame(countFrame);
          } else {
            resolve(frames);
          }
        }

        // Trigger animation
        window.map.flyTo({ center: [0, 0], zoom: 2 });
        countFrame();
      });
    });

    // Assert ~60fps
    expect(metrics).toBeGreaterThan(50);
  });
});
```

## Test Data Management

### Creating Test Fixtures

```typescript
// tests/fixtures/data-factory.ts
export function createTestCSV(rows = 100): File {
  const headers = ['id', 'name', 'value', 'category'];
  const data = [headers.join(',')];

  for (let i = 0; i < rows; i++) {
    data.push([
      i,
      `Item ${i}`,
      Math.random() * 1000,
      ['A', 'B', 'C'][i % 3]
    ].join(','));
  }

  return new File([data.join('\n')], 'test.csv', {
    type: 'text/csv'
  });
}

export function createTestGeoJSON(): object {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [2.3522, 48.8566]
        },
        properties: {
          name: 'Paris',
          population: 2161000
        }
      }
    ]
  };
}
```

### Mock Data for DuckDB

```typescript
// tests/mocks/duckdb.mock.ts
import { vi } from 'vitest';

export const mockDuckDB = {
  query: vi.fn((sql: string) => {
    if (sql.includes('COUNT(*)')) {
      return [{ count: 100 }];
    }
    if (sql.includes('SELECT *')) {
      return generateMockRows(10);
    }
    return [];
  }),

  breaks: vi.fn(() => [0, 20, 40, 60, 80, 100]),

  analyse: vi.fn(() => ({
    min: 0,
    max: 100,
    mean: 50,
    median: 50,
    stddev: 15
  }))
};
```

## Test Coverage

### Coverage Configuration

```javascript
// vitest.config.ts
export default {
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '*.config.js',
        '**/*.spec.ts',
        '**/*.test.ts'
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80
      }
    }
  }
};
```

### Running Coverage

```bash
# Generate coverage report
yarn test:coverage

# Open HTML report
open coverage/index.html
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
  // Fresh setup for each test
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
// Mock file system
vi.mock('fs', () => ({
  readFile: vi.fn()
}));

// Mock network requests
vi.mock('fetch', () => ({
  default: vi.fn(() => Promise.resolve({
    json: () => Promise.resolve({ data: 'mocked' })
  }))
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

## Continuous Integration

### GitHub Actions Configuration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          corepack enable
          yarn install

      - name: Run unit tests
        run: yarn test:unit

      - name: Run E2E tests
        run: |
          npx playwright install
          yarn test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

## Debugging Tests

### Debug Unit Tests

```bash
# Run specific test file
yarn test:unit src/lib/features/data-pipeline/parsers/csv.parser.test.ts

# Run tests matching pattern
yarn test:unit -t "should parse CSV"

# Run with debugging
node --inspect-brk ./node_modules/.bin/vitest
```

### Debug E2E Tests

```bash
# Run in headed mode
yarn test:e2e --headed

# Run with debug mode
PWDEBUG=1 yarn test:e2e

# Generate trace
yarn test:e2e --trace on

# View trace
npx playwright show-trace trace.zip
```

### Visual Debugging in VS Code

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Unit Tests",
      "runtimeExecutable": "yarn",
      "runtimeArgs": ["test:unit", "--run"],
      "console": "integratedTerminal"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug E2E Tests",
      "runtimeExecutable": "yarn",
      "runtimeArgs": ["test:e2e", "--headed"],
      "console": "integratedTerminal"
    }
  ]
}
```

## Common Test Patterns

### Testing Error Handling

```typescript
it('should handle network errors gracefully', async () => {
  // Simulate network failure
  vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

  // Attempt operation
  const result = await fetchData();

  // Verify error handling
  expect(result).toBeNull();
  expect(errorStore.hasError).toBe(true);
  expect(errorStore.message).toContain('Network error');
});
```

### Testing Async State Updates

```typescript
it('should update loading state during async operation', async () => {
  const { getByText, queryByText } = render(AsyncComponent);

  // Initial state
  expect(queryByText('Loading...')).not.toBeInTheDocument();

  // Trigger async operation
  fireEvent.click(getByText('Load Data'));

  // Loading state
  await waitFor(() => {
    expect(getByText('Loading...')).toBeInTheDocument();
  });

  // Completed state
  await waitFor(() => {
    expect(queryByText('Loading...')).not.toBeInTheDocument();
    expect(getByText('Data loaded')).toBeInTheDocument();
  });
});
```

### Testing Time-Dependent Code

```typescript
it('should debounce search input', async () => {
  vi.useFakeTimers();
  const searchFn = vi.fn();

  const input = screen.getByRole('searchbox');

  // Type quickly
  await userEvent.type(input, 'test');

  // Function not called immediately
  expect(searchFn).not.toHaveBeenCalled();

  // Fast-forward past debounce delay
  vi.advanceTimersByTime(300);

  // Now it should be called
  expect(searchFn).toHaveBeenCalledWith('test');

  vi.useRealTimers();
});
```

---

**Last Updated**: 2025-11-20
**Version**: 3.1.0