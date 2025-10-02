import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { MODAL_CONTAINER_SELECTOR, waitForModalVisible } from '../helpers';
const DATASET_PATH = join(process.cwd(), 'e2e', 'mocks', 'csv');

test.describe('Réinitialisation des données - 2.A.5.h', () => {
  test('affiche la section de contrôle des données après import', async ({
    page
  }) => {
    const csvPath = join(DATASET_PATH, 'nuts2_data.csv');

    await page.goto('/');
    const modal = await waitForModalVisible(page);

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();
    await page.waitForTimeout(500);

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(csvPath);

    await page.waitForTimeout(1000);

    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.fill('Test Reset Feature');
    await page.waitForTimeout(500);

    const createButton = modal.getByRole('button', {
      name: 'Créer',
      exact: true
    });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    await expect(modal).toBeHidden({ timeout: 10000 });

    await page.waitForTimeout(2000);

    const dataControlHeading = page.getByText('1. Contrôler les données');
    await expect(dataControlHeading).toBeVisible();
  });

  test.skip("vérifie que le bouton de réinitialisation s'affiche", async ({
    page
  }) => {});

  test.skip("ouvre une modal de confirmation avec message d'avertissement", async ({
    page
  }) => {});

  test.skip("permet d'annuler l'opération de réinitialisation", async ({
    page
  }) => {});

  test.skip('avertit si des visualisations sont liées aux données', async ({
    page
  }) => {});

  test.skip('restaure les données à leur état initial', async ({ page }) => {});

  test.skip('efface toutes les modifications (filtres, calculs)', async ({
    page
  }) => {});
});
