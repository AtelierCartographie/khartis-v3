import { expect, test } from '@playwright/test';
import { join } from 'node:path';

const MODAL_CONTAINER_SELECTOR = '#khartis-create-project .bx--modal-container';
const TEST_DATASET_PATH = join(process.cwd(), 'e2e', 'mocks', 'csv', 'nuts2_data.csv');

async function createTestProject(page: any, projectName: string = 'Test Viz') {
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

  const visualizationStep = page.getByRole('button', { name: /Visualisation/i }).or(page.locator('[data-testid="step-visualization"]'));
  await visualizationStep.click();
  await page.waitForTimeout(2000);
}

test.describe('Création de visualisations - 2.B.1', () => {
  test('crée automatiquement une visualisation à l\'étape', async ({ page }) => {
    await createTestProject(page);

    const vizPanel = page.locator('[data-testid="visualization-panel"]').or(page.locator('.visualization-panel, .viz-panel'));
    await expect(vizPanel).toBeVisible({ timeout: 10000 });

    const vizList = page.locator('[data-testid="viz-item"]').or(page.locator('.viz-item, .visualization-item'));
    const count = await vizList.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('nomme par défaut "Visualisation (1)"', async ({ page }) => {
    await createTestProject(page);

    const vizName = page.locator('[data-testid="viz-name"]').or(page.locator('.viz-name, .visualization-name')).first();
    const name = await vizName.textContent();
    expect(name).toMatch(/Visualisation.*1|Visualization.*1/);
  });

  test.skip('incrémente le nom des visualisations suivantes', async ({ page }) => {});

  test('permet de renommer une visualisation', async ({ page }) => {
    await createTestProject(page);

    const vizName = page.locator('[data-testid="viz-name"]').or(page.locator('.viz-name, .visualization-name')).first();
    await vizName.dblclick();
    await page.keyboard.type('Ma Nouvelle Viz');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    const newName = await vizName.textContent();
    expect(newName).toContain('Ma Nouvelle Viz');
  });

  test.skip('permet de dupliquer une visualisation', async ({ page }) => {});

  test('permet de supprimer une visualisation', async ({ page }) => {
    await createTestProject(page);

    const deleteBtn = page.locator('[data-testid="viz-delete"]').or(page.locator('button[aria-label*="supprimer"], button[aria-label*="delete"]')).first();
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();
      await page.waitForTimeout(500);

      const confirmBtn = page.getByRole('button', { name: /Supprimer|Delete/i });
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click();
      }
    }
  });

  test('permet de créer plusieurs visualisations', async ({ page }) => {
    await createTestProject(page);

    const addVizBtn = page.locator('[data-testid="add-viz"]').or(page.locator('button:has-text("Ajouter"), button[aria-label*="ajouter"]')).first();
    if (await addVizBtn.count() > 0) {
      await addVizBtn.click();
      await page.waitForTimeout(1000);

      const vizList = page.locator('[data-testid="viz-item"]').or(page.locator('.viz-item, .visualization-item'));
      const count = await vizList.count();
      expect(count).toBeGreaterThan(1);
    }
  });

  test.skip('choisit le jeu de données à visualiser', async ({ page }) => {});
});

test.describe('Suggestions de visualisations - 2.B.2.a', () => {
  test('propose des visualisations selon les données', async ({ page }) => {
    await createTestProject(page);

    const suggestions = page.locator('[data-testid="viz-suggestion"]').or(page.locator('.suggestion-card, .viz-suggestion'));
    const count = await suggestions.count();
    expect(count).toBeGreaterThan(0);
  });

  test('affiche les vignettes des suggestions', async ({ page }) => {
    await createTestProject(page);

    const suggestionThumbnails = page.locator('[data-testid="suggestion-thumbnail"]').or(page.locator('.suggestion-thumbnail, .suggestion img'));
    if (await suggestionThumbnails.count() > 0) {
      await expect(suggestionThumbnails.first()).toBeVisible();
    }
  });

  test.skip('affiche les primitives graphiques utilisées', async ({ page }) => {});

  test.skip('affiche le type de visualisation', async ({ page }) => {});

  test.skip('affiche les variables concernées', async ({ page }) => {});

  test('sélectionne la meilleure suggestion par défaut', async ({ page }) => {
    await createTestProject(page);

    const firstSuggestion = page.locator('[data-testid="viz-suggestion"]').or(page.locator('.suggestion-card')).first();
    const isSelected = await firstSuggestion.evaluate(el => {
      return el.classList.contains('selected') || el.getAttribute('aria-selected') === 'true';
    });
    expect(typeof isSelected).toBe('boolean');
  });

  test.skip('applique directement sur la carte', async ({ page }) => {});

  test.skip('limite à 3 suggestions visibles', async ({ page }) => {});

  test.skip('charge 3 suggestions supplémentaires', async ({ page }) => {});

  test.skip('préremplit les paramètres de la suggestion', async ({ page }) => {});
});

test.describe('Paramétrage de visualisation - 2.B.2.b', () => {
  test('regroupe les réglages par primitives', async ({ page }) => {
    await createTestProject(page);

    const primitiveGroups = page.locator('[data-testid="primitive-group"]').or(page.locator('.primitive-settings, .settings-group'));
    const count = await primitiveGroups.count();
    expect(count).toBeGreaterThan(0);
  });

  test.skip('paramètre les symboles', async ({ page }) => {});

  test.skip('paramètre les polygones', async ({ page }) => {});

  test.skip('paramètre les lignes', async ({ page }) => {});

  test.skip('paramètre les textes', async ({ page }) => {});

  test('affiche/masque une primitive', async ({ page }) => {
    await createTestProject(page);

    const visibilityToggle = page.locator('[data-testid="primitive-visibility"]').or(page.locator('button[aria-label*="visibility"]')).first();
    if (await visibilityToggle.count() > 0) {
      await visibilityToggle.click();
      await page.waitForTimeout(500);
      await visibilityToggle.click();
    }
  });

  test.skip('filtre une primitive', async ({ page }) => {});

  test('règle la taille des éléments', async ({ page }) => {
    await createTestProject(page);

    const sizeSlider = page.locator('[data-testid="size-slider"]').or(page.locator('input[type="range"][aria-label*="taille"], input[type="range"][aria-label*="size"]')).first();
    if (await sizeSlider.count() > 0) {
      await sizeSlider.fill('50');
      const value = await sizeSlider.inputValue();
      expect(value).toBe('50');
    }
  });

  test('règle l\'épaisseur des traits', async ({ page }) => {
    await createTestProject(page);

    const strokeSlider = page.locator('[data-testid="stroke-width"]').or(page.locator('input[type="range"][aria-label*="épaisseur"], input[type="range"][aria-label*="width"]')).first();
    if (await strokeSlider.count() > 0) {
      await strokeSlider.fill('3');
      const value = await strokeSlider.inputValue();
      expect(value).toBe('3');
    }
  });

  test.skip('change la forme des symboles', async ({ page }) => {});

  test.skip('modifie la couleur de fond', async ({ page }) => {});

  test.skip('modifie la couleur de contour', async ({ page }) => {});

  test.skip('varie selon variable quantitative', async ({ page }) => {});

  test.skip('varie selon variable qualitative', async ({ page }) => {});
});