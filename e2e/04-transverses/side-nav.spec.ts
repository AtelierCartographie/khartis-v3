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

test.describe('Menu latéral (Side Navigation)', () => {
  test('ouvre le menu latéral avec le bouton hamburger', async ({ page }) => {
    await createTestProject(page, 'Test Side Nav');

    // Vérifier que le bouton hamburger est visible
    const hamburgerButton = page.locator('.bx--header__menu-trigger');
    await expect(hamburgerButton).toBeVisible();

    // Cliquer sur le bouton hamburger
    await hamburgerButton.click();
    await page.waitForTimeout(500);

    // Vérifier que le menu latéral est ouvert
    const sideNav = page.locator('#khartis-side-nav .bx--side-nav');
    await expect(sideNav).toBeVisible();
  });

  test('affiche les options de projet dans le menu', async ({ page }) => {
    await createTestProject(page, 'Test Menu Options');

    const hamburgerButton = page.locator('.bx--header__menu-trigger');
    await hamburgerButton.click();
    await page.waitForTimeout(500);

    // Vérifier les options de projet
    await expect(page.getByText('Nouveau projet')).toBeVisible();
    await expect(page.getByText('Dupliquer le projet')).toBeVisible();
    await expect(page.getByText('Ouvrir un projet')).toBeVisible();
  });

  test("affiche les liens d'aide et documentation", async ({ page }) => {
    await createTestProject(page, 'Test Help Links');

    const hamburgerButton = page.locator('.bx--header__menu-trigger');
    await hamburgerButton.click();
    await page.waitForTimeout(500);

    // Vérifier les liens d'aide
    await expect(page.getByText('Documentation')).toBeVisible();
    await expect(page.getByText('Signaler un bug')).toBeVisible();
    await expect(page.getByText('Suggérer une fonctionnalité')).toBeVisible();
  });

  test('permet de changer la langue', async ({ page }) => {
    await createTestProject(page, 'Test Language');

    const hamburgerButton = page.locator('.bx--header__menu-trigger');
    await hamburgerButton.click();
    await page.waitForTimeout(500);

    // Trouver le sélecteur de langue
    const languageSelector = page.locator('#khartis-side-nav select').first();
    await expect(languageSelector).toBeVisible();

    // Vérifier que les options FR et EN sont disponibles
    const frOption = languageSelector.locator('option[value="fr"]');
    const enOption = languageSelector.locator('option[value="en"]');
    await expect(frOption).toBeVisible();
    await expect(enOption).toBeVisible();
  });

  test('permet de basculer entre thème clair et sombre', async ({ page }) => {
    await createTestProject(page, 'Test Theme');

    const hamburgerButton = page.locator('.bx--header__menu-trigger');
    await hamburgerButton.click();
    await page.waitForTimeout(500);

    // Trouver le toggle de thème
    const themeToggle = page.locator('.bx--toggle');
    await expect(themeToggle).toBeVisible();

    // Cliquer sur le toggle pour changer de thème
    await themeToggle.click();
    await page.waitForTimeout(500);

    // Vérifier que le thème a changé (la classe g100 devrait être appliquée au body)
    const hasThemeClass = await page.evaluate(() => {
      return (
        document.documentElement.classList.contains('g100') ||
        document.documentElement.classList.contains('white')
      );
    });
    expect(hasThemeClass).toBeTruthy();
  });

  test("ferme le menu en cliquant à l'extérieur", async ({ page }) => {
    await createTestProject(page, 'Test Close Outside');

    const hamburgerButton = page.locator('.bx--header__menu-trigger');
    await hamburgerButton.click();
    await page.waitForTimeout(500);

    // Vérifier que le menu est ouvert
    const sideNav = page.locator('#khartis-side-nav .bx--side-nav');
    await expect(sideNav).toBeVisible();

    // Cliquer en dehors du menu
    await page.locator('body').click({ position: { x: 500, y: 200 } });
    await page.waitForTimeout(500);

    // Vérifier que le menu est fermé
    await expect(sideNav).not.toBeVisible();
  });

  test('ouvre un nouveau projet depuis le menu', async ({ page }) => {
    await createTestProject(page, 'Test New From Menu');

    const hamburgerButton = page.locator('.bx--header__menu-trigger');
    await hamburgerButton.click();
    await page.waitForTimeout(500);

    // Cliquer sur "Nouveau projet"
    await page.getByText('Nouveau projet').click();
    await page.waitForTimeout(500);

    // Vérifier que la modal de création est ouverte
    const modal = page.locator(MODAL_CONTAINER_SELECTOR);
    await expect(modal).toBeVisible();

    // Vérifier qu'on est sur l'onglet de création
    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await expect(createTab).toHaveAttribute('aria-pressed', 'true');
  });

  test('ouvre la modal de duplication depuis le menu', async ({ page }) => {
    await createTestProject(page, 'Test Duplicate From Menu');

    const hamburgerButton = page.locator('.bx--header__menu-trigger');
    await hamburgerButton.click();
    await page.waitForTimeout(500);

    // Cliquer sur "Dupliquer le projet"
    await page.getByText('Dupliquer le projet').click();
    await page.waitForTimeout(500);

    // Vérifier que la modal de duplication est ouverte
    const duplicateModal = page.locator('.bx--modal[aria-label*="Dupliquer"]');
    await expect(duplicateModal).toBeVisible();
  });
});
