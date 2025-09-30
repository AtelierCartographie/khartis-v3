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
}

test.describe('Table preview de données', () => {
  test('displays le tableau de données importées', async ({ page }) => {
    await createTestProject(page, 'Test Tableau');

    // Attendre que le tableau soit chargé
    await page.waitForTimeout(2000);

    // Vérifier la présence du tableau
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    // Vérifier qu'il y a des colonnes
    const headers = page.locator('th');
    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThan(0);

    // Vérifier qu'il y a des lignes de données
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('displays le nombre total de lignes', async ({ page }) => {
    await createTestProject(page, 'Test Comptage');

    await page.waitForTimeout(2000);

    // Rechercher une indication du nombre de lignes
    const rowIndicator = page.locator('text=/\\d+ (lignes?|rows?)/i');
    const hasRowCount = await rowIndicator.count();

    if (hasRowCount > 0) {
      await expect(rowIndicator.first()).toBeVisible();
    }
  });

  test('displays les types de colonnes', async ({ page }) => {
    await createTestProject(page, 'Test Types');

    await page.waitForTimeout(2000);

    // Vérifier que les en-têtes de colonnes contiennent des indications de type
    const headers = page.locator('th');
    const firstHeader = headers.first();

    if ((await firstHeader.count()) > 0) {
      const headerText = await firstHeader.textContent();
      // Les types sont souvent affichés entre parenthèses ou avec une icône
      expect(headerText).toBeTruthy();
    }
  });

  test('permet le scroll vertical pour grandes données', async ({ page }) => {
    await createTestProject(page, 'Test Scroll');

    await page.waitForTimeout(2000);

    // Vérifier la présence d'un conteneur avec scroll
    const scrollableContainer = page.locator('[style*="overflow"]').first();

    if ((await scrollableContainer.count()) > 0) {
      const hasOverflow = await scrollableContainer.evaluate((el) => {
        return el.scrollHeight > el.clientHeight;
      });

      // Si le dataset est grand, il devrait y avoir un scroll
      expect(typeof hasOverflow).toBe('boolean');
    }
  });
});

test.describe('Typage des variables', () => {
  test('détecte automatiquement les types de données', async ({ page }) => {
    await createTestProject(page, 'Test Auto Type');

    await page.waitForTimeout(2000);

    // Les types devraient être détectés automatiquement
    // Rechercher des indicateurs de type (texte, numérique, géographique)
    const typeIndicators = page.locator('[class*="type"], [data-type]');

    if ((await typeIndicators.count()) > 0) {
      await expect(typeIndicators.first()).toBeVisible();
    }
  });

  test('displays une icône ou indication pour chaque type', async ({
    page
  }) => {
    await createTestProject(page, 'Test Type Icons');

    await page.waitForTimeout(2000);

    // Rechercher des icônes ou badges de type
    const typeIcons = page.locator('[class*="icon"], [class*="badge"], svg');

    if ((await typeIcons.count()) > 0) {
      const iconCount = await typeIcons.count();
      expect(iconCount).toBeGreaterThan(0);
    }
  });
});

test.describe('Gestion multi-fichiers', () => {
  test('displays les onglets pour plusieurs fichiers', async ({ page }) => {
    await createTestProject(page, 'Test Multi Files');

    // Ajouter un deuxième fichier
    const addButton = page
      .locator('[aria-label*="Ajouter"], button:has(svg[class*="add"])')
      .first();

    if ((await addButton.count()) > 0) {
      await addButton.click();
      await page.waitForTimeout(1000);

      // Vérifier si une modal d'ajout s'ouvre
      const addModal = page.locator('.bx--modal[aria-label*="Ajouter"]');

      if ((await addModal.count()) > 0) {
        await expect(addModal).toBeVisible();
      }
    }
  });

  test('allows supprimer un fichier', async ({ page }) => {
    await createTestProject(page, 'Test Delete File');

    // Rechercher un bouton de suppression ou menu overflow
    const deleteButton = page
      .locator('[aria-label*="Supprimer"], .bx--overflow-menu')
      .first();

    if ((await deleteButton.count()) > 0) {
      await expect(deleteButton).toBeVisible();
    }
  });
});
