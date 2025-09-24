import { expect, test } from '@playwright/test';
import { join } from 'node:path';

const MODAL_CONTAINER_SELECTOR = '#khartis-create-project .bx--modal-container';
const DATASET_PATH = join(process.cwd(), 'e2e', 'mocks', 'csv');

test.describe('Import de données tabulaires - 2.A.1', () => {
  test('importe un fichier CSV depuis l\'appareil', async ({ page }) => {
    const csvPath = join(DATASET_PATH, 'nuts2_data.csv');

    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    // Sélectionner l'onglet "Créer un nouveau projet" d'abord
    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();
    await page.waitForTimeout(500);

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(csvPath);

    // Vérifier que le fichier est affiché
    await expect(modal.locator('.bx--file-filename').first()).toContainText('nuts2_data.csv');
  });

  test.skip('importe un fichier CSV via une URL', async () => {});

  test.skip('importe des données par copier-coller', async () => {});

  test('reconnaît les noms de lieux dans les données', async ({ page }) => {
    const csvPath = join(DATASET_PATH, 'nuts2_data.csv');

    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    // Sélectionner l'onglet "Créer un nouveau projet" d'abord
    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();
    await page.waitForTimeout(500);

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(csvPath);

    // Remplir le nom du projet pour créer
    const projectNameInput = modal.locator('[data-testid="project-name-input"]');
    await projectNameInput.fill('Test Import');

    const createButton = modal.getByRole('button', { name: 'Créer', exact: true });
    await createButton.click();

    // Vérifier que la modal se ferme
    await expect(modal).toBeHidden();

    // TODO: Vérifier la détection des entités géographiques dans le tableau
  });

  test.skip('reconnaît les codes géographiques ISO3', async () => {});

  test.skip('reconnaît les coordonnées latitude/longitude', async () => {});

  test.skip('affiche une erreur pour un format invalide', async () => {});

  test.skip('gère les fichiers volumineux (>10MB)', async () => {});
});

test.describe('Import de données géographiques - 2.A.2', () => {
  test.skip('importe un fichier Shapefile complet (.shp, .dbf, .shx, .prj)', async () => {});

  test.skip('gère l\'import multi-fichiers Shapefile par drag & drop', async () => {});

  test.skip('vérifie la projection du Shapefile importé', async () => {});

  test('importe un fichier GeoJSON', async ({ page }) => {
    const geoJsonPath = join(process.cwd(), 'e2e', 'mocks', 'spatial', 'nuts2_data.geojson');

    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    // Sélectionner l'onglet "Créer un nouveau projet" d'abord
    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();
    await page.waitForTimeout(500);

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(geoJsonPath);

    // Vérifier que le fichier est affiché
    await expect(modal.locator('.bx--file-filename').first()).toContainText('nuts2_data.geojson');
  });

  test.skip('importe un fichier GeoPackage', async () => {});

  test.skip('gère les différentes couches d\'un GeoPackage', async () => {});

  test.skip('importe un fichier géographique via URL', async () => {});

  test.skip('utilise le fichier comme fond de carte', async () => {});

  test.skip('utilise le fichier pour des visualisations', async () => {});

  test.skip('détecte automatiquement le type de géométrie (point, ligne, polygone)', async () => {});

  test.skip('affiche un aperçu de la géométrie importée', async () => {});
});

test.describe('Création de jeux de données - 2.A.3', () => {
  test.skip('crée un jeu de données après import', async () => {});

  test.skip('nomme le jeu avec le nom du fichier', async () => {});

  test.skip('nomme "Tableau collé" pour un copier-coller', async () => {});

  test.skip('permet de renommer un jeu de données', async () => {});

  test.skip('permet de dupliquer un jeu de données', async () => {});

  test.skip('permet de supprimer un jeu de données', async () => {});

  test.skip('permet plusieurs imports successifs', async () => {});
});

test.describe('Typage des variables - 2.A.4', () => {
  test.skip('détecte automatiquement le type texte', async () => {});

  test.skip('détecte automatiquement le type numérique', async () => {});

  test.skip('détecte le sous-type géographique', async () => {});

  test.skip('détecte les codes ISO', async () => {});

  test.skip('détecte les coordonnées géographiques', async () => {});

  test.skip('permet de changer manuellement le type', async () => {});

  test.skip('affiche une icône distincte par type', async () => {});
});

test.describe('Enrichissement de fichier géographique - 2.A.8', () => {
  test.skip('importe des données tabulaires pour enrichir un fichier géographique', async () => {});

  test.skip('affiche l\'aperçu du tableau importé pour enrichissement', async () => {});

  test.skip('sélectionne les variables communes pour la jointure', async () => {});

  test.skip('utilise le module de jointure assistée pour l\'enrichissement', async () => {});

  test.skip('affiche les catégories de jointure (jointes, à vérifier, non uniques, non reconnues)', async () => {});

  test.skip('permet de corriger les identifiants non reconnus', async () => {});

  test.skip('affiche les données jointes dans l\'aperçu du tableau', async () => {});

  test.skip('gère les erreurs de jointure avec messages explicites', async () => {});
});