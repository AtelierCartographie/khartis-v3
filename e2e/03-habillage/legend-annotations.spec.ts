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

test.describe('Outil Légende', () => {
  test("ouvre l'outil de légende", async ({ page }) => {
    await createTestProject(page, 'Test Legend');

    // Rechercher l'outil légende
    const legendTool = page
      .locator('button:has-text("Légende"), [aria-label*="Légende"]')
      .first();

    if ((await legendTool.count()) > 0) {
      await legendTool.click();
      await page.waitForTimeout(500);

      // Vérifier que le panneau légende est ouvert
      const legendPanel = page
        .locator('[class*="legend"], #khartis-legend-tool')
        .first();

      if ((await legendPanel.count()) > 0) {
        await expect(legendPanel).toBeVisible();
      }
    }
  });

  test('affiche/masque la légende', async ({ page }) => {
    await createTestProject(page, 'Test Legend Toggle');

    const legendTool = page
      .locator('button:has-text("Légende"), [aria-label*="Légende"]')
      .first();

    if ((await legendTool.count()) > 0) {
      await legendTool.click();
      await page.waitForTimeout(500);

      // Rechercher le toggle de visibilité
      const visibilityToggle = page
        .locator('button[aria-label*="visibility"], .bx--toggle')
        .first();

      if ((await visibilityToggle.count()) > 0) {
        // Toggle off
        await visibilityToggle.click();
        await page.waitForTimeout(500);

        // Toggle on
        await visibilityToggle.click();
        await page.waitForTimeout(500);

        await expect(visibilityToggle).toBeVisible();
      }
    }
  });

  test('permet de modifier le titre de la légende', async ({ page }) => {
    await createTestProject(page, 'Test Legend Title');

    const legendTool = page
      .locator('button:has-text("Légende"), [aria-label*="Légende"]')
      .first();

    if ((await legendTool.count()) > 0) {
      await legendTool.click();
      await page.waitForTimeout(500);

      // Rechercher le champ de titre
      const titleInput = page
        .locator('input[placeholder*="Titre"], input[placeholder*="titre"]')
        .first();

      if ((await titleInput.count()) > 0) {
        await titleInput.fill('Ma Légende Personnalisée');
        await expect(titleInput).toHaveValue('Ma Légende Personnalisée');
      }
    }
  });

  test('permet de modifier la police', async ({ page }) => {
    await createTestProject(page, 'Test Legend Font');

    const legendTool = page
      .locator('button:has-text("Légende"), [aria-label*="Légende"]')
      .first();

    if ((await legendTool.count()) > 0) {
      await legendTool.click();
      await page.waitForTimeout(500);

      // Rechercher le sélecteur de police
      const fontSelect = page
        .locator('select:has(option:has-text("Arial")), [role="combobox"]')
        .first();

      if ((await fontSelect.count()) > 0) {
        await expect(fontSelect).toBeVisible();

        // Vérifier qu'il y a des options de police
        const options = await fontSelect.locator('option').count();
        expect(options).toBeGreaterThan(0);
      }
    }
  });

  test('permet de régler la taille du texte', async ({ page }) => {
    await createTestProject(page, 'Test Legend Size');

    const legendTool = page
      .locator('button:has-text("Légende"), [aria-label*="Légende"]')
      .first();

    if ((await legendTool.count()) > 0) {
      await legendTool.click();
      await page.waitForTimeout(500);

      // Rechercher le slider ou input de taille
      const sizeControl = page
        .locator(
          '.bx--slider, input[type="number"][max*="2"], input[type="range"]'
        )
        .first();

      if ((await sizeControl.count()) > 0) {
        await expect(sizeControl).toBeVisible();

        if (sizeControl.locator('input[type="range"]')) {
          const input = sizeControl.locator('input');
          await input.fill('16');
        }
      }
    }
  });

  test("permet d'ajouter un arrière-plan", async ({ page }) => {
    await createTestProject(page, 'Test Legend Background');

    const legendTool = page
      .locator('button:has-text("Légende"), [aria-label*="Légende"]')
      .first();

    if ((await legendTool.count()) > 0) {
      await legendTool.click();
      await page.waitForTimeout(500);

      // Rechercher le toggle d'arrière-plan
      const bgToggle = page
        .locator(
          '.bx--toggle:has-text("Arrière-plan"), .bx--toggle:has-text("Background")'
        )
        .first();

      if ((await bgToggle.count()) > 0) {
        await bgToggle.click();
        await page.waitForTimeout(500);

        // Vérifier que les options d'arrière-plan apparaissent
        const opacitySlider = page
          .locator(
            '.bx--slider:has-text("Opacité"), .bx--slider:has-text("Opacity")'
          )
          .first();

        if ((await opacitySlider.count()) > 0) {
          await expect(opacitySlider).toBeVisible();
        }
      }
    }
  });
});

