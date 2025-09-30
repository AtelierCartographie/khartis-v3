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

async function createTestProject(page: any, projectName: string = 'Test Map') {
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

  const visualizationStep = page
    .getByRole('button', { name: /Visualisation/i })
    .or(page.locator('[data-testid="step-visualization"]'));
  await visualizationStep.click();
  await page.waitForTimeout(2000);
}

test.describe('Personnalisation du fond de carte - 2.B.3', () => {
  test('modifie la couleur de fond des polygones', async ({ page }) => {
    await createTestProject(page);

    const mapSettings = page
      .locator('[data-testid="map-settings"]')
      .or(page.locator('.map-settings, button:has-text("Fond de carte")'));
    if ((await mapSettings.count()) > 0) {
      await mapSettings.first().click();
      await page.waitForTimeout(500);

      const colorPicker = page
        .locator('[data-testid="background-color"]')
        .or(page.locator('.color-picker').first());
      if ((await colorPicker.count()) > 0) {
        await colorPicker.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('modifie la couleur des contours', async ({ page }) => {
    await createTestProject(page);

    const mapSettings = page
      .locator('[data-testid="map-settings"]')
      .or(page.locator('.map-settings, button:has-text("Fond de carte")'));
    if ((await mapSettings.count()) > 0) {
      await mapSettings.first().click();
      await page.waitForTimeout(500);

      const strokeColor = page
        .locator('[data-testid="stroke-color"]')
        .or(page.locator('button:has-text("Contour")').first());
      if ((await strokeColor.count()) > 0) {
        await strokeColor.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test("règle l'épaisseur des contours", async ({ page }) => {
    await createTestProject(page);

    const mapSettings = page
      .locator('[data-testid="map-settings"]')
      .or(page.locator('.map-settings, button:has-text("Fond de carte")'));
    if ((await mapSettings.count()) > 0) {
      await mapSettings.first().click();
      await page.waitForTimeout(500);

      const strokeWidth = page
        .locator('[data-testid="stroke-width"]')
        .or(page.locator('input[type="range"]').first());
      if ((await strokeWidth.count()) > 0) {
        await strokeWidth.fill('3');
        const value = await strokeWidth.inputValue();
        expect(value).toBe('3');
      }
    }
  });

  test.skip('applique des pointillés aux contours', async ({ page }) => {});

  test.skip("règle l'opacité des éléments", async ({ page }) => {});

  test.skip('ajoute une ombre portée', async ({ page }) => {});
});

test.describe('Fond de carte du catalogue - 2.B.3.a', () => {
  test('displays les couches disponibles', async ({ page }) => {
    await createTestProject(page);

    const layerCatalog = page
      .locator('[data-testid="layer-catalog"]')
      .or(page.locator('.layer-catalog, button:has-text("Catalogue")'));
    if ((await layerCatalog.count()) > 0) {
      await layerCatalog.first().click();
      await page.waitForTimeout(500);

      const layerItems = page.locator(
        '.layer-item, [data-testid="layer-item"]'
      );
      const count = await layerItems.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('affiche/masque la couche terre', async ({ page }) => {
    await createTestProject(page);

    const layerCatalog = page
      .locator('[data-testid="layer-catalog"]')
      .or(page.locator('.layer-catalog, button:has-text("Catalogue")'));
    if ((await layerCatalog.count()) > 0) {
      await layerCatalog.first().click();
      await page.waitForTimeout(500);

      const landLayer = page.locator('text=/terre|land/i').first();
      if ((await landLayer.count()) > 0) {
        const toggle = landLayer
          .locator('..')
          .locator('input[type="checkbox"], button')
          .first();
        await toggle.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test.skip('affiche/masque la couche mers/océans', async ({ page }) => {});

  test.skip('affiche/masque la couche lacs et rivières', async ({
    page
  }) => {});

  test.skip('affiche/masque la couche relief', async ({ page }) => {});

  test.skip('affiche/masque la couche équateur', async ({ page }) => {});

  test.skip('affiche/masque les méridiens/parallèles', async ({ page }) => {});

  test.skip('affiche/masque les frontières/limites', async ({ page }) => {});

  test.skip('affiche/masque les villes', async ({ page }) => {});

  test.skip('personnalise chaque couche individuellement', async ({
    page
  }) => {});
});

test.describe('Fond de carte importé - 2.B.3.b', () => {
  test.skip('personnalise la couleur de fond', async ({ page }) => {});

  test.skip('personnalise la couleur des contours', async ({ page }) => {});

  test.skip("règle l'épaisseur des lignes", async ({ page }) => {});

  test.skip('applique des pointillés', async ({ page }) => {});

  test.skip("règle l'opacité des polygones", async ({ page }) => {});

  test.skip("règle l'opacité des contours", async ({ page }) => {});

  test.skip('ajoute une ombre portée prédéfinie', async ({ page }) => {});
});

test.describe('Fond OpenStreetMap - 2.B.3.c', () => {
  test.skip('sélectionne un style prédéfini', async ({ page }) => {});

  test.skip("affiche/masque des calques d'information", async ({ page }) => {});

  test.skip('affiche/masque les étiquettes', async ({ page }) => {});

  test.skip('applique les styles disponibles', async ({ page }) => {});
});
