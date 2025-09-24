import { expect, test } from '@playwright/test';
import { join } from 'node:path';

const MODAL_CONTAINER_SELECTOR = '#khartis-create-project .bx--modal-container';
const TEST_DATASET_PATH = join(process.cwd(), 'e2e', 'mocks', 'csv', 'nuts2_data.csv');

async function createTestProject(page: any, projectName: string = 'Test Project') {
  await page.goto('/');
  const modal = page.locator(MODAL_CONTAINER_SELECTOR);
  await expect(modal).toBeVisible();

  // Sélectionner l'onglet "Créer un nouveau projet"
  const createTab = modal.locator('[data-testid="tab-create-new"]');
  await createTab.click();
  await page.waitForTimeout(500);

  // Upload file
  const fileInput = modal.locator('input[type="file"]').first();
  await fileInput.setInputFiles(TEST_DATASET_PATH);

  // Set project name
  const projectNameInput = modal.locator('[data-testid="project-name-input"]');
  await projectNameInput.fill(projectName);

  // Create project
  const createButton = modal.getByRole('button', { name: 'Créer', exact: true });
  await createButton.click();

  // Wait for modal to close
  await expect(modal).toBeHidden();
}

test.describe('Navigation principale - 4.A', () => {
  test('navigue entre les 3 étapes principales', async ({ page }) => {
    await createTestProject(page, 'Test Navigation');

    // Vérifier qu'on est sur l'étape Données par défaut
    await expect(page.locator('[data-testid="step-data"]')).toHaveAttribute('aria-pressed', 'true');

    // Naviguer vers Visualisations
    await page.locator('[data-testid="step-visualizations"]').click();
    await expect(page.locator('[data-testid="step-visualizations"]')).toHaveAttribute('aria-pressed', 'true');

    // Naviguer vers Habillage
    await page.locator('[data-testid="step-styling"]').click();
    await expect(page.locator('[data-testid="step-styling"]')).toHaveAttribute('aria-pressed', 'true');

    // Retourner vers Données
    await page.locator('[data-testid="step-data"]').click();
    await expect(page.locator('[data-testid="step-data"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('accède à l\'étape Données', async ({ page }) => {
    await createTestProject(page, 'Test Données');

    // Naviguer vers une autre étape
    await page.locator('[data-testid="step-visualizations"]').click();

    // Retourner à Données
    await page.locator('[data-testid="step-data"]').click();
    await expect(page.locator('[data-testid="step-data"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('accède à l\'étape Visualisations', async ({ page }) => {
    await createTestProject(page, 'Test Visualisations');

    // Naviguer vers Visualisations
    await page.locator('[data-testid="step-visualizations"]').click();
    await expect(page.locator('[data-testid="step-visualizations"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('accède à l\'étape Habillage', async ({ page }) => {
    await createTestProject(page, 'Test Habillage');

    // Naviguer vers Habillage
    await page.locator('[data-testid="step-styling"]').click();
    await expect(page.locator('[data-testid="step-styling"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('navigue librement sans ordre imposé', async ({ page }) => {
    await createTestProject(page, 'Test Navigation Libre');

    // Aller directement à Habillage depuis Données
    await page.locator('[data-testid="step-styling"]').click();
    await expect(page.locator('[data-testid="step-styling"]')).toHaveAttribute('aria-pressed', 'true');

    // Aller à Visualisations depuis Habillage
    await page.locator('[data-testid="step-visualizations"]').click();
    await expect(page.locator('[data-testid="step-visualizations"]')).toHaveAttribute('aria-pressed', 'true');

    // Retourner à Habillage
    await page.locator('[data-testid="step-styling"]').click();
    await expect(page.locator('[data-testid="step-styling"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('conserve l\'état entre les navigations', async ({ page }) => {
    const projectName = 'Test Persistance État';
    await createTestProject(page, projectName);

    // Vérifier que le nom du projet est affiché
    await expect(page.locator('[data-testid="project-title"] input')).toHaveValue(projectName);

    // Naviguer entre les étapes
    await page.locator('[data-testid="step-visualizations"]').click();
    await expect(page.locator('[data-testid="project-title"] input')).toHaveValue(projectName);

    await page.locator('[data-testid="step-styling"]').click();
    await expect(page.locator('[data-testid="project-title"] input')).toHaveValue(projectName);

    await page.locator('[data-testid="step-data"]').click();
    await expect(page.locator('[data-testid="project-title"] input')).toHaveValue(projectName);
  });

  test.skip('affiche le fil d\'Ariane', async ({ page }) => {});

  test.skip('utilise les raccourcis du fil d\'Ariane', async ({ page }) => {});
});

test.describe('Interface - 4.C', () => {
  test('affiche l\'en-tête avec menu principal', async ({ page }) => {
    await createTestProject(page, 'Test Interface');

    // Attendre un peu que la page se charge complètement
    await page.waitForTimeout(1000);

    // Vérifier que l'en-tête est visible
    const header = page.locator('#khartis-header .bx--header').first();
    await expect(header).toBeVisible();

    // Vérifier que le bouton de menu est présent
    await expect(page.locator('.bx--header__menu-trigger').first()).toBeVisible();
  });

  test('affiche le nom du projet en cours', async ({ page }) => {
    const projectName = 'Mon Super Projet';
    await createTestProject(page, projectName);

    // Vérifier que le nom est affiché dans l'en-tête
    await expect(page.locator('[data-testid="project-title"] input')).toHaveValue(projectName);
  });

  test.skip('accède à l\'aide depuis l\'en-tête', async ({ page }) => {});

  test.skip('accède au téléchargement depuis l\'en-tête', async ({ page }) => {});

  test.skip('affiche la barre d\'outils à gauche (desktop)', async ({ page }) => {});

  test.skip('affiche la barre d\'outils en bas (mobile)', async ({ page }) => {});

  test.skip('affiche le panneau latéral par défaut', async ({ page }) => {});

  test.skip('masque/affiche le panneau latéral', async ({ page }) => {});

  test.skip('redimensionne le panneau latéral', async ({ page }) => {});

  test.skip('affiche les onglets données/visualisations', async ({ page }) => {});

  test.skip('déploie les panneaux déportés', async ({ page }) => {});

  test.skip('affiche la visionneuse au centre', async ({ page }) => {});

  test.skip('zoom sur la page et la carte', async ({ page }) => {});

  test.skip('affiche les infobulles fixes', async ({ page }) => {});

  test.skip('ouvre des fenêtres modales', async ({ page }) => {});
});

test.describe('Exemples introductifs - 2.F', () => {
  test.skip('affiche les exemples sur la page d\'accueil', async ({ page }) => {});

  test.skip('présente avec des vignettes', async ({ page }) => {});

  test.skip('filtre les exemples par critères', async ({ page }) => {});

  test.skip('charge un exemple au clic', async ({ page }) => {});

  test.skip('utilise différents types de données', async ({ page }) => {});

  test.skip('utilise différents fonds de carte', async ({ page }) => {});

  test.skip('montre diverses visualisations', async ({ page }) => {});
});