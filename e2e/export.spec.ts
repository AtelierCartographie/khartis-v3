import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  CSV_PATH,
  createProject,
  freshStart,
  waitForMap,
  TIMEOUTS
} from './helpers';

test.describe('Export Functionality', () => {
  test('should export project as .kh file', async ({ page }) => {
    test.slow();
    await freshStart(page);

    // Create a simple project
    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    await createProject(page, csvPath, 'Test Export Project');
    await waitForMap(page);

    // Wait for project to be fully loaded
    await page.waitForTimeout(2000);

    // Look for the download/export button in the header
    const downloadButton = page.getByRole('button', {
      name: /Télécharger|Download/i
    });
    await expect(downloadButton).toBeVisible({ timeout: TIMEOUTS.action });

    // Click on download button to open export modal
    await downloadButton.click();
    await page.waitForTimeout(TIMEOUTS.transition);

    // Verify export modal dialog opens
    const exportModal = page.getByRole('dialog', {
      name: /Options de téléchargement|Download options/i
    });
    await expect(exportModal).toBeVisible({ timeout: TIMEOUTS.action });

    // Verify "Projet" tab is visible and selected by default
    const projetTab = exportModal.getByRole('tab', { name: /Projet|Project/i });
    await expect(projetTab).toBeVisible({ timeout: TIMEOUTS.action });
    await expect(projetTab).toHaveAttribute('aria-selected', 'true');

    // Set up download listener before clicking export button
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });

    // Click the download button in the modal
    const exportButton = exportModal.getByRole('button', {
      name: /Télécharger|Download/i
    });
    await expect(exportButton).toBeVisible({ timeout: TIMEOUTS.action });
    await exportButton.click();

    // Wait for download to start
    const download = await downloadPromise;

    // Verify download properties - extension is .kh
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.kh$/);

    // Verify download completes successfully
    const path = await download.path();
    expect(path).toBeTruthy();
  });

  test('should show export modal with tabs for Projet, Carte, Données', async ({
    page
  }) => {
    test.slow();
    await freshStart(page);

    // Create a simple project
    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    await createProject(page, csvPath, 'Test Export Menu');
    await waitForMap(page);

    // Wait for project to be fully loaded
    await page.waitForTimeout(2000);

    // Open download modal
    const downloadButton = page.getByRole('button', {
      name: /Télécharger|Download/i
    });
    await expect(downloadButton).toBeVisible({ timeout: TIMEOUTS.action });
    await downloadButton.click();
    await page.waitForTimeout(TIMEOUTS.transition);

    // Verify export modal dialog opens
    const exportModal = page.getByRole('dialog', {
      name: /Options de téléchargement|Download options/i
    });
    await expect(exportModal).toBeVisible({ timeout: TIMEOUTS.action });

    // Verify all three tabs are present (CDC section 1.D: Projet, Carte, Données)
    const projetTab = exportModal.getByRole('tab', { name: /Projet/i });
    const carteTab = exportModal.getByRole('tab', { name: /Carte/i });
    const donneesTab = exportModal.getByRole('tab', { name: /Données/i });

    await expect(projetTab).toBeVisible({ timeout: TIMEOUTS.action });
    await expect(carteTab).toBeVisible({ timeout: TIMEOUTS.action });
    await expect(donneesTab).toBeVisible({ timeout: TIMEOUTS.action });

    // Verify Projet tab is selected by default
    await expect(projetTab).toHaveAttribute('aria-selected', 'true');

    // Close the modal
    const closeButton = exportModal.getByRole('button', {
      name: /Close the modal/i
    });
    await closeButton.click();
    await expect(exportModal).toBeHidden({ timeout: TIMEOUTS.action });
  });
});
