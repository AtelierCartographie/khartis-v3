import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { CSV_PATH, createProject, freshStart, waitForMap } from './helpers';

test.describe('Visualization Rendering', () => {
  test('should render visualization after project creation', async ({
    page
  }) => {
    test.slow();
    await freshStart(page);

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    await createProject(page, csvPath, 'Test Viz Rendering');
    await waitForMap(page);

    // Navigate to Visualisations step
    await page.locator('button:has-text("Visualisations")').first().click();
    await page.waitForTimeout(2000);

    // Verify map is still visible on Visualisations step
    const mapCanvas = page.locator('.map-canvas').first();
    await expect(mapCanvas).toBeVisible({ timeout: 10000 });

    // Verify deck.gl canvas is rendered
    const deckCanvas = page.locator('canvas#deckgl-overlay');
    await expect(deckCanvas).toBeVisible({ timeout: 10000 });
  });

  test('should render map layers after project creation', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    await createProject(page, csvPath, 'Test Map Layers');
    await waitForMap(page);

    // Verify canvas is rendered
    const canvas = page.locator('canvas#deckgl-overlay');
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // Verify canvas has content (width and height > 0)
    const canvasSize = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height
    }));
    expect(canvasSize.width).toBeGreaterThan(0);
    expect(canvasSize.height).toBeGreaterThan(0);
  });

  test('should display basemap after project creation', async ({ page }) => {
    test.slow();
    await freshStart(page);

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    await createProject(page, csvPath, 'Test Basemap Display');
    await waitForMap(page);

    // Verify map canvas is visible
    const mapCanvas = page.locator('.map-canvas').first();
    await expect(mapCanvas).toBeVisible();

    // Verify deck.gl canvas is rendered
    const deckCanvas = page.locator('canvas#deckgl-overlay');
    await expect(deckCanvas).toBeVisible({ timeout: 10000 });
  });
});
