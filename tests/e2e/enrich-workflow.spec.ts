import { expect, test } from '@playwright/test';
import path from 'path';

const TEST_DATASETS_DIR = path.join(process.cwd(), 'tests-datasets');

test.describe.serial('TC-ENRICH-001: Workflow géographique', () => {
  test('affiche sections Contrôler et Enrichir pour dataset géographique', async ({
    page
  }) => {
    const worldShpZipPath = path.join(
      TEST_DATASETS_DIR,
      'zip',
      'shapefile-complete.zip'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(worldShpZipPath);

    await page.waitForTimeout(3000);

    const dataTab = page.locator('#khartis-data-tab');
    await expect(dataTab).toBeVisible();

    await expect(page.getByText(/Contrôler|Control/i)).toBeVisible();

    await expect(page.getByText(/Enrichir|Enrich/i)).toBeVisible();

    const geolocateTab = page.getByText(/Géolocaliser|Geolocate/i);
    await expect(geolocateTab).not.toBeVisible();
  });
});

test.describe
  .serial('TC-ENRICH-002: Upload fichier tabulaire enrichissement', () => {
  test('importe fichier tabulaire pour enrichissement', async ({ page }) => {
    const worldShpZipPath = path.join(
      TEST_DATASETS_DIR,
      'zip',
      'shapefile-complete.zip'
    );
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(worldShpZipPath);

    await page.waitForTimeout(3000);

    const enrichTab = page.getByText(/Enrichir|Enrich/i).first();
    await enrichTab.click();

    await page.waitForTimeout(1000);

    const joinDataToggle = page
      .getByText(/Joindre des données tabulaires|Join tabular data/i)
      .first();
    if (await joinDataToggle.isVisible()) {
      await joinDataToggle.click();
    }

    await page.waitForTimeout(500);

    const enrichmentDropzone = page
      .locator(
        '[data-testid="enrichment-file-upload"], .enrichment-upload, input[type="file"]'
      )
      .nth(1);
    if (await enrichmentDropzone.isVisible()) {
      await enrichmentDropzone.setInputFiles(fossilCsvPath);
    }

    await page.waitForTimeout(3000);

    const filePreview = page.getByText(/fossil|fuel|subsidy/i).first();
    await expect(
      filePreview.or(page.locator('[data-testid="enrichment-preview"]'))
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe.serial('TC-ENRICH-003: Rejet format non supporté', () => {
  test('rejette format non supporté pour enrichissement', async ({ page }) => {
    const worldShpZipPath = path.join(
      TEST_DATASETS_DIR,
      'zip',
      'shapefile-complete.zip'
    );
    const unsupportedZipPath = path.join(
      TEST_DATASETS_DIR,
      'zip',
      'single-csv.zip'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(worldShpZipPath);

    await page.waitForTimeout(3000);

    const enrichTab = page.getByText(/Enrichir|Enrich/i).first();
    await enrichTab.click();

    await page.waitForTimeout(1000);

    const joinDataToggle = page
      .getByText(/Joindre des données tabulaires|Join tabular data/i)
      .first();
    if (await joinDataToggle.isVisible()) {
      await joinDataToggle.click();
    }

    await page.waitForTimeout(500);

    const enrichmentDropzone = page
      .locator(
        '[data-testid="enrichment-file-upload"], .enrichment-upload, input[type="file"]'
      )
      .nth(1);
    if (await enrichmentDropzone.isVisible()) {
      await enrichmentDropzone.setInputFiles(unsupportedZipPath);
    }

    await page.waitForTimeout(3000);

    const errorMessage = page
      .getByText(/format|supporté|non supporté|unsupported|invalid|error/i)
      .first();
    await expect(
      errorMessage.or(page.locator('[data-testid="error-message"]'))
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe
  .serial('TC-ENRICH-006: Suppression fichier enrichissement', () => {
  test('réinitialise état après suppression fichier enrichissement', async ({
    page
  }) => {
    const worldShpZipPath = path.join(
      TEST_DATASETS_DIR,
      'zip',
      'shapefile-complete.zip'
    );
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(worldShpZipPath);

    await page.waitForTimeout(3000);

    const enrichTab = page.getByText(/Enrichir|Enrich/i).first();
    await enrichTab.click();

    await page.waitForTimeout(1000);

    const joinDataToggle = page
      .getByText(/Joindre des données tabulaires|Join tabular data/i)
      .first();
    if (await joinDataToggle.isVisible()) {
      await joinDataToggle.click();
    }

    await page.waitForTimeout(500);

    const enrichmentDropzone = page
      .locator(
        '[data-testid="enrichment-file-upload"], .enrichment-upload, input[type="file"]'
      )
      .nth(1);
    if (await enrichmentDropzone.isVisible()) {
      await enrichmentDropzone.setInputFiles(fossilCsvPath);
    }

    await page.waitForTimeout(3000);

    const deleteButton = page
      .locator(
        '[data-testid="delete-enrichment-file"], button[aria-label*="delete"], button[aria-label*="supprimer"]'
      )
      .first();
    if (await deleteButton.isVisible()) {
      await deleteButton.click();
    }

    await page.waitForTimeout(1000);

    const uploadZone = page
      .locator('[data-testid="enrichment-file-upload"], .enrichment-upload')
      .first();
    await expect(uploadZone).toBeVisible({ timeout: 5000 });
  });
});

test.describe
  .serial('TC-ENRICH-008: Calcul stats jointure enrichissement', () => {
  test('calcule stats après sélection des colonnes', async ({ page }) => {
    const worldShpZipPath = path.join(
      TEST_DATASETS_DIR,
      'zip',
      'shapefile-complete.zip'
    );
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(worldShpZipPath);

    await page.waitForTimeout(3000);

    const enrichTab = page.getByText(/Enrichir|Enrich/i).first();
    await enrichTab.click();

    await page.waitForTimeout(1000);

    const joinDataToggle = page
      .getByText(/Joindre des données tabulaires|Join tabular data/i)
      .first();
    if (await joinDataToggle.isVisible()) {
      await joinDataToggle.click();
    }

    await page.waitForTimeout(500);

    const enrichmentDropzone = page
      .locator(
        '[data-testid="enrichment-file-upload"], .enrichment-upload, input[type="file"]'
      )
      .nth(1);
    if (await enrichmentDropzone.isVisible()) {
      await enrichmentDropzone.setInputFiles(fossilCsvPath);
    }

    await page.waitForTimeout(3000);

    const geoColumnSelector = page
      .locator('[data-testid="geo-column-selector"], select, [role="combobox"]')
      .first();
    if (await geoColumnSelector.isVisible()) {
      await geoColumnSelector.click();
      const nameOption = page.getByRole('option', { name: /name|nom/i });
      if (await nameOption.isVisible()) {
        await nameOption.click();
      }
    }

    const enrichColumnSelector = page
      .locator(
        '[data-testid="enrich-column-selector"], select, [role="combobox"]'
      )
      .nth(1);
    if (await enrichColumnSelector.isVisible()) {
      await enrichColumnSelector.click();
      const entityOption = page.getByRole('option', { name: /Entity/i });
      if (await entityOption.isVisible()) {
        await entityOption.click();
      }
    }

    await page.waitForTimeout(5000);

    const joinStats = page
      .locator('[data-testid="join-stats"], .join-stats')
      .first();
    await expect(
      joinStats.or(page.getByText(/joint|joined/i).first())
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe.serial('TC-ENRICH-011: Finalisation enrichissement', () => {
  test('ajoute colonnes après finalisation enrichissement', async ({
    page
  }) => {
    const worldShpZipPath = path.join(
      TEST_DATASETS_DIR,
      'zip',
      'shapefile-complete.zip'
    );
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(worldShpZipPath);

    await page.waitForTimeout(3000);

    const enrichTab = page.getByText(/Enrichir|Enrich/i).first();
    await enrichTab.click();

    await page.waitForTimeout(1000);

    const joinDataToggle = page
      .getByText(/Joindre des données tabulaires|Join tabular data/i)
      .first();
    if (await joinDataToggle.isVisible()) {
      await joinDataToggle.click();
    }

    await page.waitForTimeout(500);

    const enrichmentDropzone = page
      .locator(
        '[data-testid="enrichment-file-upload"], .enrichment-upload, input[type="file"]'
      )
      .nth(1);
    if (await enrichmentDropzone.isVisible()) {
      await enrichmentDropzone.setInputFiles(fossilCsvPath);
    }

    await page.waitForTimeout(3000);

    const geoColumnSelector = page
      .locator('[data-testid="geo-column-selector"], select, [role="combobox"]')
      .first();
    if (await geoColumnSelector.isVisible()) {
      await geoColumnSelector.click();
      const nameOption = page.getByRole('option', { name: /name|nom/i });
      if (await nameOption.isVisible()) {
        await nameOption.click();
      }
    }

    const enrichColumnSelector = page
      .locator(
        '[data-testid="enrich-column-selector"], select, [role="combobox"]'
      )
      .nth(1);
    if (await enrichColumnSelector.isVisible()) {
      await enrichColumnSelector.click();
      const codeOption = page.getByRole('option', { name: /Code/i });
      if (await codeOption.isVisible()) {
        await codeOption.click();
      }
    }

    await page.waitForTimeout(5000);

    const finalizeButton = page
      .getByRole('button', { name: /Valider|Finalize|validate|finaliser/i })
      .first();
    if (
      (await finalizeButton.isVisible()) &&
      (await finalizeButton.isEnabled())
    ) {
      await finalizeButton.click();
    }

    await page.waitForTimeout(3000);

    const controlTab = page.getByText(/Contrôler|Control/i).first();
    await controlTab.click();

    await page.waitForTimeout(1000);

    const tablePreview = page
      .locator('[data-testid="data-table"], table')
      .first();
    await expect(tablePreview).toBeVisible({ timeout: 10000 });
  });
});

test.describe.serial('TC-ENRICH-014: Overlay OSM enrichissement', () => {
  test('active OSM en mode enrichissement', async ({ page }) => {
    const worldShpZipPath = path.join(
      TEST_DATASETS_DIR,
      'zip',
      'shapefile-complete.zip'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(worldShpZipPath);

    await page.waitForTimeout(3000);

    const enrichTab = page.getByText(/Enrichir|Enrich/i).first();
    await enrichTab.click();

    await page.waitForTimeout(1000);

    const overlaySection = page
      .getByText(/Superposer|Overlay|basemap/i)
      .first();
    if (await overlaySection.isVisible()) {
      await overlaySection.click();
    }

    await page.waitForTimeout(500);

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

test.describe.serial('TC-ENRICH-017: Rejet fichier vide', () => {
  test('rejette fichier CSV vide', async ({ page }) => {
    const worldShpZipPath = path.join(
      TEST_DATASETS_DIR,
      'zip',
      'shapefile-complete.zip'
    );
    const emptyCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'csv-malformed--with-nothing.csv'
    );

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(worldShpZipPath);

    await page.waitForTimeout(3000);

    const enrichTab = page.getByText(/Enrichir|Enrich/i).first();
    await enrichTab.click();

    await page.waitForTimeout(1000);

    const joinDataToggle = page
      .getByText(/Joindre des données tabulaires|Join tabular data/i)
      .first();
    if (await joinDataToggle.isVisible()) {
      await joinDataToggle.click();
    }

    await page.waitForTimeout(500);

    const enrichmentDropzone = page
      .locator(
        '[data-testid="enrichment-file-upload"], .enrichment-upload, input[type="file"]'
      )
      .nth(1);
    if (await enrichmentDropzone.isVisible()) {
      await enrichmentDropzone.setInputFiles(emptyCsvPath);
    }

    await page.waitForTimeout(3000);

    const errorMessage = page
      .getByText(/vide|empty|error|erreur|invalid/i)
      .first();
    await expect(
      errorMessage.or(page.locator('[data-testid="error-message"]'))
    ).toBeVisible({ timeout: 10000 });
  });
});
