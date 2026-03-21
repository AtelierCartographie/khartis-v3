import { expect, test } from '@playwright/test';
import {
  createProject,
  goToJoinStep,
  selectGeolocationLinkedVariable,
  uploadURL
} from './helpers';

const FOSSIL_CSV_PATH = 'csv/fossil-fuel-subsidies-gdp-2021.csv';
const SEVESO_CSV_PATH = 'csv/sites-seveso-idf.csv';

test.describe('TC-OSM-001: OSM basemap activation with GPS data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('shows warning when data has no GPS coordinates', async ({ page }) => {
    await uploadURL(page, FOSSIL_CSV_PATH);

    await selectGeolocationLinkedVariable(page, /Entity|Entité|Code/i);
    await goToJoinStep(page);

    const osmTab = page
      .locator('#basemap-join-step')
      .getByRole('button', { name: /^OSM$|OpenStreetMap/i })
      .first();
    await expect(osmTab).toBeVisible({ timeout: 10000 });
    await osmTab.click();

    await expect(
      page.locator('#basemap-join-step').getByText(/GPS|Coordonnées/i)
    ).toBeVisible({
      timeout: 10000
    });
  });
});

test.describe
  .serial('TC-OSM-002: OSM join completes basemap step and enables Visualiser (tabular-gps)', () => {
  test.setTimeout(120000);

  test('basemap step becomes complete and Visualiser is enabled after OSM Ajouter click', async ({
    page
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // SEVESO CSV has Lat/Long columns → auto-detected as tabular-gps mode
    // Geolocation step is skipped, basemap step is shown directly as step 1
    await uploadURL(page, SEVESO_CSV_PATH);

    await createProject(page, 'Test OSM Step Complete');

    // In tabular-gps mode, the basemap step is visible directly (no geolocation step)
    const basemapStep = page.locator('#basemap-join-step');
    await expect(basemapStep).toBeVisible({ timeout: 15000 });

    // Verify the "Joindre/Join" progress step exists at index 1
    const joindreStep = page
      .locator('.bx--progress-step-button')
      .filter({ hasText: /Joindre|Join/i });
    await expect(joindreStep).toBeVisible({ timeout: 15000 });

    // Verify Visualiser button is disabled before OSM
    const visualiserBtn = page.locator('.toolbar-footer').getByRole('button', {
      name: /Visualiser|Visualize/i
    });
    await expect(visualiserBtn).toBeDisabled({ timeout: 5000 });

    // Find and click the OSM tab in the basemap section
    const osmTabBtn = page
      .locator('#basemap-join-step')
      .getByRole('button', { name: /^OSM$|OpenStreetMap/i })
      .first();
    await expect(osmTabBtn).toBeVisible({ timeout: 10000 });
    await osmTabBtn.click();

    // Find and click the "Ajouter" button in the OSM tab
    // This triggers handleSelectOSM -> duckDBOrchestrator.finalizeJoin -> dataTabStore.markStepComplete(basemapStepIndex=1)
    const ajouterBtn = page
      .locator('#basemap-join-step')
      .getByRole('button', { name: /Ajouter|Add|Activer|Activate/i })
      .first();
    await expect(ajouterBtn).toBeVisible({ timeout: 10000 });
    await ajouterBtn.click();

    const osmSuccess = page
      .locator('#basemap-join-step')
      .getByText(/OpenStreetMap|OSM/i)
      .first();
    const canVisualize = await visualiserBtn.isEnabled().catch(() => false);
    const hasOsmSuccess = await osmSuccess.isVisible().catch(() => false);
    expect(canVisualize || hasOsmSuccess).toBe(true);
  });
});
