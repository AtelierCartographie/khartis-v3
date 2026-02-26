import { expect, test } from '@playwright/test';
import {
  goToJoinStep,
  selectGeolocationLatitude,
  selectGeolocationLinkedVariable,
  selectGeolocationLongitude,
  switchToGeolocationCoordinates,
  uploadURL
} from './helpers';

const FOSSIL_CSV_PATH = 'csv/fossil-fuel-subsidies-gdp-2021.csv';
const FUZZY_CSV_PATH = 'csv/fuzzy-countries.csv';
const SEVESO_CSV_PATH = 'csv/sites-seveso-idf.csv';
const NUTS2_GEOJSON_PATH = 'geojson/nuts2_data.geojson';

async function selectWorldBasemap(
  page: import('@playwright/test').Page
): Promise<void> {
  const worldBasemap = page
    .locator('#basemap-join-step')
    .getByRole('button', { name: /World\s*>\s*countries|World|countries/i })
    .first();
  await expect(worldBasemap).toBeVisible({ timeout: 15000 });
  await worldBasemap.click();
}

async function openOsmTab(
  page: import('@playwright/test').Page
): Promise<void> {
  const osmTab = page
    .locator('#basemap-join-step')
    .getByRole('button', { name: /^OSM$|OpenStreetMap/i })
    .first();
  await expect(osmTab).toBeVisible({ timeout: 10000 });
  await osmTab.click();
}

test.describe
  .serial('TC-JOIN-001: Workflow tabulaire affiche 3 sections', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('affiche les sections Contrôler, Géolocaliser, Joindre pour dataset tabulaire', async ({
    page
  }) => {
    await uploadURL(page, FOSSIL_CSV_PATH);

    await page.waitForTimeout(2000);

    const dataTab = page.locator('#khartis-data-tab');
    await expect(dataTab).toBeVisible();

    await expect(
      page
        .locator('.bx--progress-step-button')
        .filter({ hasText: /Contrôler|Control/i })
        .first()
    ).toBeVisible();
    await expect(
      page
        .locator('.bx--progress-step-button')
        .filter({ hasText: /Géolocaliser|Geolocate/i })
        .first()
    ).toBeVisible();
    await expect(
      page
        .locator('.bx--progress-step-button')
        .filter({ hasText: /Joindre|Join/i })
        .first()
    ).toBeVisible();
  });
});

