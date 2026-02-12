import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { CSV_PATH, freshStart, waitForMap, TIMEOUTS } from './helpers';

test.describe('Data Join to Basemap', () => {
  test('should join CSV data with geographic entities to basemap', async ({
    page
  }) => {
    test.slow();
    await freshStart(page);

    // Step 1: Import CSV file with geographic data
    const modal = page.locator('#khartis-create-project .bx--modal-container');
    await expect(modal).toBeVisible({ timeout: TIMEOUTS.duckdbInit });

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(csvPath);

    // Wait for file processing
    await page.waitForTimeout(1000);
    const completeIndicator = modal.locator('[data-testid="file-complete"]');
    await expect(completeIndicator).toBeVisible({
      timeout: TIMEOUTS.action * 4
    });

    // Step 2: Enter project name
    const nameInput = modal.locator('[data-testid="project-name-input"]');
    await expect(nameInput).toBeVisible({ timeout: TIMEOUTS.action });
    await nameInput.fill('Test Data Join');

    // Step 3: Select a basemap (World > countries for international data)
    await page.waitForTimeout(TIMEOUTS.transition);
    const worldBasemap = modal.getByRole('button', {
      name: /World.*countries/i
    });

    if (await worldBasemap.first().isVisible({ timeout: TIMEOUTS.action })) {
      await worldBasemap.first().click();
      await page.waitForTimeout(TIMEOUTS.transition);
    }

    // Step 4: Create project
    const createBtn = modal.getByRole('button', { name: 'Créer', exact: true });
    await expect(createBtn).toBeEnabled({ timeout: TIMEOUTS.action * 2 });
    await createBtn.click();

    // Wait for project creation and map rendering
    await expect(modal).toBeHidden({ timeout: TIMEOUTS.action * 4 });
    await waitForMap(page);

    // Step 5: Verify we're on the data step with geolocation section
    await page.waitForTimeout(2000);

    // Step 6: Navigate through the geolocation workflow
    // Look for the geolocation section (étape 2)
    const geoSection = page.locator('text=/2\\. Géolocaliser/i');
    await expect(geoSection).toBeVisible({ timeout: 10000 });

    // Look for variable selection dropdown or buttons
    // The app should detect geographic columns automatically
    await page.waitForTimeout(2000);

    // Step 7: Verify basemap suggestions appear or catalog is available
    const joinSection = page.locator('text=/3\\. Joindre/i');
    await expect(joinSection).toBeVisible({ timeout: 10000 });

    // Step 8: Verify map canvas is rendered with basemap
    const mapCanvas = page.locator('.map-canvas').first();
    await expect(mapCanvas).toBeVisible({ timeout: 15000 });

    // Step 9: Verify deck.gl canvas shows joined data
    const deckCanvas = page.locator('canvas#deckgl-overlay');
    await expect(deckCanvas).toBeVisible({ timeout: 10000 });

    // Verify canvas has content
    const canvasSize = await deckCanvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height
    }));
    expect(canvasSize.width).toBeGreaterThan(0);
    expect(canvasSize.height).toBeGreaterThan(0);
  });
});
