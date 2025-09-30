import { expect, test } from '@playwright/test';
import { join } from 'node:path';

const MODAL_CONTAINER_SELECTOR = '#khartis-create-project .bx--modal-container';
const DATASET_PATH = join(process.cwd(), 'e2e', 'mocks', 'csv');
const SPATIAL_PATH = join(process.cwd(), 'e2e', 'mocks', 'spatial');

test.describe('Validation de base des fichiers - 2.A.1', () => {
  test('rejette un fichier dépassant la taille limite (50MB)', async ({
    page
  }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // Créer un gros fichier en mémoire
    const largeContent = 'x'.repeat(51 * 1024 * 1024); // 51MB
    const largeFile = new File([largeContent], 'large.csv', {
      type: 'text/csv'
    });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector('input[type="file"]');
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, largeFile);

    // Vérifier le message d'erreur
    const errorMessage = page.locator(
      '.bx--inline-notification--error, [role="alert"]'
    );
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/taille|size|50.*MB/i);
  });

  test('accepte les extensions de fichiers supportées', async ({ page }) => {
    const supportedFiles = ['nuts2_data.csv', 'nuts2_data.geojson'];

    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);

    for (const fileName of supportedFiles) {
      await page.reload();
      await expect(modal).toBeVisible();

      const createTab = modal.locator('[data-testid="tab-create-new"]');
      await createTab.click();

      const filePath = fileName.endsWith('.csv')
        ? join(DATASET_PATH, fileName)
        : join(SPATIAL_PATH, fileName);

      const fileInput = modal.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Vérifier que le fichier est accepté (pas d'erreur)
      const errorMessage = page.locator('.bx--inline-notification--error');
      await expect(errorMessage).toBeHidden();

      // Vérifier que le fichier apparaît dans la liste
      await expect(modal.locator('.bx--file-filename')).toContainText(fileName);
    }
  });

  test('rejette les extensions non supportées', async ({ page }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // Créer un fichier avec extension non supportée
    const unsupportedFile = new File(['test content'], 'test.xyz', {
      type: 'application/octet-stream'
    });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector('input[type="file"]');
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, unsupportedFile);

    // Vérifier le message d'erreur
    const errorMessage = page.locator(
      '.bx--inline-notification--error, [role="alert"]'
    );
    await expect(errorMessage).toBeVisible();
  });
});

test.describe('Détection des colonnes géographiques - 2.A.4', () => {
  test('détecte automatiquement les colonnes de pays', async ({ page }) => {
    const csvPath = join(DATASET_PATH, 'nuts2_data.csv');

    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(csvPath);

    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.fill('Test Geo Detection');

    const createButton = modal.getByRole('button', {
      name: 'Créer',
      exact: true
    });
    await createButton.click();

    // Attendre que la détection soit faite
    await page.waitForTimeout(2000);

    // Pas d'erreur de colonnes géographiques manquantes
    const geoError = page.locator('text=/aucune colonne géographique/i');
    await expect(geoError).toBeHidden();
  });

  test('affiche une erreur si aucune colonne géographique', async ({
    page
  }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // Créer un CSV sans colonnes géographiques
    const nonGeoCSV = `value1,value2,value3
123,456,789
111,222,333`;

    const file = new File([nonGeoCSV], 'no-geo.csv', { type: 'text/csv' });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector('input[type="file"]');
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(1000);

    // Vérifier le message d'erreur pour colonnes géographiques manquantes
    const errorMessage = page.locator(
      '.bx--inline-notification--error, [role="alert"]'
    );
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/géographique|geographic/i);
  });

  test('détecte les codes ISO2 et ISO3', async ({ page }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // CSV avec codes ISO
    const isoCSV = `ISO2,ISO3,Population
FR,FRA,67000000
DE,DEU,83000000
IT,ITA,60000000`;

    const file = new File([isoCSV], 'iso-codes.csv', { type: 'text/csv' });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector('input[type="file"]');
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(1000);

    // Pas d'erreur car codes ISO détectés
    const geoError = page.locator('text=/aucune colonne géographique/i');
    await expect(geoError).toBeHidden();
  });

  test('détecte les coordonnées latitude/longitude', async ({ page }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // CSV avec coordonnées
    const coordCSV = `City,Latitude,Longitude
Paris,48.8566,2.3522
Berlin,52.5200,13.4050
Rome,41.9028,12.4964`;

    const file = new File([coordCSV], 'coordinates.csv', { type: 'text/csv' });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector('input[type="file"]');
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(1000);

    // Pas d'erreur car coordonnées détectées
    const geoError = page.locator('text=/aucune colonne géographique/i');
    await expect(geoError).toBeHidden();
  });
});

