import { expect, test } from '@playwright/test';
import { join } from 'node:path';

const MODAL_CONTAINER_SELECTOR = '#khartis-create-project .bx--modal-container';
const TEST_DATASET_PATH = join(
  process.cwd(),
  'e2e',
  'mocks',
  'csv',
  'nuts2_data.csv'
);

test.describe('Téléchargement de carte - 2.D.1', () => {
  test.skip('télécharge la carte en JPG haute résolution', async ({
    page
  }) => {});

  test.skip('vérifie la qualité haute résolution du JPG', async ({
    page
  }) => {});

  test.skip('télécharge la carte en SVG vectoriel', async ({ page }) => {});

  test.skip("organise les calques dans le SVG par type d'élément", async ({
    page
  }) => {});

  test.skip('nomme les calques SVG de manière descriptive', async ({
    page
  }) => {});

  test.skip('préserve les éléments de visualisation dans le SVG', async ({
    page
  }) => {});

  test.skip('préserve la mise en page complète', async ({ page }) => {});

  test.skip('conserve les polices et styles dans le SVG', async ({
    page
  }) => {});

  test.skip('exporte les légendes dans le bon calque', async ({ page }) => {});

  test.skip('exporte les annotations dans un calque séparé', async ({
    page
  }) => {});

  test.skip("respecte l'ordre des calques de visualisation", async ({
    page
  }) => {});
});

test.describe('Téléchargement de données - 2.D.2', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();
    await page.waitForTimeout(500);

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TEST_DATASET_PATH);

    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.fill('Test Export');

    const createButton = modal.getByRole('button', {
      name: 'Créer',
      exact: true
    });
    await createButton.click();
    await expect(modal).toBeHidden({ timeout: 10000 });

    await page.waitForTimeout(2000);
  });

  test.skip('télécharge les données tabulaires modifiées', async ({
    page
  }) => {});

  test('exporte au format CSV', async ({ page }) => {
    const downloadButton = page
      .locator('[data-testid="download-button"]')
      .or(page.getByRole('button', { name: /Télécharger/i }));
    await downloadButton.click();

    const downloadModal = page
      .locator('.download-modal, [data-testid="download-modal"]')
      .first();
    await expect(downloadModal).toBeVisible({ timeout: 5000 });

    const dataTab = downloadModal
      .locator('[data-testid="tab-data"]')
      .or(downloadModal.getByRole('tab', { name: /Données/i }));
    await dataTab.click();

    const csvOption = downloadModal
      .locator('[data-testid="format-csv"]')
      .or(downloadModal.getByLabel('CSV'));
    await csvOption.click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadModal.getByRole('button', { name: /Télécharger/i }).click()
    ]);

    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test.skip('inclut toutes les modifications', async ({ page }) => {});

  test.skip('télécharge les fichiers géographiques', async ({ page }) => {});

  test('exporte au format GeoJSON', async ({ page }) => {
    const downloadButton = page
      .locator('[data-testid="download-button"]')
      .or(page.getByRole('button', { name: /Télécharger/i }));
    await downloadButton.click();

    const downloadModal = page
      .locator('.download-modal, [data-testid="download-modal"]')
      .first();
    await expect(downloadModal).toBeVisible({ timeout: 5000 });

    const dataTab = downloadModal
      .locator('[data-testid="tab-data"]')
      .or(downloadModal.getByRole('tab', { name: /Données/i }));
    await dataTab.click();

    const geojsonOption = downloadModal
      .locator('[data-testid="format-geojson"]')
      .or(downloadModal.getByLabel('GeoJSON'));
    await geojsonOption.click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadModal.getByRole('button', { name: /Télécharger/i }).click()
    ]);

    expect(download.suggestedFilename()).toMatch(/\.geojson$/);
  });

  test.skip('télécharge le fond de carte utilisé', async ({ page }) => {});

  test.skip('télécharge la jointure données/fond', async ({ page }) => {});

  test.skip('exclut les couches additionnelles du catalogue', async ({
    page
  }) => {});
});

test.describe('Téléchargement de projet - 2.D.3', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();
    await page.waitForTimeout(500);

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TEST_DATASET_PATH);

    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.fill('Test Project Export');

    const createButton = modal.getByRole('button', {
      name: 'Créer',
      exact: true
    });
    await createButton.click();
    await expect(modal).toBeHidden({ timeout: 10000 });

    await page.waitForTimeout(2000);
  });

  test('télécharge le fichier projet avec extension .kh', async ({ page }) => {
    const downloadButton = page
      .locator('[data-testid="download-button"]')
      .or(page.getByRole('button', { name: /Télécharger/i }));
    await downloadButton.click();

    const downloadModal = page
      .locator('.download-modal, [data-testid="download-modal"]')
      .first();
    await expect(downloadModal).toBeVisible({ timeout: 5000 });

    const projectTab = downloadModal
      .locator('[data-testid="tab-project"]')
      .or(downloadModal.getByRole('tab', { name: /Projet/i }));
    await projectTab.click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadModal.getByRole('button', { name: /Télécharger/i }).click()
    ]);

    expect(download.suggestedFilename()).toMatch(/\.kh$/);
  });

  test.skip('sauvegarde toutes les opérations effectuées', async ({
    page
  }) => {});

  test.skip('inclut tous les jeux de données importés', async ({ page }) => {});

  test.skip('sauvegarde toutes les visualisations créées', async ({
    page
  }) => {});

  test.skip('conserve tous les paramètres de personnalisation', async ({
    page
  }) => {});

  test.skip('permet de reprendre le projet ultérieurement', async ({
    page
  }) => {});

  test.skip("restaure l'état complet du projet après import", async ({
    page
  }) => {});

  test.skip('restaure les données modifiées (filtres, calculs)', async ({
    page
  }) => {});

  test.skip('restaure les jointures effectuées', async ({ page }) => {});

  test.skip('restaure la mise en page et habillage', async ({ page }) => {});

  test.skip("valide l'intégrité du fichier .kh", async ({ page }) => {});

  test.skip("gère l'import de fichiers .kh corrompus avec message d'erreur", async ({
    page
  }) => {});
});
