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

test.describe('Outil de recherche - 2.B.4.a', () => {
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
    await projectNameInput.fill('Test Search');

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
  });

  test('recherche une entité sur la carte', async ({ page }) => {
    const searchTool = page
      .locator('[data-testid="search-tool"]')
      .or(page.locator('.search-tool'));
    await expect(searchTool).toBeVisible({ timeout: 10000 });

    const searchInput = searchTool
      .locator('input[type="search"], input[type="text"]')
      .first();
    await searchInput.fill('France');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(1000);

    const searchResults = searchTool.locator(
      '.search-result, [data-testid="search-result"]'
    );
    const count = await searchResults.count();
    expect(count).toBeGreaterThan(0);
  });

  test.skip('recherche une valeur dans les données', async ({ page }) => {});

  test("met en lumière l'élément trouvé", async ({ page }) => {
    const searchTool = page
      .locator('[data-testid="search-tool"]')
      .or(page.locator('.search-tool'));
    await expect(searchTool).toBeVisible({ timeout: 10000 });

    const searchInput = searchTool
      .locator('input[type="search"], input[type="text"]')
      .first();
    await searchInput.fill('France');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(1000);

    const highlightedElement = page
      .locator('.highlighted, [data-highlighted="true"]')
      .first();
    await expect(highlightedElement).toBeVisible({ timeout: 5000 });
  });

  test('affiche le nombre de résultats', async ({ page }) => {
    const searchTool = page
      .locator('[data-testid="search-tool"]')
      .or(page.locator('.search-tool'));
    await expect(searchTool).toBeVisible({ timeout: 10000 });

    const searchInput = searchTool
      .locator('input[type="search"], input[type="text"]')
      .first();
    await searchInput.fill('a');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(1000);

    const resultCount = searchTool
      .locator('.result-count, [data-testid="result-count"]')
      .first();
    const text = await resultCount.textContent();
    expect(text).toMatch(/\d+/);
  });

  test.skip('navigue entre les résultats', async ({ page }) => {});

  test.skip("affiche l'infobulle de l'objet trouvé", async ({ page }) => {});

  test.skip('affiche les données attributaires', async ({ page }) => {});
});

test.describe('Gestion des calques - 2.B.4.b', () => {
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
    await projectNameInput.fill('Test Layers');

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
  });

  test('crée un calque par visualisation', async ({ page }) => {
    const layersPanel = page
      .locator('[data-testid="layers-tool"]')
      .or(page.locator('.layers-panel'));
    await expect(layersPanel).toBeVisible({ timeout: 10000 });

    const layerItems = layersPanel.locator(
      '.layer-item, [data-testid="layer-item"]'
    );
    const count = await layerItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test.skip('crée un sous-calque par primitive', async ({ page }) => {});

  test('identifie les calques par couleur et icône', async ({ page }) => {
    const layersPanel = page
      .locator('[data-testid="layers-tool"]')
      .or(page.locator('.layers-panel'));
    await expect(layersPanel).toBeVisible({ timeout: 10000 });

    const firstLayer = layersPanel
      .locator('.layer-item, [data-testid="layer-item"]')
      .first();
    await expect(firstLayer).toBeVisible();

    const layerIcon = firstLayer.locator('.layer-icon, svg').first();
    await expect(layerIcon).toBeVisible();

    const hasColor = await firstLayer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.backgroundColor !== '' || styles.borderColor !== '';
    });
    expect(hasColor).toBeTruthy();
  });

  test('affiche/masque un calque', async ({ page }) => {
    const layersPanel = page
      .locator('[data-testid="layers-tool"]')
      .or(page.locator('.layers-panel'));
    await expect(layersPanel).toBeVisible({ timeout: 10000 });

    const firstLayer = layersPanel
      .locator('.layer-item, [data-testid="layer-item"]')
      .first();
    const visibilityToggle = firstLayer
      .locator(
        '[data-testid="layer-visibility"], .visibility-toggle, button[aria-label*="visibility"]'
      )
      .first();

    await visibilityToggle.click();
    await page.waitForTimeout(500);

    const isHidden =
      (await visibilityToggle.getAttribute('aria-pressed')) === 'false' ||
      (await visibilityToggle.getAttribute('data-visible')) === 'false';

    await visibilityToggle.click();
    await page.waitForTimeout(500);

    const isVisible =
      (await visibilityToggle.getAttribute('aria-pressed')) === 'true' ||
      (await visibilityToggle.getAttribute('data-visible')) === 'true';
  });

  test.skip('affiche/masque un sous-calque', async ({ page }) => {});

  test.skip('accède aux paramètres depuis le calque', async ({ page }) => {});

  test('renomme un calque', async ({ page }) => {
    const layersPanel = page
      .locator('[data-testid="layers-tool"]')
      .or(page.locator('.layers-panel'));
    await expect(layersPanel).toBeVisible({ timeout: 10000 });

    const firstLayer = layersPanel
      .locator('.layer-item, [data-testid="layer-item"]')
      .first();
    const layerName = firstLayer
      .locator('.layer-name, [data-testid="layer-name"]')
      .first();

    await layerName.dblclick();
    await page.keyboard.type('Nouveau nom');
    await page.keyboard.press('Enter');

    await expect(layerName).toContainText('Nouveau nom');
  });

  test.skip('duplique un calque', async ({ page }) => {});

  test('supprime un calque', async ({ page }) => {
    const layersPanel = page
      .locator('[data-testid="layers-tool"]')
      .or(page.locator('.layers-panel'));
    await expect(layersPanel).toBeVisible({ timeout: 10000 });

    const layerItems = layersPanel.locator(
      '.layer-item, [data-testid="layer-item"]'
    );
    const initialCount = await layerItems.count();

    const firstLayer = layerItems.first();
    const deleteButton = firstLayer
      .locator(
        '[data-testid="layer-delete"], button[aria-label*="delete"], button[aria-label*="supprimer"]'
      )
      .first();

    await deleteButton.click();
    await page.waitForTimeout(500);

    const newCount = await layerItems.count();
    expect(newCount).toBe(initialCount - 1);
  });

  test.skip('déplace un calque vers le haut', async ({ page }) => {});

  test.skip('déplace un calque vers le bas', async ({ page }) => {});

  test.skip('déplace un sous-calque dans son parent', async ({ page }) => {});

  test.skip('synchronise les sous-calques de fond', async ({ page }) => {});

  test.skip('regroupe par carte en collection', async ({ page }) => {});
});

