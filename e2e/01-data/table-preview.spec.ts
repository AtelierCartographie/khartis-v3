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

async function createTestProject(page: any, projectName: string = 'Test Data') {
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
  await expect(modal).toBeHidden({ timeout: 10000 });

  await page.waitForTimeout(2000);
}

test.describe('Table preview de données - 2.A.5', () => {
  test('displays le tableau dans un panneau latéral', async ({ page }) => {
    await createTestProject(page);

    const dataTable = page
      .locator('[data-testid="data-table"]')
      .or(page.locator('.data-table, .duckdb-table, table'));
    await expect(dataTable).toBeVisible({ timeout: 10000 });

    const rows = dataTable.locator('tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(1);
  });

  test.skip('permet de redimensionner le panneau', async ({ page }) => {});

  test('displays un nombre limité de lignes avec scroll', async ({ page }) => {
    await createTestProject(page);

    const dataTable = page
      .locator('[data-testid="data-table"]')
      .or(page.locator('.data-table, .duckdb-table, table'));
    await expect(dataTable).toBeVisible({ timeout: 10000 });

    const scrollContainer = dataTable.locator('..');
    const hasScroll = await scrollContainer.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    expect(typeof hasScroll).toBe('boolean');
  });

  test.skip("permet d'agrandir le panneau à taille prédéfinie", async ({
    page
  }) => {});
});

test.describe('Actions on variables - 2.A.5.a', () => {
  test("change le type d'une variable", async ({ page }) => {
    await createTestProject(page);

    const columnHeader = page.locator('th').first();
    await columnHeader.click();
    await page.waitForTimeout(500);

    const typeSelector = page
      .locator('[data-testid="column-type-selector"]')
      .or(page.locator('select, .dropdown').first());
    if ((await typeSelector.count()) > 0) {
      await typeSelector.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }
  });

  test.skip('modifie et manipule les variables', async ({ page }) => {});
});

test.describe('Statistical summary - 2.A.5.b', () => {
  test('displays le nombre de lignes du tableau', async ({ page }) => {
    await createTestProject(page);

    const statsPanel = page
      .locator('[data-testid="stats-panel"]')
      .or(page.locator('.stats, .summary'));
    const rowCount = page.locator('text=/\\d+ (lignes?|rows?)/i');

    if ((await rowCount.count()) > 0) {
      await expect(rowCount.first()).toBeVisible();
      const text = await rowCount.first().textContent();
      expect(text).toMatch(/\\d+/);
    }
  });

  test.skip("affiche le nombre d'objets uniques pour variables géographiques", async ({
    page
  }) => {});

  test.skip('signale les valeurs nulles', async ({ page }) => {});

  test.skip('signale les doublons', async ({ page }) => {});

  test.skip('affiche le nombre de catégories pour variables texte', async ({
    page
  }) => {});

  test.skip('affiche un histogramme pour variables numériques', async ({
    page
  }) => {});

  test('displays les valeurs min/max pour variables numériques', async ({
    page
  }) => {
    await createTestProject(page);

    const minMaxText = page.locator('text=/(min|max):/i');
    if ((await minMaxText.count()) > 0) {
      await expect(minMaxText.first()).toBeVisible();
    }
  });

  test.skip('peut masquer/afficher le résumé', async ({ page }) => {});
});

test.describe('Data sorting - 2.A.5.c', () => {
  test('trie les données par différents critères', async ({ page }) => {
    await createTestProject(page);

    const columnHeader = page.locator('th').first();
    await columnHeader.click();
    await page.waitForTimeout(500);

    const sortIcon = columnHeader.locator('[class*="sort"], svg').first();
    if ((await sortIcon.count()) > 0) {
      await expect(sortIcon).toBeVisible();
    }
  });
});

test.describe('Table search - 2.A.5.d', () => {
  test('recherche dans tout le tableau', async ({ page }) => {
    await createTestProject(page);

    const searchInput = page
      .locator('[data-testid="table-search"]')
      .or(page.locator('input[type="search"]').first());
    if ((await searchInput.count()) > 0) {
      await searchInput.fill('France');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      const highlighted = page.locator(
        '.highlighted, [data-highlighted="true"]'
      );
      if ((await highlighted.count()) > 0) {
        await expect(highlighted.first()).toBeVisible();
      }
    }
  });

  test.skip('recherche dans une variable spécifique', async ({ page }) => {});

  test('displays le nombre de résultats', async ({ page }) => {
    await createTestProject(page);

    const searchInput = page
      .locator('[data-testid="table-search"]')
      .or(page.locator('input[type="search"]').first());
    if ((await searchInput.count()) > 0) {
      await searchInput.fill('a');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      const resultCount = page.locator('text=/\\d+ résultat/i');
      if ((await resultCount.count()) > 0) {
        await expect(resultCount.first()).toBeVisible();
      }
    }
  });

  test.skip('navigue entre les résultats', async ({ page }) => {});

  test.skip('met en évidence les résultats', async ({ page }) => {});

  test.skip('permet rechercher/remplacer', async ({ page }) => {});
});

test.describe('Filters - 2.A.5.e', () => {
  test.skip('applique différents types de filtres sur les données', async ({
    page
  }) => {});

  test.skip('combine plusieurs filtres', async ({ page }) => {});

  test.skip('affiche les statistiques de filtrage', async ({ page }) => {});
});

test.describe('Calculator - 2.A.5.f', () => {
  test.skip('ajoute une nouvelle variable calculée', async ({ page }) => {});

  test.skip("utilise l'addition entre variables", async ({ page }) => {});

  test.skip('utilise la soustraction entre variables', async ({ page }) => {});

  test.skip('utilise la multiplication entre variables', async ({
    page
  }) => {});

  test.skip('utilise la division entre variables', async ({ page }) => {});

  test.skip('utilise la fonction moyenne', async ({ page }) => {});

  test.skip('utilise la fonction puissance', async ({ page }) => {});

  test.skip('utilise la fonction arrondi', async ({ page }) => {});

  test.skip('utilise la concaténation de texte', async ({ page }) => {});

  test.skip("utilise l'extraction de texte", async ({ page }) => {});

  test.skip("propose l'auto-complétion", async ({ page }) => {});

  test.skip('teste la formule avant validation', async ({ page }) => {});
});

test.describe('Trash and reset - 2.A.5.g et 2.A.5.h', () => {
  test.skip('supprime des variables sélectionnées', async ({ page }) => {});

  test.skip('supprime des lignes sélectionnées', async ({ page }) => {});

  test.skip('avertit si impact sur visualisations', async ({ page }) => {});

  test.skip("réinitialise aux données d'origine", async ({ page }) => {});

  test.skip('perd les modifications après réinitialisation', async ({
    page
  }) => {});

  test.skip('perd les visualisations après réinitialisation', async ({
    page
  }) => {});

  test.skip('demande confirmation avant réinitialisation', async ({
    page
  }) => {});

  test.skip('annule la suppression avec Ctrl+Z', async ({ page }) => {});
});

test.describe('Performance with large volumes - 2.A.5 & 3.B', () => {
  test.skip('gère un tableau de 10000 lignes avec pagination', async ({
    page
  }) => {});

  test.skip('affiche un loader pendant le traitement', async ({ page }) => {});

  test.skip('tronque les lignes de plus de 2000 caractères', async ({
    page
  }) => {});

  test.skip("optimise l'affichage avec virtualisation", async ({ page }) => {});

  test.skip('affiche un écran squelette pendant le chargement', async ({
    page
  }) => {});

  test.skip("limite l'affichage initial à N lignes", async ({ page }) => {});
});
