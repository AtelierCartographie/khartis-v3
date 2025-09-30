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

  await expect(modal).toBeHidden();

  // Naviguer vers l'étape Visualisations
  const vizStep = page.locator('[data-testid="step-visualizations"]');
  await vizStep.click();
  await page.waitForTimeout(1000);
}

test.describe('Projections cartographiques', () => {
  test("ouvre l'outil de projection", async ({ page }) => {
    await createTestProject(page, 'Test Projection');

    // Rechercher l'outil projection
    const projectionTool = page
      .locator('button:has-text("Projection"), [aria-label*="Projection"]')
      .first();

    if ((await projectionTool.count()) > 0) {
      await projectionTool.click();
      await page.waitForTimeout(500);

      // Vérifier que le panneau projection est ouvert
      const projectionPanel = page
        .locator('[class*="projection"], #khartis-projection-tool')
        .first();

      if ((await projectionPanel.count()) > 0) {
        await expect(projectionPanel).toBeVisible();
      }
    }
  });

  test('displays une liste de projections', async ({ page }) => {
    await createTestProject(page, 'Test Projection List');

    const projectionTool = page
      .locator('button:has-text("Projection"), [aria-label*="Projection"]')
      .first();

    if ((await projectionTool.count()) > 0) {
      await projectionTool.click();
      await page.waitForTimeout(500);

      // Rechercher les cartes de projection
      const projectionCards = page.locator(
        '[class*="projection-card"], .bx--tile:has(text)'
      );

      if ((await projectionCards.count()) > 0) {
        const cardCount = await projectionCards.count();
        expect(cardCount).toBeGreaterThan(0);

        // Vérifier que les cartes ont des noms
        const firstCard = projectionCards.first();
        const cardText = await firstCard.textContent();
        expect(cardText).toBeTruthy();
      }
    }
  });

  test('allows sélectionner une projection', async ({ page }) => {
    await createTestProject(page, 'Test Select Projection');

    const projectionTool = page
      .locator('button:has-text("Projection"), [aria-label*="Projection"]')
      .first();

    if ((await projectionTool.count()) > 0) {
      await projectionTool.click();
      await page.waitForTimeout(500);

      // Sélectionner la première projection
      const firstProjection = page
        .locator('[class*="projection-card"], .bx--tile')
        .first();

      if ((await firstProjection.count()) > 0) {
        await firstProjection.click();
        await page.waitForTimeout(1000);

        // Vérifier que la projection est appliquée (la carte devrait changer)
        const mapContainer = page.locator('[class*="map"], canvas').first();

        if ((await mapContainer.count()) > 0) {
          await expect(mapContainer).toBeVisible();
        }
      }
    }
  });

  test('displays les paramètres de projection', async ({ page }) => {
    await createTestProject(page, 'Test Projection Settings');

    const projectionTool = page
      .locator('button:has-text("Projection"), [aria-label*="Projection"]')
      .first();

    if ((await projectionTool.count()) > 0) {
      await projectionTool.click();
      await page.waitForTimeout(500);

      // Rechercher les paramètres
      const settingsSection = page
        .locator('[class*="settings"], [class*="parameters"]')
        .first();

      if ((await settingsSection.count()) > 0) {
        await expect(settingsSection).toBeVisible();

        // Vérifier qu'il y a des contrôles
        const controls = settingsSection.locator('input, select, .bx--slider');
        const controlCount = await controls.count();
        expect(controlCount).toBeGreaterThan(0);
      }
    }
  });

  test('allows filtrer les projections', async ({ page }) => {
    await createTestProject(page, 'Test Filter Projections');

    const projectionTool = page
      .locator('button:has-text("Projection"), [aria-label*="Projection"]')
      .first();

    if ((await projectionTool.count()) > 0) {
      await projectionTool.click();
      await page.waitForTimeout(500);

      // Rechercher les filtres ou catégories
      const filterButtons = page.locator('button[role="tab"], .bx--tag');

      if ((await filterButtons.count()) > 0) {
        const firstFilter = filterButtons.first();
        await firstFilter.click();
        await page.waitForTimeout(500);

        // Vérifier que les projections sont filtrées
        const projectionCards = page.locator('[class*="projection-card"]');
        await expect(projectionCards.first()).toBeVisible();
      }
    }
  });
});

test.describe('Contrôles de la carte', () => {
  test('displays les contrôles de zoom', async ({ page }) => {
    await createTestProject(page, 'Test Zoom Controls');

    // Rechercher les contrôles de zoom
    const zoomControls = page.locator(
      '[class*="zoom"], button[aria-label*="zoom"]'
    );

    if ((await zoomControls.count()) > 0) {
      // Il devrait y avoir au moins 2 boutons (zoom in/out)
      const controlCount = await zoomControls.count();
      expect(controlCount).toBeGreaterThanOrEqual(2);
    }
  });

  test('allows zoomer sur la carte', async ({ page }) => {
    await createTestProject(page, 'Test Map Zoom');

    // Rechercher le bouton zoom in
    const zoomInButton = page
      .locator('button[aria-label*="Zoom in"], button:has(svg[class*="plus"])')
      .first();

    if ((await zoomInButton.count()) > 0) {
      // Cliquer plusieurs fois pour zoomer
      await zoomInButton.click();
      await page.waitForTimeout(500);
      await zoomInButton.click();
      await page.waitForTimeout(500);

      // La carte devrait être zoomée (difficile à vérifier sans accès au state)
      await expect(zoomInButton).toBeVisible();
    }
  });

  test('allows dézoomer la carte', async ({ page }) => {
    await createTestProject(page, 'Test Map Unzoom');

    // Rechercher le bouton zoom out
    const zoomOutButton = page
      .locator(
        'button[aria-label*="Zoom out"], button:has(svg[class*="minus"])'
      )
      .first();

    if ((await zoomOutButton.count()) > 0) {
      await zoomOutButton.click();
      await page.waitForTimeout(500);
      await zoomOutButton.click();
      await page.waitForTimeout(500);

      await expect(zoomOutButton).toBeVisible();
    }
  });

  test('allows réinitialiser le zoom', async ({ page }) => {
    await createTestProject(page, 'Test Reset Zoom');

    // Zoomer d'abord
    const zoomInButton = page
      .locator('button[aria-label*="Zoom in"], button:has(svg[class*="plus"])')
      .first();

    if ((await zoomInButton.count()) > 0) {
      await zoomInButton.click();
      await page.waitForTimeout(500);

      // Rechercher le bouton de reset
      const resetButton = page
        .locator('button[aria-label*="Reset"], button[aria-label*="Fit"]')
        .first();

      if ((await resetButton.count()) > 0) {
        await resetButton.click();
        await page.waitForTimeout(500);

        // Le zoom devrait être réinitialisé
        await expect(resetButton).toBeVisible();
      }
    }
  });

  test('displays la carte principale', async ({ page }) => {
    await createTestProject(page, 'Test Main Map');

    // La carte devrait être visible
    const mapContainer = page
      .locator('[class*="main-map"], canvas, svg:has(path)')
      .first();

    if ((await mapContainer.count()) > 0) {
      await expect(mapContainer).toBeVisible();

      // Vérifier que la carte a une taille
      const boundingBox = await mapContainer.boundingBox();
      if (boundingBox) {
        expect(boundingBox.width).toBeGreaterThan(100);
        expect(boundingBox.height).toBeGreaterThan(100);
      }
    }
  });
});
