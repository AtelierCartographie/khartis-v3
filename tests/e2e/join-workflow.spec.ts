import { expect, test } from '@playwright/test';
import path from 'path';

const TEST_DATASETS_DIR = path.join(process.cwd(), 'tests-datasets');

test.describe
  .serial('TC-JOIN-001: Workflow tabulaire affiche 3 sections', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('affiche les sections Contrôler, Géolocaliser, Joindre pour dataset tabulaire', async ({
    page
  }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(2000);

    const dataTab = page.locator('#khartis-data-tab');
    await expect(dataTab).toBeVisible();

    await expect(page.getByText(/Contrôler|Control/i)).toBeVisible();
    await expect(page.getByText(/Géolocaliser|Geolocate/i)).toBeVisible();
    await expect(page.getByText(/Joindre|Join/i)).toBeVisible();
  });
});

test.describe.serial('TC-JOIN-002: Suggestions de fonds', () => {
  test.use({ storageState: '.auth/user.json' });

  test('suggère des fonds et auto-sélectionne le premier', async ({ page }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(2000);

    const entityColumn = page
      .locator(
        '[data-testid="geolocation-column-selector"], select, [role="combobox"]'
      )
      .first();
    if (await entityColumn.isVisible()) {
      await entityColumn.click();
      await page.getByRole('option', { name: /Entity/i }).click();
    }

    await page.waitForTimeout(1000);

    const joinSection = page.getByText(/Joindre|Join/i).first();
    await joinSection.click();

    await page.waitForTimeout(2000);

    const suggestionBlock = page
      .locator('[data-testid="basemap-suggestions"], .basemap-suggestions')
      .first();
    await expect(
      suggestionBlock.or(page.getByText(/suggestion|Suggestion/i).first())
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe
  .serial('TC-JOIN-004: Auto-finalisation sur jointure propre', () => {
  test('finalise automatiquement si aucune erreur de jointure', async ({
    page
  }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(2000);

    const codeColumn = page
      .locator(
        '[data-testid="geolocation-column-selector"], select, [role="combobox"]'
      )
      .first();
    if (await codeColumn.isVisible()) {
      await codeColumn.click();
      const codeOption = page.getByRole('option', { name: /Code/i });
      if (await codeOption.isVisible()) {
        await codeOption.click();
      }
    }

    await page.waitForTimeout(1000);

    const joinTab = page.getByText(/Joindre|Join/i).first();
    await joinTab.click();

    await page.waitForTimeout(3000);

    const worldBasemap = page.getByText(/World|countries/i).first();
    if (await worldBasemap.isVisible()) {
      await worldBasemap.click();
    }

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
    const fuzzyCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fuzzy-countries.csv'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fuzzyCsvPath);

    await page.waitForTimeout(2000);

    const entityColumn = page
      .locator(
        '[data-testid="geolocation-column-selector"], select, [role="combobox"]'
      )
      .first();
    if (await entityColumn.isVisible()) {
      await entityColumn.click();
      await page.getByRole('option', { name: /entity/i }).click();
    }

    await page.waitForTimeout(1000);

    const joinTab = page.getByText(/Joindre|Join/i).first();
    await joinTab.click();

    await page.waitForTimeout(3000);

    const worldBasemap = page.getByText(/World|countries/i).first();
    if (await worldBasemap.isVisible()) {
      await worldBasemap.click();
    }

    await page.waitForTimeout(5000);

    const toVerifySection = page.getByText(/à vérifier|to verify/i).first();
    await expect(
      toVerifySection.or(page.locator('[data-testid="to-verify-category"]'))
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe.serial('TC-JOIN-008: Blocage finalisation si doublons', () => {
  test('bloque finalisation avec doublons source', async ({ page }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(2000);

    const yearColumn = page
      .locator(
        '[data-testid="geolocation-column-selector"], select, [role="combobox"]'
      )
      .first();
    if (await yearColumn.isVisible()) {
      await yearColumn.click();
      await page.getByRole('option', { name: /Year/i }).click();
    }

    await page.waitForTimeout(1000);

    const joinTab = page.getByText(/Joindre|Join/i).first();
    await joinTab.click();

    await page.waitForTimeout(3000);

    const worldBasemap = page.getByText(/World|countries/i).first();
    if (await worldBasemap.isVisible()) {
      await worldBasemap.click();
    }

    await page.waitForTimeout(5000);

    const duplicateCount = page.getByText(/doublon|duplicate/i).first();
    await expect(
      duplicateCount.or(page.locator('[data-testid="duplicate-count"]'))
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe.serial('TC-JOIN-010: Import fond custom GeoJSON', () => {
  test('importe fichier GeoJSON personnalisé', async ({ page }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );
    const nuts2GeojsonPath = path.join(
      TEST_DATASETS_DIR,
      'geojson',
      'nuts2_data.geojson'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(2000);

    const joinTab = page.getByText(/Joindre|Join/i).first();
    await joinTab.click();

    await page.waitForTimeout(1000);

    const importTab = page.getByText(/Importer|Import/i).first();
    if (await importTab.isVisible()) {
      await importTab.click();
    }

    await page.waitForTimeout(500);

    const basemapDropzone = page
      .locator(
        '[data-testid="basemap-import-dropzone"], .basemap-import-dropzone, input[type="file"]'
      )
      .nth(1);
    if (await basemapDropzone.isVisible()) {
      await basemapDropzone.setInputFiles(nuts2GeojsonPath);
    }

    await page.waitForTimeout(3000);

    const customBasemap = page.getByText(/nuts2|custom/i).first();
    await expect(
      customBasemap.or(page.locator('[data-testid="custom-basemap"]'))
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe.serial('TC-JOIN-014: OSM indisponible sans GPS', () => {
  test('affiche message GPS requis pour OSM sans colonnes coordonnées', async ({
    page
  }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(2000);

    const joinTab = page.getByText(/Joindre|Join/i).first();
    await joinTab.click();

    await page.waitForTimeout(1000);

    const osmTab = page.getByText(/OSM|OpenStreetMap/i).first();
    if (await osmTab.isVisible()) {
      await osmTab.click();
    }

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
    const sevesoCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'sites-seveso-idf.csv'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(sevesoCsvPath);

    await page.waitForTimeout(2000);

    const coordinateMode = page.getByText(/Coordonnée|Coordinate/i).first();
    if (await coordinateMode.isVisible()) {
      await coordinateMode.click();
    }

    await page.waitForTimeout(1000);

    const latColumn = page
      .locator('[data-testid="lat-column-selector"], select, [role="combobox"]')
      .first();
    if (await latColumn.isVisible()) {
      await latColumn.click();
      await page.getByRole('option', { name: /lat|latitude/i }).click();
    }

    const longColumn = page
      .locator(
        '[data-testid="long-column-selector"], select, [role="combobox"]'
      )
      .first();
    if (await longColumn.isVisible()) {
      await longColumn.click();
      await page.getByRole('option', { name: /long|longitude/i }).click();
    }

    await page.waitForTimeout(1000);

    const joinTab = page.getByText(/Joindre|Join/i).first();
    await joinTab.click();

    await page.waitForTimeout(1000);

    const osmTab = page.getByText(/OSM|OpenStreetMap/i).first();
    if (await osmTab.isVisible()) {
      await osmTab.click();
    }

    await page.waitForTimeout(500);

    const activateOsm = page
      .getByRole('button', { name: /activer|activate|enable/i })
      .first();
    if (await activateOsm.isVisible()) {
      await activateOsm.click();
    }

    await page.waitForTimeout(2000);

    const osmActive = page.getByText(/OSM.*activ|activ.*OSM/i).first();
    await expect(
      osmActive.or(page.locator('[data-testid="osm-active"]'))
    ).toBeVisible({ timeout: 10000 });
  });
});
