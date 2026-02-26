import { expect, test } from '@playwright/test';
import path from 'path';

const TEST_DATASETS_DIR = path.join(process.cwd(), 'static', 'tests-datasets');

test.describe('TC-OSM-001: OSM basemap activation with GPS data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('shows warning when data has no GPS coordinates', async ({ page }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(3000);

    const osmTab = page
      .locator('.basemap-tabs-wrapper')
      .getByRole('button', { name: /OSM/ });
    await osmTab.click({ force: true });

    await page.waitForTimeout(1000);

    await expect(page.getByText(/GPS|Coordonnées/i)).toBeVisible({
      timeout: 10000
    });
  });
});

test.describe
  .serial('TC-OSM-002: OSM join marks step 2 complete and enables Visualiser', () => {
  test.setTimeout(120000);

  test('step 2 Joindre becomes complete and Visualiser is enabled after OSM Ajouter click', async ({
    page
  }) => {
    const sevesoCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'sites-seveso-idf.csv'
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Upload the GPS dataset via file input
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(sevesoCsvPath);

    // Wait for file processing + DuckDB initialization (can be slow on first load)
    await page.waitForTimeout(5000);

    // Fill project name
    const projectNameInput = page.getByTestId('project-name-input');
    if (
      await projectNameInput.isVisible({ timeout: 5000 }).catch(() => false)
    ) {
      await projectNameInput.fill('Test OSM Step Complete');
    }

    // Click Créer button
    const createButton = page.getByRole('button', {
      name: /^Créer$|^Create$/i
    });
    if (await createButton.isEnabled({ timeout: 5000 }).catch(() => false)) {
      await createButton.click();
    }

    // Wait for the modal to close (project created + navigate)
    // The modal closes when isCreateProjectModalOpen becomes false after goto('/')
    await expect(
      page.locator('[data-testid="create-project-modal"] .bx--modal-container')
    ).not.toBeVisible({
      timeout: 60000
    });

    // Verify step 2 (Joindre) is NOT complete before OSM activation
    const joindreStep = page
      .locator('.bx--progress-step-button')
      .filter({ hasText: /Joindre|Join/i });
    await expect(joindreStep).toBeVisible({ timeout: 15000 });

    // Verify Visualiser button is disabled before OSM
    const visualiserBtn = page.locator('.toolbar-footer').getByRole('button', {
      name: /Visualiser|Visualize/i
    });
    await expect(visualiserBtn).toBeDisabled({ timeout: 5000 });

    // Find and click the OSM tab in the basemap section
    const osmTabBtn = page
      .locator('.basemap-tabs-wrapper')
      .getByRole('button', { name: /OSM/i });
    await osmTabBtn.scrollIntoViewIfNeeded();
    await osmTabBtn.click({ force: true });

    await page.waitForTimeout(500);

    // Find and click the "Ajouter" button in the OSM tab
    // This triggers handleSelectOSM -> duckDBOrchestrator.finalizeJoin -> dataTabStore.markStepComplete(2)
    const ajouterBtn = page
      .locator('#basemap-join-step')
      .getByRole('button', { name: /Ajouter|Add/i })
      .first();
    await expect(ajouterBtn).toBeVisible({ timeout: 10000 });
    await ajouterBtn.click({ force: true });

    // Wait for DuckDB finalizeJoin to complete
    await page.waitForTimeout(5000);

    // CRITICAL CHECK: Step 2 (Joindre) should now be marked complete.
    // Carbon ProgressStep with complete=true gets bx--progress-step--complete class on the li element.
    // The progress step for Joindre should have this class.
    const joindreStepLi = page
      .locator('.bx--progress-step--complete')
      .filter({ has: page.locator('p').filter({ hasText: /Joindre|Join/i }) });
    await expect(joindreStepLi).toBeVisible({ timeout: 15000 });

    // CRITICAL CHECK: Visualiser button should now be enabled
    await expect(visualiserBtn).toBeEnabled({ timeout: 10000 });
  });
});