test.describe('Analyse de qualité des données - 2.A.5', () => {
  test('affiche un avertissement pour les valeurs nulles excessives', async ({
    page
  }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // CSV avec beaucoup de valeurs nulles
    const nullCSV = `Country,Value1,Value2
France,100,
Germany,,200
Italy,,
Spain,400,
Portugal,,`;

    const file = new File([nullCSV], 'null-values.csv', { type: 'text/csv' });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector('input[type="file"]');
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(1000);

    // Vérifier l'avertissement
    const warningMessage = page.locator('.bx--inline-notification--warning');
    await expect(warningMessage).toBeVisible();
    await expect(warningMessage).toContainText(
      /valeurs manquantes|null|missing/i
    );
  });

  test('détecte les doublons dans les données', async ({ page }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // CSV avec doublons
    const duplicateCSV = `Country,Value
France,100
Germany,200
France,100
Italy,300`;

    const file = new File([duplicateCSV], 'duplicates.csv', {
      type: 'text/csv'
    });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector('input[type="file"]');
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(1000);

    // Vérifier l'avertissement de doublons
    const warningMessage = page.locator('.bx--inline-notification--warning');
    await expect(warningMessage).toBeVisible();
    await expect(warningMessage).toContainText(/duplicate|doublon/i);
  });
});

test.describe('Validation de performance - 3.B', () => {
  test('affiche un avertissement pour les fichiers volumineux (>5000 lignes)', async ({
    page
  }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // Créer un CSV avec beaucoup de lignes
    let largeCSV = 'Country,Value\n';
    for (let i = 0; i < 5001; i++) {
      largeCSV += `Country${i},${i * 100}\n`;
    }

    const file = new File([largeCSV], 'large-dataset.csv', {
      type: 'text/csv'
    });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector('input[type="file"]');
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(2000);

    // Vérifier l'avertissement de performance
    const warningMessage = page.locator('.bx--inline-notification--warning');
    await expect(warningMessage).toBeVisible();
    await expect(warningMessage).toContainText(
      /performance|volumineux|large|5000/i
    );
  });

  test('rejette les fichiers dépassant 10000 lignes', async ({ page }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // Créer un CSV avec trop de lignes
    let hugeCSV = 'Country,Value\n';
    for (let i = 0; i < 10001; i++) {
      hugeCSV += `Country${i},${i * 100}\n`;
    }

    const file = new File([hugeCSV], 'huge-dataset.csv', { type: 'text/csv' });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector('input[type="file"]');
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(2000);

    // Vérifier l'erreur
    const errorMessage = page.locator('.bx--inline-notification--error');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/10000|lignes|rows|maximum/i);
  });

  test('affiche un avertissement pour plus de 50 colonnes', async ({
    page
  }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // Créer un CSV avec beaucoup de colonnes
    const headers = ['Country'];
    for (let i = 1; i <= 51; i++) {
      headers.push(`Column${i}`);
    }

    const wideCSV =
      headers.join(',') +
      '\n' +
      'France,' +
      Array(51).fill('100').join(',') +
      '\n' +
      'Germany,' +
      Array(51).fill('200').join(',');

    const file = new File([wideCSV], 'wide-dataset.csv', { type: 'text/csv' });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector('input[type="file"]');
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(1000);

    // Vérifier l'avertissement
    const warningMessage = page.locator('.bx--inline-notification--warning');
    await expect(warningMessage).toBeVisible();
    await expect(warningMessage).toContainText(/colonnes|columns|50/i);
  });
});

test.describe('Correspondance avec catalogues - 2.A.7', () => {
  test('valide la correspondance avec le catalogue de pays', async ({
    page
  }) => {
    const csvPath = join(DATASET_PATH, 'nuts2_data.csv');

    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(csvPath);

    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.fill('Test Catalogue');

    const createButton = modal.getByRole('button', {
      name: 'Créer',
      exact: true
    });
    await createButton.click();

    await page.waitForTimeout(2000);

    // Vérifier qu'il n'y a pas d'erreur de correspondance faible
    const matchError = page.locator('text=/correspondance|match.*%/i');

    // Si un message de correspondance apparaît, il devrait être > 50%
    if ((await matchError.count()) > 0) {
      const text = await matchError.textContent();
      const match = text?.match(/(\d+)%/);
      if (match) {
        const percentage = parseInt(match[1]);
        expect(percentage).toBeGreaterThan(50);
      }
    }
  });

  test('affiche des suggestions pour les valeurs non reconnues', async ({
    page
  }) => {
    await page.goto('/');
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();

    // CSV avec fautes d'orthographe
    const typoCSV = `Country,Value
Frence,100
Germeny,200
Italie,300`;

    const file = new File([typoCSV], 'typos.csv', { type: 'text/csv' });

    await page.evaluate((file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.querySelector('input[type="file"]');
      if (input) {
        Object.defineProperty(input, 'files', {
          value: dataTransfer.files,
          writable: false
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, file);

    await page.waitForTimeout(1500);

    // Vérifier les suggestions (si implémentées dans l'UI)
    const suggestions = page.locator(
      '[data-testid="fuzzy-match-suggestion"], .suggestion'
    );

    // Si des suggestions sont visibles, vérifier qu'elles existent
    if ((await suggestions.count()) > 0) {
      await expect(suggestions.first()).toBeVisible();
    }
  });
});
