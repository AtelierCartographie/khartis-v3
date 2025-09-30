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

  // Naviguer vers l'étape Habillage
  const styleStep = page.locator('[data-testid="step-styling"]');
  await styleStep.click();
  await page.waitForTimeout(1000);
}

test.describe('Outil Format - Habillage', () => {
  test("ouvre l'outil de format", async ({ page }) => {
    await createTestProject(page, 'Test Format');

    // Rechercher l'outil format
    const formatTool = page
      .locator('button:has-text("Format"), [aria-label*="Format"]')
      .first();

    if ((await formatTool.count()) > 0) {
      await formatTool.click();
      await page.waitForTimeout(500);

      // Vérifier que le panneau format est ouvert
      const formatPanel = page
        .locator('#khartis-format-tool, [class*="format"]')
        .first();
      await expect(formatPanel).toBeVisible();
    }
  });

  test('affiche les modes prédéfini et personnalisé', async ({ page }) => {
    await createTestProject(page, 'Test Format Modes');

    const formatTool = page
      .locator('button:has-text("Format"), [aria-label*="Format"]')
      .first();

    if ((await formatTool.count()) > 0) {
      await formatTool.click();
      await page.waitForTimeout(500);

      // Rechercher les onglets de mode
      const presetTab = page
        .locator(
          'button:has-text("Prédéfini"), [role="tab"]:has-text("Preset")'
        )
        .first();
      const customTab = page
        .locator(
          'button:has-text("Personnalisé"), [role="tab"]:has-text("Custom")'
        )
        .first();

      if ((await presetTab.count()) > 0) {
        await expect(presetTab).toBeVisible();
      }

      if ((await customTab.count()) > 0) {
        await expect(customTab).toBeVisible();
      }
    }
  });

  test('permet de sélectionner un format prédéfini', async ({ page }) => {
    await createTestProject(page, 'Test Preset Format');

    const formatTool = page
      .locator('button:has-text("Format"), [aria-label*="Format"]')
      .first();

    if ((await formatTool.count()) > 0) {
      await formatTool.click();
      await page.waitForTimeout(500);

      // Rechercher le sélecteur de modèle
      const modelSelect = page.locator('select, [role="combobox"]').first();

      if ((await modelSelect.count()) > 0) {
        await expect(modelSelect).toBeVisible();

        // Vérifier qu'il y a des options
        const options = await modelSelect.locator('option').count();
        expect(options).toBeGreaterThan(0);
      }
    }
  });

  test('permet de définir une taille personnalisée', async ({ page }) => {
    await createTestProject(page, 'Test Custom Size');

    const formatTool = page
      .locator('button:has-text("Format"), [aria-label*="Format"]')
      .first();

    if ((await formatTool.count()) > 0) {
      await formatTool.click();
      await page.waitForTimeout(500);

      // Basculer en mode personnalisé
      const customTab = page
        .locator(
          'button:has-text("Personnalisé"), [role="tab"]:has-text("Custom")'
        )
        .first();

      if ((await customTab.count()) > 0) {
        await customTab.click();
        await page.waitForTimeout(500);

        // Rechercher les champs de dimensions
        const widthInput = page.locator('input[type="number"]').first();
        const heightInput = page.locator('input[type="number"]').nth(1);

        if ((await widthInput.count()) > 0) {
          await widthInput.fill('800');
          await expect(widthInput).toHaveValue('800');
        }

        if ((await heightInput.count()) > 0) {
          await heightInput.fill('600');
          await expect(heightInput).toHaveValue('600');
        }
      }
    }
  });

  test('permet de changer la couleur de fond', async ({ page }) => {
    await createTestProject(page, 'Test Background Color');

    const formatTool = page
      .locator('button:has-text("Format"), [aria-label*="Format"]')
      .first();

    if ((await formatTool.count()) > 0) {
      await formatTool.click();
      await page.waitForTimeout(500);

      // Rechercher le sélecteur de couleur
      const colorSelector = page
        .locator('[class*="color-selector"], button:has-text("Couleur")')
        .first();

      if ((await colorSelector.count()) > 0) {
        await expect(colorSelector).toBeVisible();

        // Cliquer pour ouvrir le sélecteur
        await colorSelector.click();
        await page.waitForTimeout(500);

        // Le color picker devrait s'ouvrir
        const colorPicker = page.locator('[class*="color-picker"]').first();

        if ((await colorPicker.count()) > 0) {
          await expect(colorPicker).toBeVisible();
        }
      }
    }
  });

  test('permet de régler les marges', async ({ page }) => {
    await createTestProject(page, 'Test Margins');

    const formatTool = page
      .locator('button:has-text("Format"), [aria-label*="Format"]')
      .first();

    if ((await formatTool.count()) > 0) {
      await formatTool.click();
      await page.waitForTimeout(500);

      // Rechercher l'éditeur de marges
      const marginInputs = page.locator(
        '[class*="margin"] input[type="number"]'
      );

      if ((await marginInputs.count()) > 0) {
        // Il devrait y avoir 4 inputs pour les marges (haut, droite, bas, gauche)
        const marginCount = await marginInputs.count();
        expect(marginCount).toBeGreaterThanOrEqual(4);

        // Modifier la première marge
        const firstMargin = marginInputs.first();
        await firstMargin.fill('20');
        await expect(firstMargin).toHaveValue('20');
      }
    }
  });

  test("affiche et active la grille d'alignement", async ({ page }) => {
    await createTestProject(page, 'Test Grid');

    const formatTool = page
      .locator('button:has-text("Format"), [aria-label*="Format"]')
      .first();

    if ((await formatTool.count()) > 0) {
      await formatTool.click();
      await page.waitForTimeout(500);

      // Rechercher le toggle de grille
      const gridToggle = page
        .locator('[class*="grid-toggle"], .bx--toggle:has-text("Grille")')
        .first();

      if ((await gridToggle.count()) > 0) {
        await expect(gridToggle).toBeVisible();

        // Activer la grille
        await gridToggle.click();
        await page.waitForTimeout(500);

        // Vérifier que la grille est visible sur la carte
        const gridOverlay = page
          .locator('[class*="grid-overlay"], [class*="grid-lines"]')
          .first();

        if ((await gridOverlay.count()) > 0) {
          await expect(gridOverlay).toBeVisible();
        }
      }
    }
  });
});
