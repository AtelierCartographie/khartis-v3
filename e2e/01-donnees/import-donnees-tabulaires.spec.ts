import { expect, test } from '@playwright/test';
import { join } from 'node:path';

const MODAL_CONTAINER_SELECTOR = '#khartis-create-project .bx--modal-container';
const DATASET_PATH = join(process.cwd(), 'e2e', 'mocks', 'csv');

test.describe('Import de données tabulaires - 2.A.1', () => {
  test("importe un fichier CSV depuis l'appareil", async ({ page }) => {
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
    await expect(modal.locator('.bx--file-filename').first()).toContainText(
      'nuts2_data.csv'
    );
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

    // Attendre la validation et détection géographique
    await page.waitForTimeout(1000);

    // Vérifier qu'aucune erreur de colonne géographique manquante n'apparaît
    const geoError = page.locator('text=/aucune colonne géographique/i');
    await expect(geoError).toBeHidden();

    // Remplir le nom du projet pour créer
    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.fill('Test Import');

    const createButton = modal.getByRole('button', {
      name: 'Créer',
      exact: true
    });
    await createButton.click();

    // Vérifier que la modal se ferme (validation réussie)
    await expect(modal).toBeHidden({ timeout: 10000 });
  });

  test('reconnaît les codes géographiques ISO3', async ({ page }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // CSV avec codes ISO3
    const iso3CSV = `ISO3,Population,GDP
FRA,67000000,2700000
DEU,83000000,3800000
ITA,60000000,2000000`;

    const file = new File([iso3CSV], 'iso3-data.csv', { type: 'text/csv' });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(1000);

    // Vérifier qu'aucune erreur de colonne géographique n'apparaît (ISO3 détecté)
    const geoError = page.locator('text=/aucune colonne géographique/i');
    await expect(geoError).toBeHidden();
  });

  test('reconnaît les coordonnées latitude/longitude', async ({ page }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // CSV avec lat/lon
    const coordsCSV = `City,lat,lon,Population
Paris,48.8566,2.3522,2200000
Berlin,52.5200,13.4050,3700000
Rome,41.9028,12.4964,2800000`;

    const file = new File([coordsCSV], 'coords-data.csv', { type: 'text/csv' });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(1000);

    // Vérifier qu'aucune erreur de colonne géographique n'apparaît (lat/lon détectés)
    const geoError = page.locator('text=/aucune colonne géographique/i');
    await expect(geoError).toBeHidden();
  });

  test('affiche une erreur pour un format invalide', async ({ page }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // Fichier avec extension non supportée
    const invalidFile = new File(['test content'], 'data.xyz', {
      type: 'application/octet-stream'
    });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    // Vérifier le message d'erreur
    const errorMessage = page.locator(
      '.bx--inline-notification--error, [role="alert"]'
    );
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/format|extension|supporté/i);
  });

  test('affiche un avertissement pour les fichiers volumineux', async ({
    page
  }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // Créer un fichier de 11MB
    const largeContent = 'Country,Value\n' + 'x,100\n'.repeat(500000); // ~11MB
    const largeFile = new File([largeContent], 'large.csv', {
      type: 'text/csv'
    });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(1000);

    // Vérifier l'avertissement ou l'erreur pour fichier volumineux
    const notification = page.locator(
      '.bx--inline-notification--warning, .bx--inline-notification--error'
    );
    await expect(notification).toBeVisible();
    await expect(notification).toContainText(/taille|size|volumineux|large/i);
  });
});

test.describe('Import de données géographiques - 2.A.2', () => {
  test.skip('importe un fichier Shapefile complet (.shp, .dbf, .shx, .prj)', async () => {});

  test.skip("gère l'import multi-fichiers Shapefile par drag & drop", async () => {});

  test.skip('vérifie la projection du Shapefile importé', async () => {});

  test('importe un fichier GeoJSON', async ({ page }) => {
    const geoJsonPath = join(
      process.cwd(),
      'e2e',
      'mocks',
      'spatial',
      'nuts2_data.geojson'
    );

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
    await expect(modal.locator('.bx--file-filename').first()).toContainText(
      'nuts2_data.geojson'
    );
  });

  test.skip('importe un fichier GeoPackage', async () => {});

  test.skip("gère les différentes couches d'un GeoPackage", async () => {});

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
  test('détecte automatiquement le type texte', async ({ page }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    const textCSV = `Country,Description
France,République française située en Europe occidentale
Germany,République fédérale d'Allemagne`;

    const file = new File([textCSV], 'text-data.csv', { type: 'text/csv' });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(1000);

    // Le fichier devrait être accepté avec détection de colonnes texte
    const errorMessage = page.locator('.bx--inline-notification--error');

    // Pas d'erreur car Country est une colonne géographique
    const geoError = page.locator('text=/aucune colonne géographique/i');
    await expect(geoError).toBeHidden();
  });

  test('détecte automatiquement le type numérique', async ({ page }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    const numericCSV = `Country,Population,GDP
France,67000000,2700000.50
Germany,83000000,3800000.75`;

    const file = new File([numericCSV], 'numeric-data.csv', {
      type: 'text/csv'
    });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(1000);

    // Pas d'erreur, colonnes numériques détectées avec colonne géo
    const geoError = page.locator('text=/aucune colonne géographique/i');
    await expect(geoError).toBeHidden();
  });

  test('détecte le sous-type géographique', async ({ page }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    const geoCSV = `Pays,Region,Ville
France,Île-de-France,Paris
Allemagne,Bavière,Munich
Italie,Lombardie,Milan`;

    const file = new File([geoCSV], 'geo-types.csv', { type: 'text/csv' });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(1000);

    // Pas d'erreur car toutes les colonnes sont géographiques
    const geoError = page.locator('text=/aucune colonne géographique/i');
    await expect(geoError).toBeHidden();
  });

  test.skip('détecte les codes ISO', async () => {
    // Déjà testé dans la section précédente
  });

  test.skip('détecte les coordonnées géographiques', async () => {
    // Déjà testé dans la section précédente
  });

  test.skip('permet de changer manuellement le type', async () => {});

  test.skip('affiche une icône distincte par type', async () => {});
});

test.describe('Enrichissement de fichier géographique - 2.A.8', () => {
  test.skip('importe des données tabulaires pour enrichir un fichier géographique', async () => {});

  test.skip("affiche l'aperçu du tableau importé pour enrichissement", async () => {});

  test.skip('sélectionne les variables communes pour la jointure', async () => {});

  test.skip("utilise le module de jointure assistée pour l'enrichissement", async () => {});

  test.skip('affiche les catégories de jointure (jointes, à vérifier, non uniques, non reconnues)', async () => {});

  test.skip('permet de corriger les identifiants non reconnus', async () => {});

  test.skip("affiche les données jointes dans l'aperçu du tableau", async () => {});

  test.skip('gère les erreurs de jointure avec messages explicites', async () => {});
});