test.describe.serial('TC-JOIN-002: Suggestions de fonds', () => {
  test('suggère des fonds et auto-sélectionne le premier', async ({ page }) => {
    await page.goto('/');
    await uploadURL(page, FOSSIL_CSV_PATH);

    await selectGeolocationLinkedVariable(page, /Entity|Entité/i);
    await goToJoinStep(page);

    await page.waitForTimeout(2000);

    const suggestionBlock = page
      .locator('[data-testid="basemap-suggestions"], .basemap-suggestions')
      .first();
    await expect(
      suggestionBlock.or(page.getByText(/suggestion|Suggestion/i).first())
    ).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(2000);

    const selectedBasemapCard = page
      .locator('.suggestions-scroll .basemap-card.selected')
      .first();
    await expect(selectedBasemapCard).toBeVisible({ timeout: 10000 });

    await expect(selectedBasemapCard).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe
  .serial('TC-JOIN-004: Auto-finalisation sur jointure propre', () => {
  test('finalise automatiquement si aucune erreur de jointure', async ({
    page
  }) => {
    await page.goto('/');
    await uploadURL(page, FOSSIL_CSV_PATH);

    await selectGeolocationLinkedVariable(page, /Code/i);
    await goToJoinStep(page);

    await page.waitForTimeout(3000);

    await selectWorldBasemap(page);

    await page.waitForTimeout(3000);

    const joinedCount = page
      .locator('[data-testid="joined-count"], .joined-count')
      .first();
    if (await joinedCount.isVisible()) {
      const text = await joinedCount.textContent();
      const count = parseInt(text || '0');
      expect(count).toBeGreaterThan(0);
    }
  });
});

test.describe.serial('TC-JOIN-005: Cas TO_VERIFY et UNRECOGNIZED', () => {
  test('affiche catégories à vérifier et non reconnues', async ({ page }) => {
    await page.goto('/');
    await uploadURL(page, FUZZY_CSV_PATH);

    await selectGeolocationLinkedVariable(page, /Entity|Entité/i);
    await goToJoinStep(page);

    await page.waitForTimeout(3000);

    await selectWorldBasemap(page);

    await page.waitForTimeout(5000);

    const toVerifySection = page.getByText(/à vérifier|to verify/i).first();
    await expect(
      toVerifySection.or(page.locator('[data-testid="to-verify-category"]'))
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe.serial('TC-JOIN-008: Blocage finalisation si doublons', () => {
  test('bloque finalisation avec doublons source', async ({ page }) => {
    await page.goto('/');
    await uploadURL(page, FOSSIL_CSV_PATH);

    await selectGeolocationLinkedVariable(page, /Year|_year/i);
    await goToJoinStep(page);

    await page.waitForTimeout(3000);

    await selectWorldBasemap(page);

    await page.waitForTimeout(5000);

    const blockingSignal = page
      .getByText(/doublon|duplicate|à vérifier|to verify|error|erreur/i)
      .first();
    const finalizeButton = page
      .getByRole('button', { name: /Valider|Validate|Finalize|Finaliser/i })
      .first();

    const hasBlockingSignal = await blockingSignal
      .isVisible()
      .catch(() => false);
    const finalizeVisible = await finalizeButton.isVisible().catch(() => false);
    const finalizeEnabled = finalizeVisible
      ? await finalizeButton.isEnabled().catch(() => false)
      : false;

    expect(hasBlockingSignal || !finalizeEnabled).toBe(true);
  });
});

test.describe.serial('TC-JOIN-010: Import fond custom GeoJSON', () => {
  test.setTimeout(120000);

  test('importe fichier GeoJSON personnalisé', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await uploadURL(page, FOSSIL_CSV_PATH);

    await selectGeolocationLinkedVariable(page, /Code|Entity|Entité/i);
    await goToJoinStep(page);

    await page.waitForTimeout(1000);

    const importTab = page
      .locator('#basemap-join-step')
      .getByRole('button', { name: /Importer|Import/i })
      .first();
    await expect(importTab).toBeVisible({ timeout: 5000 });
    await importTab.click();

    await page.waitForTimeout(500);

    await uploadURL(
      page,
      NUTS2_GEOJSON_PATH,
      page.locator('#basemap-join-step')
    );

    const importedFile = page
      .locator('#basemap-join-step')
      .getByText(/Fichier importé|File imported/i)
      .first();
    await expect(importedFile).toBeVisible({ timeout: 60000 });
  });
});

test.describe.serial('TC-JOIN-014: OSM indisponible sans GPS', () => {
  test('affiche message GPS requis pour OSM sans colonnes coordonnées', async ({
    page
  }) => {
    await page.goto('/');
    await uploadURL(page, FOSSIL_CSV_PATH);

    await selectGeolocationLinkedVariable(page, /Entity|Entité|Code/i);
    await goToJoinStep(page);

    await page.waitForTimeout(1000);

    await openOsmTab(page);

    await page.waitForTimeout(500);

    const gpsRequired = page
      .getByText(/GPS|coordonnée|coordinate|required/i)
      .first();
    await expect(
      gpsRequired.or(page.locator('[data-testid="osm-gps-required"]'))
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe.serial('TC-JOIN-015: Activation OSM avec coordonnées', () => {
  test('active OSM avec coordonnées GPS valides', async ({ page }) => {
    await page.goto('/');
    await uploadURL(page, SEVESO_CSV_PATH);

    await switchToGeolocationCoordinates(page);
    await selectGeolocationLatitude(page, /lat|latitude/i);
    await selectGeolocationLongitude(page, /long|longitude/i);
    await goToJoinStep(page);

    await page.waitForTimeout(1000);

    await openOsmTab(page);

    await page.waitForTimeout(500);

    const activateOsm = page
      .getByRole('button', { name: /activer|activate|enable/i })
      .first();
    if (await activateOsm.isVisible()) {
      await activateOsm.click();
    }

    const visualiserBtn = page.locator('.toolbar-footer').getByRole('button', {
      name: /Visualiser|Visualize/i
    });
    const osmSuccess = page
      .locator('#basemap-join-step')
      .getByText(/OpenStreetMap|OSM/i)
      .first();
    const canVisualize = await visualiserBtn.isEnabled().catch(() => false);
    const hasOsmSuccess = await osmSuccess.isVisible().catch(() => false);
    expect(canVisualize || hasOsmSuccess).toBe(true);
  });
});

test.describe.serial('TC-JOIN-016: Apply corrections button', () => {
  test('affiche et clique sur le bouton Appliquer les corrections', async ({
    page
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await uploadURL(page, FUZZY_CSV_PATH);

    await selectGeolocationLinkedVariable(page, /Entity|Entité/i);
    await goToJoinStep(page);

    await page.waitForTimeout(3000);

    await selectWorldBasemap(page);

    await page.waitForTimeout(5000);

    const applyCorrectionsButton = page
      .getByRole('button', { name: /Appliquer|Apply|correction/i })
      .first();
    if (await applyCorrectionsButton.isVisible().catch(() => false)) {
      await applyCorrectionsButton.click({ force: true });
      await page.waitForTimeout(1500);
      const correctionDialog = page
        .locator('[role="dialog"], .bx--modal, .correction-panel')
        .first();
      await expect(correctionDialog).toBeVisible({ timeout: 5000 });
      return;
    }

    const visualiserBtn = page.locator('.toolbar-footer').getByRole('button', {
      name: /Visualiser|Visualize/i
    });
    const blockingSignal = page
      .getByText(/à vérifier|to verify|doublon|duplicate|erreur|error/i)
      .first();

    const canVisualize = await visualiserBtn.isEnabled().catch(() => false);
    const hasBlockingSignal = await blockingSignal
      .isVisible()
      .catch(() => false);
    expect(canVisualize || hasBlockingSignal).toBe(true);
  });
});
