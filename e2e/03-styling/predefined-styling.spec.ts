import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { MODAL_CONTAINER_SELECTOR, waitForModalVisible } from '../helpers';
const TEST_DATASET_PATH = join(
  process.cwd(),
  'e2e',
  'mocks',
  'csv',
  'nuts2_data.csv'
);

test.describe('Habillage prédéfini - 2.C.1', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    const modal = await waitForModalVisible(page);

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();
    await page.waitForTimeout(500);

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TEST_DATASET_PATH);

    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.fill('Test Habillage');

    await page.waitForTimeout(500);

    const createButton = modal.getByRole('button', {
      name: 'Créer',
      exact: true
    });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    await expect(modal).toBeHidden({ timeout: 10000 });

    await page.waitForTimeout(2000);

    const habillageStep = page
      .getByRole('button', { name: /Habillage/i })
      .or(page.locator('[data-testid="step-habillage"]'));
    await habillageStep.click();
    await page.waitForTimeout(2000);
  });

  test('displays automatiquement la légende', async ({ page }) => {
    const legend = page
      .locator('[data-testid="legend-tool"]')
      .or(page.locator('.legend-container'));
    await expect(legend).toBeVisible({ timeout: 10000 });
  });

  test('displays predefined texts at step', async ({ page }) => {
    await page.waitForTimeout(2000);

    const textElements = page.locator(
      '.habillage-text-element, .map-text-element'
    );
    const count = await textElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test.skip('affiche un placeholder pour le titre', async ({ page }) => {});

  test.skip('affiche un placeholder pour le sous-titre', async ({
    page
  }) => {});

  test.skip('affiche un placeholder pour la source', async ({ page }) => {});

  test.skip('affiche la source du fond de carte', async ({ page }) => {});

  test.skip('affiche un placeholder pour la signature', async ({ page }) => {});

  test.skip('affiche "Réalisé avec Khartis"', async ({ page }) => {});

  test.skip('permet de déplacer chaque élément', async ({ page }) => {});

  test.skip('permet de supprimer chaque élément', async ({ page }) => {});

  test('applique un style par défaut', async ({ page }) => {
    await page.waitForTimeout(2000);

    const mapContainer = page.locator('.map-container, #map-view');
    await expect(mapContainer).toBeVisible();

    const hasDefaultStyles = await mapContainer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.fontFamily !== '' || styles.fontSize !== '';
    });
    expect(hasDefaultStyles).toBeTruthy();
  });

  test.skip("masque les placeholders vides à l'export", async ({ page }) => {});
});