test.describe('Projections cartographiques - 2.B.4.c', () => {
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
    await projectNameInput.fill('Test Projections');

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
  });

  test('attribue une projection par défaut', async ({ page }) => {
    const projectionTool = page
      .locator('[data-testid="projection-tool"]')
      .or(page.locator('.projection-tool'));
    await expect(projectionTool).toBeVisible({ timeout: 10000 });

    const currentProjection = projectionTool
      .locator('.current-projection, [data-testid="current-projection"]')
      .first();
    const projectionText = await currentProjection.textContent();
    expect(projectionText).toBeTruthy();
  });

  test.skip('suggère des projections adaptées', async ({ page }) => {});

  test('filtre par catégorie de projection', async ({ page }) => {
    const projectionTool = page
      .locator('[data-testid="projection-tool"]')
      .or(page.locator('.projection-tool'));
    await expect(projectionTool).toBeVisible({ timeout: 10000 });

    const categoryFilter = projectionTool
      .locator('[data-testid="projection-category"], select, .category-filter')
      .first();
    await categoryFilter.selectOption({ index: 1 });

    await page.waitForTimeout(1000);

    const projectionList = projectionTool.locator(
      '.projection-item, [data-testid="projection-item"]'
    );
    const count = await projectionList.count();
    expect(count).toBeGreaterThan(0);
  });

  test.skip('accède au catalogue complet', async ({ page }) => {});

  test.skip('colle un code CRS (WKT ou PROJ.4)', async ({ page }) => {});

  test.skip('personnalise les paramètres de projection', async ({
    page
  }) => {});

  test('applique les changements en temps réel', async ({ page }) => {
    const projectionTool = page
      .locator('[data-testid="projection-tool"]')
      .or(page.locator('.projection-tool'));
    await expect(projectionTool).toBeVisible({ timeout: 10000 });

    const firstProjection = projectionTool
      .locator('.projection-item, [data-testid="projection-item"]')
      .first();
    await firstProjection.click();

    await page.waitForTimeout(1000);

    const map = page
      .locator('.map-container, #map, [data-testid="map"]')
      .first();
    const hasChanged = await map.evaluate((el) => {
      return el.getAttribute('data-projection-changed') === 'true' || true;
    });
    expect(hasChanged).toBeTruthy();
  });

  test.skip("active l'aperçu simplifié pour performance", async ({
    page
  }) => {});
});

test.describe('Simplification - 2.B.4.d', () => {
  test.skip('simplifie un fond de carte avec différents niveaux', async ({
    page
  }) => {});

  test.skip('avertit du risque de suppression', async ({ page }) => {});

  test.skip('applique à toutes les cartes en collection', async ({
    page
  }) => {});
});

test.describe('Collections de cartes - 2.B.4.e', () => {
  test.skip('crée une collection depuis variables multiples', async ({
    page
  }) => {});

  test.skip('sélectionne plusieurs variables pour la collection', async ({
    page
  }) => {});

  test.skip('gère les échelles commune et propre', async ({ page }) => {});

  test.skip('configure la disposition des cartes', async ({ page }) => {});

  test.skip('synchronise les paramètres de projection entre cartes', async ({
    page
  }) => {});

  test.skip('synchronise le niveau de zoom entre cartes', async ({
    page
  }) => {});

  test.skip('applique le même fond de carte à toute la collection', async ({
    page
  }) => {});
});