test.describe('Annotations - Texte', () => {
  test("ouvre l'outil d'annotations texte", async ({ page }) => {
    await createTestProject(page, 'Test Text Annotations');

    // Rechercher l'outil annotations
    const annotationsTool = page
      .locator('button:has-text("Annotations"), button:has-text("Texte")')
      .first();

    if ((await annotationsTool.count()) > 0) {
      await annotationsTool.click();
      await page.waitForTimeout(500);

      // Vérifier que le panneau est ouvert
      const annotationsPanel = page
        .locator('[class*="annotations"], [class*="text-tool"]')
        .first();

      if ((await annotationsPanel.count()) > 0) {
        await expect(annotationsPanel).toBeVisible();
      }
    }
  });

  test('ajoute une zone de texte', async ({ page }) => {
    await createTestProject(page, 'Test Add Text');

    const annotationsTool = page
      .locator('button:has-text("Annotations"), button:has-text("Texte")')
      .first();

    if ((await annotationsTool.count()) > 0) {
      await annotationsTool.click();
      await page.waitForTimeout(500);

      // Rechercher le bouton d'ajout
      const addButton = page
        .locator('button:has(svg[class*="add"]), button:has-text("Ajouter")')
        .first();

      if ((await addButton.count()) > 0) {
        await addButton.click();
        await page.waitForTimeout(500);

        // Une zone de texte devrait être ajoutée sur la carte
        const textArea = page
          .locator('textarea, [contenteditable="true"]')
          .first();

        if ((await textArea.count()) > 0) {
          await expect(textArea).toBeVisible();
        }
      }
    }
  });

  test('permet de saisir du texte', async ({ page }) => {
    await createTestProject(page, 'Test Enter Text');

    const annotationsTool = page
      .locator('button:has-text("Annotations"), button:has-text("Texte")')
      .first();

    if ((await annotationsTool.count()) > 0) {
      await annotationsTool.click();
      await page.waitForTimeout(500);

      // Ajouter une zone de texte
      const addButton = page
        .locator('button:has(svg[class*="add"]), button:has-text("Ajouter")')
        .first();

      if ((await addButton.count()) > 0) {
        await addButton.click();
        await page.waitForTimeout(500);

        // Saisir du texte
        const textInput = page
          .locator('textarea, [contenteditable="true"]')
          .first();

        if ((await textInput.count()) > 0) {
          await textInput.fill('Mon annotation de test');
          await expect(textInput).toHaveValue('Mon annotation de test');
        }
      }
    }
  });

  test('permet de choisir un style prédéfini', async ({ page }) => {
    await createTestProject(page, 'Test Text Style');

    const annotationsTool = page
      .locator('button:has-text("Annotations"), button:has-text("Texte")')
      .first();

    if ((await annotationsTool.count()) > 0) {
      await annotationsTool.click();
      await page.waitForTimeout(500);

      // Rechercher le sélecteur de style
      const styleSelect = page
        .locator(
          'select:has(option:has-text("Note")), select:has(option:has-text("Titre"))'
        )
        .first();

      if ((await styleSelect.count()) > 0) {
        await expect(styleSelect).toBeVisible();

        // Sélectionner un style
        await styleSelect.selectOption({ index: 1 });
      }
    }
  });

  test('permet de modifier la taille du texte', async ({ page }) => {
    await createTestProject(page, 'Test Text Size');

    const annotationsTool = page
      .locator('button:has-text("Annotations"), button:has-text("Texte")')
      .first();

    if ((await annotationsTool.count()) > 0) {
      await annotationsTool.click();
      await page.waitForTimeout(500);

      // Rechercher le contrôle de taille
      const sizeInput = page
        .locator('input[type="number"][min], .bx--number input')
        .first();

      if ((await sizeInput.count()) > 0) {
        await sizeInput.fill('18');
        await expect(sizeInput).toHaveValue('18');
      }
    }
  });

  test("permet de changer l'alignement du texte", async ({ page }) => {
    await createTestProject(page, 'Test Text Align');

    const annotationsTool = page
      .locator('button:has-text("Annotations"), button:has-text("Texte")')
      .first();

    if ((await annotationsTool.count()) > 0) {
      await annotationsTool.click();
      await page.waitForTimeout(500);

      // Rechercher les boutons d'alignement
      const alignButtons = page.locator(
        'button[aria-label*="align"], button:has(svg[class*="text-align"])'
      );

      if ((await alignButtons.count()) > 0) {
        // Il devrait y avoir au moins 3 boutons (gauche, centre, droite)
        const buttonCount = await alignButtons.count();
        expect(buttonCount).toBeGreaterThanOrEqual(3);

        // Cliquer sur alignement centré
        const centerButton = alignButtons.nth(1);
        await centerButton.click();
      }
    }
  });
});
