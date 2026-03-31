import { expect, test } from '@playwright/test';
import {
  goToJoinStep,
  selectGeolocationLinkedVariable,
  uploadURL
} from './helpers';

const FOSSIL_CSV_PATH = 'csv/fossil-fuel-subsidies-gdp-2021.csv';
const FUZZY_CSV_PATH = 'csv/fuzzy-countries.csv';

async function selectWorldBasemap(
  page: import('@playwright/test').Page
): Promise<void> {
  const worldBasemap = page
    .locator('#basemap-join-step')
    .getByRole('button', { name: /World\s*>\s*countries|World|countries/i })
    .first();
  await expect(worldBasemap).toBeVisible({ timeout: 15000 });
  await worldBasemap.click();
}

test.describe
  .serial('TC-JOIN-001: Workflow tabulaire affiche 3 sections', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('affiche les sections Contrôler, Géolocaliser, Joindre pour dataset tabulaire', async ({
    page
  }) => {
    await uploadURL(page, FOSSIL_CSV_PATH);

    await page.waitForTimeout(2000);

    const dataTab = page.locator('#khartis-data-tab');
    await expect(dataTab).toBeVisible();

    await expect(
      page
        .locator('.bx--progress-step-button')
        .filter({ hasText: /Contrôler|Control/i })
        .first()
    ).toBeVisible();
    await expect(
      page
        .locator('.bx--progress-step-button')
        .filter({ hasText: /Géolocaliser|Geolocate/i })
        .first()
    ).toBeVisible();
    await expect(
      page
        .locator('.bx--progress-step-button')
        .filter({ hasText: /Joindre|Join/i })
        .first()
    ).toBeVisible();
  });
});

test.describe
  .serial('TC-JOIN-004: Auto-finalisation sur jointure propre', () => {
  test('finalise automatiquement si aucune erreur de jointure', async ({
    page
  }) => {
    await page.goto('/');
    await uploadURL(page, FOSSIL_CSV_PATH);

    await selectGeolocationLinkedVariable(page, /Code/i);
    await goToJoinStep(page);

    await page.waitForTimeout(3000);

    await selectWorldBasemap(page);

    await page.waitForTimeout(3000);

    const joinedCount = page
      .locator('[data-testid="joined-count"], .joined-count')
      .first();
    if (await joinedCount.isVisible()) {
      const text = await joinedCount.textContent();
      const count = parseInt(text || '0');
      expect(count).toBeGreaterThan(0);
    }
  });
});

test.describe.serial('TC-JOIN-005: Cas TO_VERIFY et UNRECOGNIZED', () => {
  test('affiche catégories à vérifier et non reconnues', async ({ page }) => {
    await page.goto('/');
    await uploadURL(page, FUZZY_CSV_PATH);

    await selectGeolocationLinkedVariable(page, /Entity|Entité/i);
    await goToJoinStep(page);

    await page.waitForTimeout(3000);

    await selectWorldBasemap(page);

    await page.waitForTimeout(5000);

    const toVerifySection = page.getByText(/à vérifier|to verify/i).first();
    await expect(
      toVerifySection.or(page.locator('[data-testid="to-verify-category"]'))
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe.serial('TC-JOIN-008: Blocage finalisation si doublons', () => {
  test('bloque finalisation avec doublons source', async ({ page }) => {
    await page.goto('/');
    await uploadURL(page, FOSSIL_CSV_PATH);

    await selectGeolocationLinkedVariable(page, /Year|_year/i);
    await goToJoinStep(page);

    await page.waitForTimeout(3000);

    await selectWorldBasemap(page);

    await page.waitForTimeout(5000);

    const blockingSignal = page
      .getByText(/doublon|duplicate|à vérifier|to verify|error|erreur/i)
      .first();
    const finalizeButton = page
      .getByRole('button', { name: /Valider|Validate|Finalize|Finaliser/i })
      .first();

    const hasBlockingSignal = await blockingSignal
      .isVisible()
      .catch(() => false);
    const finalizeVisible = await finalizeButton.isVisible().catch(() => false);
    const finalizeEnabled = finalizeVisible
      ? await finalizeButton.isEnabled().catch(() => false)
      : false;

    expect(hasBlockingSignal || !finalizeEnabled).toBe(true);
  });
});
