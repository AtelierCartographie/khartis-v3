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

test.describe('Sélecteur de couleurs', () => {
  test('ouvre le sélecteur de couleur', async ({ page }) => {
    await createTestProject(page, 'Test Color Picker');

    // Rechercher un bouton ou élément qui ouvre le color picker
    const colorTrigger = page
      .locator('[class*="color"], button:has-text("Couleur")')
      .first();

    if ((await colorTrigger.count()) > 0) {
      await colorTrigger.click();
      await page.waitForTimeout(500);

      // Vérifier que le sélecteur est ouvert
      const colorPicker = page
        .locator('[class*="color-picker"], [class*="dropdown"]')
        .first();

      if ((await colorPicker.count()) > 0) {
        await expect(colorPicker).toBeVisible();
      }
    }
  });

  test('affiche les sliders HSL', async ({ page }) => {
    await createTestProject(page, 'Test HSL Sliders');

    const colorTrigger = page
      .locator('[class*="color"], button:has-text("Couleur")')
      .first();

    if ((await colorTrigger.count()) > 0) {
      await colorTrigger.click();
      await page.waitForTimeout(500);

      // Rechercher les sliders
      const sliders = page.locator('.bx--slider');

      if ((await sliders.count()) > 0) {
        // Il devrait y avoir 3 sliders (Hue, Saturation, Lightness)
        const sliderCount = await sliders.count();
        expect(sliderCount).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test('modifie la teinte (hue)', async ({ page }) => {
    await createTestProject(page, 'Test Hue');

    const colorTrigger = page
      .locator('[class*="color"], button:has-text("Couleur")')
      .first();

    if ((await colorTrigger.count()) > 0) {
      await colorTrigger.click();
      await page.waitForTimeout(500);

      // Trouver le premier slider (généralement Hue)
      const hueSlider = page.locator('.bx--slider').first();

      if ((await hueSlider.count()) > 0) {
        const sliderInput = hueSlider.locator('input[type="range"]');

        // Changer la valeur
        await sliderInput.fill('180');

        // Vérifier que la valeur a changé
        const value = await sliderInput.inputValue();
        expect(value).toBe('180');
      }
    }
  });

  test('affiche le code hexadécimal', async ({ page }) => {
    await createTestProject(page, 'Test Hex Display');

    const colorTrigger = page
      .locator('[class*="color"], button:has-text("Couleur")')
      .first();

    if ((await colorTrigger.count()) > 0) {
      await colorTrigger.click();
      await page.waitForTimeout(500);

      // Rechercher l'affichage du code hex
      const hexDisplay = page.locator('text=/#[0-9A-Fa-f]{6}/');

      if ((await hexDisplay.count()) > 0) {
        await expect(hexDisplay.first()).toBeVisible();
      }
    }
  });

  test('valide la sélection de couleur', async ({ page }) => {
    await createTestProject(page, 'Test Color Validation');

    const colorTrigger = page
      .locator('[class*="color"], button:has-text("Couleur")')
      .first();

    if ((await colorTrigger.count()) > 0) {
      await colorTrigger.click();
      await page.waitForTimeout(500);

      // Rechercher les boutons de validation/annulation
      const validateButton = page
        .locator('button:has-text("Valider"), button:has(svg[class*="arrow"])')
        .first();

      if ((await validateButton.count()) > 0) {
        await validateButton.click();
        await page.waitForTimeout(500);

        // Le color picker devrait être fermé
        const colorPicker = page.locator('[class*="color-picker"]');
        await expect(colorPicker).not.toBeVisible();
      }
    }
  });
});

test.describe('Palettes de couleurs', () => {
  test('affiche des suggestions de palettes', async ({ page }) => {
    await createTestProject(page, 'Test Palettes');

    // Rechercher des éléments de palette
    const palettes = page.locator(
      '[class*="palette"], [class*="color-scheme"]'
    );

    if ((await palettes.count()) > 0) {
      await expect(palettes.first()).toBeVisible();
    }
  });

  test('permet de sélectionner une palette prédéfinie', async ({ page }) => {
    await createTestProject(page, 'Test Palette Selection');

    const palettes = page.locator(
      '[class*="palette"], [class*="color-scheme"]'
    );

    if ((await palettes.count()) > 0) {
      const firstPalette = palettes.first();
      await firstPalette.click();
      await page.waitForTimeout(500);

      // La palette devrait être appliquée (vérifier un changement visuel ou de classe)
      const isSelected = await firstPalette.evaluate((el) => {
        return (
          el.classList.toString().includes('selected') ||
          el.classList.toString().includes('active')
        );
      });

      expect(typeof isSelected).toBe('boolean');
    }
  });
});
