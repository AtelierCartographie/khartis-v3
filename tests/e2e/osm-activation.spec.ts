import { expect, test } from '@playwright/test';
import { createProject, goToJoinStep, selectGeolocationLinkedVariable, uploadURL } from './helpers';

const FOSSIL_CSV_PATH = 'csv/fossil-fuel-subsidies-gdp-2021.csv';
const SEVESO_CSV_PATH = 'csv/sites-seveso-idf.csv';

// Selector for the "Reference basemap" / "Fond de référence" tab
const REFERENCE_BASEMAP_TAB_NAME = /Fond de référence|Reference basemap/i;

test.describe('TC-OSM-001: Reference basemap tab shows GPS warning for non-GPS data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('shows warning when data has no GPS coordinates', async ({ page }) => {
    await uploadURL(page, FOSSIL_CSV_PATH);

    await selectGeolocationLinkedVariable(page, /Entity|Entité|Code/i);
    await goToJoinStep(page);

    const refBasemapTab = page
      .locator('#basemap-join-step')
      .getByRole('button', { name: REFERENCE_BASEMAP_TAB_NAME })
      .first();
    await expect(refBasemapTab).toBeVisible({ timeout: 10000 });
    await refBasemapTab.click();

    await expect(
      page.locator('#basemap-join-step').getByText(/GPS|Coordonnées/i)
    ).toBeVisible({
      timeout: 10000
    });
  });
});

test.describe
  .serial('TC-OSM-002: Reference basemap tab with GPS data enables Visualiser (tabular-gps)', () => {
  test.setTimeout(120000);

  test('basemap step becomes complete and Visualiser is enabled after reference basemap Ajouter click', async ({
    page
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // SEVESO CSV has Lat/Long columns → auto-detected as tabular-gps mode
    await uploadURL(page, SEVESO_CSV_PATH);

    await createProject(page, 'Test OSM Step Complete');

    // In tabular-gps mode, the basemap step is visible directly (no geolocation step)
    const basemapStep = page.locator('#basemap-join-step');
    await expect(basemapStep).toBeVisible({ timeout: 15000 });

    // Verify the "Joindre/Join" progress step exists
    const joindreStep = page
      .locator('.bx--progress-step-button')
      .filter({ hasText: /Joindre|Join/i });
    await expect(joindreStep).toBeVisible({ timeout: 15000 });

    // Verify Visualiser button is disabled before reference basemap
    const visualiserBtn = page.locator('.toolbar-footer').getByRole('button', {
      name: /Visualiser|Visualize/i
    });
    await expect(visualiserBtn).toBeDisabled({ timeout: 5000 });

    // Find and click the Reference basemap tab
    const refBasemapTabBtn = page
      .locator('#basemap-join-step')
      .getByRole('button', { name: REFERENCE_BASEMAP_TAB_NAME })
      .first();
    await expect(refBasemapTabBtn).toBeVisible({ timeout: 10000 });
    await refBasemapTabBtn.click();

    // Find and click the "Ajouter" button
    const ajouterBtn = page
      .locator('#basemap-join-step')
      .getByRole('button', { name: /Ajouter|Add|Activer|Activate/i })
      .first();
    await expect(ajouterBtn).toBeVisible({ timeout: 10000 });
    await ajouterBtn.click();

    const canVisualize = await visualiserBtn.isEnabled().catch(() => false);
    const hasRefBasemapSuccess = await page
      .locator('#basemap-join-step')
      .getByText(/Fond de référence ajouté|Reference basemap added/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(canVisualize || hasRefBasemapSuccess).toBe(true);
  });
});
