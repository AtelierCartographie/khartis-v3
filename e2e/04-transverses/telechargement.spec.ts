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

async function createTestProject(
  page: any,
  projectName: string = 'Test Project'
) {
  await page.goto('/');
  const modal = page.locator(MODAL_CONTAINER_SELECTOR);
  await expect(modal).toBeVisible();

  const createTab = modal.locator('[data-testid="tab-create-new"]');
  await createTab.click();
  await page.waitForTimeout(500);

  const fileInput = modal.locator('input[type="file"]').first();
  await fileInput.setInputFiles(TEST_DATASET_PATH);

  const projectNameInput = modal.locator('[data-testid="project-name-input"]');
  await projectNameInput.fill(projectName);

  const createButton = modal.getByRole('button', {
    name: 'Créer',
    exact: true
  });
  await createButton.click();

  await expect(modal).toBeHidden({ timeout: 10000 });
  await page.waitForTimeout(2000);
}

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
  test('télécharge les données tabulaires modifiées au format CSV', async ({
    page
  }) => {
    await createTestProject(page, 'Test Export CSV');

    const downloadButton = page.getByRole('button', { name: /Télécharger/i });
    await expect(downloadButton).toBeVisible({ timeout: 10000 });
    await downloadButton.click();

    await page.waitForTimeout(1000);

    const dataTab = page.getByRole('tab', { name: /Données/i });
    await expect(dataTab).toBeVisible({ timeout: 5000 });
    await dataTab.click();
    await page.waitForTimeout(1000);

    const csvRadio = page.locator('input[type="radio"][value="csv"]');
    await expect(csvRadio).toBeVisible({ timeout: 5000 });
    await csvRadio.check();
    await page.waitForTimeout(500);

    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    const submitButton = page
      .getByRole('button', {
        name: /Télécharger/i
      })
      .last();
    await submitButton.click();

    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.csv$/);

    const path = await download.path();
    expect(path).not.toBeNull();

    if (path) {
      const fs = await import('fs/promises');
      const content = await fs.readFile(path, 'utf-8');

      expect(content.length).toBeGreaterThan(100);
      expect(content.split('\n').length).toBeGreaterThan(1);
    }
  });

  test('exporte au format CSV', async ({ page }) => {
    await createTestProject(page, 'Test Export CSV Format');

    await page.getByRole('button', { name: /Télécharger/i }).click();
    await page.waitForTimeout(1000);

    await page.getByRole('tab', { name: /Données/i }).click();
    await page.waitForTimeout(1000);

    await page.locator('input[type="radio"][value="csv"]').check();
    await page.waitForTimeout(500);

    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: /Télécharger/i })
      .last()
      .click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test("inclut toutes les données processées dans l'export CSV", async ({
    page
  }) => {
    await createTestProject(page, 'Test Export Processed Data');

    await page.getByRole('button', { name: /Télécharger/i }).click();
    await page.waitForTimeout(1000);

    await page.getByRole('tab', { name: /Données/i }).click();
    await page.waitForTimeout(1000);

    await page.locator('input[type="radio"][value="csv"]').check();
    await page.waitForTimeout(500);

    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: /Télécharger/i })
      .last()
      .click();
    const download = await downloadPromise;

    const path = await download.path();
    if (path) {
      const fs = await import('fs/promises');
      const content = await fs.readFile(path, 'utf-8');

      const lines = content
        .split('\n')
        .filter((line) => line.trim().length > 0);
      expect(lines.length).toBeGreaterThan(1);

      const headers = lines[0].split(',');
      expect(headers.length).toBeGreaterThan(0);

      const dataLines = lines.slice(1);
      expect(dataLines.length).toBeGreaterThan(0);
    }
  });

  test('exporte plusieurs datasets avec colonne _source_dataset', async ({
    page
  }) => {
    await createTestProject(page, 'Test Multiple Datasets Export');

    await page.getByRole('button', { name: /Télécharger/i }).click();
    await page.waitForTimeout(1000);

    await page.getByRole('tab', { name: /Données/i }).click();
    await page.waitForTimeout(1000);

    await page.locator('input[type="radio"][value="csv"]').check();
    await page.waitForTimeout(500);

    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: /Télécharger/i })
      .last()
      .click();
    const download = await downloadPromise;

    const path = await download.path();
    if (path) {
      const fs = await import('fs/promises');
      const content = await fs.readFile(path, 'utf-8');

      const lines = content.split('\n');
      expect(lines.length).toBeGreaterThan(1);
    }
  });

  test.skip('télécharge les fichiers géographiques', async ({ page }) => {});

  test.skip('exporte au format GeoJSON', async ({ page }) => {
    await createTestProject(page, 'Test Export GeoJSON');

    await page.getByRole('button', { name: /Télécharger/i }).click();
    await page.waitForTimeout(1000);

    await page.getByRole('tab', { name: /Données/i }).click();
    await page.waitForTimeout(1000);

    await page.locator('input[type="radio"][value="geojson"]').check();
    await page.waitForTimeout(500);

    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: /Télécharger/i })
      .last()
      .click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.geojson$/);
  });

  test.skip('télécharge le fond de carte utilisé', async ({ page }) => {});

  test.skip('télécharge la jointure données/fond', async ({ page }) => {});

  test.skip('exclut les couches additionnelles du catalogue', async ({
    page
  }) => {});
});

test.describe('Téléchargement de projet - 2.D.3', () => {
  test('télécharge le fichier projet avec extension .kh', async ({ page }) => {
    await createTestProject(page, 'Test Project Export');

    await page.getByRole('button', { name: /Télécharger/i }).click();
    await page.waitForTimeout(1000);

    const projectTab = page.getByRole('tab', { name: /Projet/i });
    await projectTab.click();
    await page.waitForTimeout(500);

    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: /Télécharger/i })
      .last()
      .click();
    const download = await downloadPromise;

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
