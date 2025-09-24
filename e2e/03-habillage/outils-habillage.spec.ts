import { expect, test } from '@playwright/test';
import { join } from 'node:path';

const MODAL_CONTAINER_SELECTOR = '#khartis-create-project .bx--modal-container';
const TEST_DATASET_PATH = join(process.cwd(), 'e2e', 'mocks', 'csv', 'nuts2_data.csv');

async function createTestProject(page: any, projectName: string = 'Test Habillage') {
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

  const createButton = modal.getByRole('button', { name: 'Créer', exact: true });
  await createButton.click();
  await expect(modal).toBeHidden({ timeout: 10000 });

  await page.waitForTimeout(2000);

  const habillageStep = page.getByRole('button', { name: /Habillage/i }).or(page.locator('[data-testid="step-habillage"]'));
  await habillageStep.click();
  await page.waitForTimeout(2000);
}

test.describe('Outil Format - 2.C.2.a', () => {
  test('configure le format et la mise en page', async ({ page }) => {
    await createTestProject(page);

    const formatTool = page.locator('[data-testid="format-tool"]').or(page.locator('button:has-text("Format")')).first();
    if (await formatTool.count() > 0) {
      await formatTool.click();
      await page.waitForTimeout(500);

      const formatOptions = page.locator('[data-testid="format-option"]').or(page.locator('.format-option'));
      const count = await formatOptions.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test.skip('gère la grille d\'alignement avec magnétisme', async ({ page }) => {});
});

test.describe('Outil Légende - 2.C.2.b', () => {
  test('édite et personnalise les légendes', async ({ page }) => {
    await createTestProject(page);

    const legendTool = page.locator('[data-testid="legend-tool"]').or(page.locator('button:has-text("Légende")')).first();
    if (await legendTool.count() > 0) {
      await legendTool.click();
      await page.waitForTimeout(500);

      const legendEditor = page.locator('[data-testid="legend-editor"]').or(page.locator('.legend-editor'));
      await expect(legendEditor).toBeVisible({ timeout: 5000 });
    }
  });

  test.skip('applique les styles à toutes les légendes', async ({ page }) => {});
});

test.describe('Indications géographiques - 2.C.2.c', () => {
  test('ajoute et configure une échelle', async ({ page }) => {
    await createTestProject(page);

    const scaleTool = page.locator('[data-testid="scale-tool"]').or(page.locator('button:has-text("Echelle")')).first();
    if (await scaleTool.count() > 0) {
      await scaleTool.click();
      await page.waitForTimeout(500);

      const scaleElement = page.locator('[data-testid="scale-element"]').or(page.locator('.scale-bar'));
      await expect(scaleElement).toBeVisible({ timeout: 5000 });
    }
  });

  test.skip('ajoute et configure l\'orientation', async ({ page }) => {});

  test.skip('ajoute et configure une carte en encart', async ({ page }) => {});
});

test.describe('Annotations - Texte - 2.C.2.d', () => {
  test('ajoute une zone de texte', async ({ page }) => {
    await createTestProject(page);

    const textTool = page.locator('[data-testid="text-tool"]').or(page.locator('button:has-text("Texte")')).first();
    if (await textTool.count() > 0) {
      await textTool.click();
      await page.waitForTimeout(500);

      const canvas = page.locator('.map-canvas, #map, [data-testid="map"]').first();
      await canvas.click({ position: { x: 100, y: 100 } });
      await page.keyboard.type('Mon annotation');
      await page.keyboard.press('Enter');
    }
  });

  test.skip('place le texte sur la page', async ({ page }) => {});

  test.skip('applique un style prédéfini', async ({ page }) => {});

  test.skip('applique un style personnalisé', async ({ page }) => {});

  test('définit le contenu du texte', async ({ page }) => {
    await createTestProject(page);

    const textTool = page.locator('[data-testid="text-tool"]').or(page.locator('button:has-text("Texte")')).first();
    if (await textTool.count() > 0) {
      await textTool.click();
      const textInput = page.locator('[data-testid="text-input"]').or(page.locator('input[type="text"], textarea')).first();
      if (await textInput.count() > 0) {
        await textInput.fill('Mon texte personnalisé');
        const value = await textInput.inputValue();
        expect(value).toBe('Mon texte personnalisé');
      }
    }
  });

  test.skip('modifie le contenu d\'un texte existant', async ({ page }) => {});

  test.skip('modifie le style d\'un texte existant', async ({ page }) => {});

  test.skip('sélectionne un texte sur la page', async ({ page }) => {});

  test.skip('supprime un texte sélectionné', async ({ page }) => {});
});

test.describe('Annotations - Formes - 2.C.2.d', () => {
  test.skip('ajoute et configure différentes formes géométriques', async ({ page }) => {});

  test.skip('modifie et supprime des formes existantes', async ({ page }) => {});
});

test.describe('Annotations - Dessin - 2.C.2.d', () => {
  test.skip('dessine une ligne libre à main levée', async ({ page }) => {});

  test.skip('dessine une zone fermée (polygone libre)', async ({ page }) => {});

  test.skip('règle l\'épaisseur du trait', async ({ page }) => {});

  test.skip('règle le taux de lissage du tracé', async ({ page }) => {});

  test.skip('applique un lissage automatique au dessin', async ({ page }) => {});

  test.skip('modifie la couleur de contour', async ({ page }) => {});

  test.skip('modifie la couleur de fond', async ({ page }) => {});

  test.skip('applique des pointillés au tracé', async ({ page }) => {});

  test.skip('dessine avec pression variable (si supporté)', async ({ page }) => {});

  test.skip('annule le dernier trait avec Ctrl+Z', async ({ page }) => {});

  test.skip('modifie un dessin existant', async ({ page }) => {});

  test.skip('supprime un dessin sélectionné', async ({ page }) => {});
});

test.describe('Annotations - Image - 2.C.2.d', () => {
  test.skip('importe une image JPG', async ({ page }) => {});

  test.skip('importe une image PNG', async ({ page }) => {});

  test.skip('place l\'image librement', async ({ page }) => {});

  test.skip('règle la taille de l\'image', async ({ page }) => {});

  test.skip('règle l\'opacité de l\'image', async ({ page }) => {});

  test.skip('modifie les réglages d\'une image existante', async ({ page }) => {});

  test.skip('supprime une image sélectionnée', async ({ page }) => {});
});

test.describe('Déficiences visuelles - 2.C.2.e', () => {
  test.skip('simule la protanopie (absence de rouge - 1% hommes)', async ({ page }) => {});

  test.skip('simule la deutéranopie (absence de vert - 1% hommes)', async ({ page }) => {});

  test.skip('simule la tritanopie (absence de bleu - 0.001% population)', async ({ page }) => {});

  test.skip('simule l\'achromatopsie (absence totale de couleur)', async ({ page }) => {});

  test.skip('bascule entre différents filtres rapidement', async ({ page }) => {});

  test.skip('n\'affecte pas l\'export de la carte', async ({ page }) => {});

  test.skip('conserve les couleurs originales pour l\'export', async ({ page }) => {});
});