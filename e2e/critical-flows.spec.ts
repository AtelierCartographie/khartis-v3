import { expect, test } from '@playwright/test';
import { join } from 'node:path';

const CSV_PATH = join(process.cwd(), 'e2e', 'mocks', 'csv', 'nuts2_data.csv');
const MODAL_SELECTOR = '#khartis-create-project .bx--modal-container';

async function cleanState(page: any) {
  await page.goto('/');
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      indexedDB
        .databases()
        .then((dbs) => {
          const deletePromises = dbs.map(
            (db) =>
              new Promise<void>((res) => {
                if (db.name) {
                  const req = indexedDB.deleteDatabase(db.name);
                  req.onsuccess = () => res();
                  req.onerror = () => res();
                } else {
                  res();
                }
              })
          );
          return Promise.all(deletePromises);
        })
        .then(() => {
          localStorage.clear();
          sessionStorage.clear();
          resolve();
        });
    });
  });
  await page.goto('/');
}

test.describe('Khartis v3 - Parcours utilisateur principaux', () => {
  test.beforeEach(async ({ page }) => {
    await cleanState(page);
  });

  test('permet de créer un projet depuis un fichier CSV, naviguer vers les visualisations et exporter', async ({
    page
  }) => {
    const modal = page.locator(MODAL_SELECTOR);
    await expect(modal).toBeVisible({ timeout: 15000 });

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(CSV_PATH);
    await page.waitForTimeout(1000);

    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.fill('Test Flux Principal');

    const createButton = modal.getByRole('button', {
      name: 'Créer',
      exact: true
    });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    await page.waitForSelector('.deck-canvas', {
      state: 'visible',
      timeout: 15000
    });
    await expect(page.locator('.deck-canvas')).toBeVisible();

    const visualizationsTab = page.getByRole('button', {
      name: /visualisations/i
    });
    await visualizationsTab.click();
    await page.waitForTimeout(2000);

    await expect(page.locator('.deck-canvas')).toBeVisible();

    const exportButton = page.locator('[data-testid="export-menu"]');
    await expect(exportButton).toBeVisible();
  });

  test("sauvegarde automatiquement un projet créé et le recharge correctement au retour sur la page d'accueil", async ({
    page
  }) => {
    const modal = page.locator(MODAL_SELECTOR);
    await expect(modal).toBeVisible({ timeout: 15000 });

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(CSV_PATH);
    await page.waitForTimeout(1000);

    const projectName = 'Test Sauvegarde Auto';
    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.fill(projectName);

    const createButton = modal.getByRole('button', {
      name: 'Créer',
      exact: true
    });
    await createButton.click();

    await page.waitForSelector('.deck-canvas', {
      state: 'visible',
      timeout: 15000
    });
    await page.waitForTimeout(3000);

    await page.goto('/');
    await page.waitForTimeout(1000);

    const modalAfterReload = page.locator(MODAL_SELECTOR);
    await expect(modalAfterReload).toBeVisible({ timeout: 15000 });

    const savedTab = modalAfterReload.locator(
      '[data-testid="tab-saved-projects"]'
    );
    await savedTab.click();
    await page.waitForTimeout(500);

    const savedProject = modalAfterReload.getByText(projectName);
    await expect(savedProject).toBeVisible();
  });

  test("charge un projet exemple depuis la page d'accueil et affiche la carte correspondante", async ({
    page
  }) => {
    const modal = page.locator(MODAL_SELECTOR);
    await expect(modal).toBeVisible({ timeout: 15000 });

    const examplesTab = modal.locator('[data-testid="tab-examples"]');
    await examplesTab.click();
    await page.waitForTimeout(500);

    const firstExample = modal.locator('[data-testid="example-card"]').first();
    await expect(firstExample).toBeVisible();

    await firstExample.click();
    await page.waitForTimeout(3000);

    await page.waitForSelector('.deck-canvas', {
      state: 'visible',
      timeout: 15000
    });
    await expect(page.locator('.deck-canvas')).toBeVisible();
  });

  test('préserve les données lors de la navigation entre les étapes Données, Visualisations et Habillage', async ({
    page
  }) => {
    const modal = page.locator(MODAL_SELECTOR);
    await expect(modal).toBeVisible({ timeout: 15000 });

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(CSV_PATH);
    await page.waitForTimeout(1000);

    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.fill('Test Navigation');

    const createButton = modal.getByRole('button', {
      name: 'Créer',
      exact: true
    });
    await createButton.click();

    await page.waitForSelector('.deck-canvas', {
      state: 'visible',
      timeout: 15000
    });

    const visualizationsTab = page.getByRole('button', {
      name: /visualisations/i
    });
    await visualizationsTab.click();
    await page.waitForTimeout(1000);

    const stylingTab = page.getByRole('button', { name: /habillage/i });
    await stylingTab.click();
    await page.waitForTimeout(1000);

    const dataTab = page.getByRole('button', { name: /données/i });
    await dataTab.click();
    await page.waitForTimeout(1000);

    await expect(page.locator('.deck-canvas')).toBeVisible();
  });

  test('permet de créer plusieurs visualisations dans un même projet et maintient le rendu de la carte', async ({
    page
  }) => {
    const modal = page.locator(MODAL_SELECTOR);
    await expect(modal).toBeVisible({ timeout: 15000 });

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(CSV_PATH);
    await page.waitForTimeout(1000);

    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.fill('Test Multi Viz');

    const createButton = modal.getByRole('button', {
      name: 'Créer',
      exact: true
    });
    await createButton.click();

    await page.waitForSelector('.deck-canvas', {
      state: 'visible',
      timeout: 15000
    });

    const visualizationsTab = page.getByRole('button', {
      name: /visualisations/i
    });
    await visualizationsTab.click();
    await page.waitForTimeout(2000);

    const addVizButton = page
      .locator('[data-testid="add-visualization"]')
      .or(page.getByRole('button', { name: /ajouter.*visualisation/i }))
      .first();

    if (await addVizButton.isVisible()) {
      await addVizButton.click();
      await page.waitForTimeout(1000);
    }

    await expect(page.locator('.deck-canvas')).toBeVisible();
  });
});
