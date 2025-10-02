import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { MODAL_CONTAINER_SELECTOR, waitForModalVisible } from './helpers';
const CREATE_BUTTON_LABEL = 'Créer';
const SAVED_PROJECT_TAB_LABEL = 'Ouvrir un projet ou une sauvegarde';
const PROJECT_NAME_PREFIX = 'E2E Project';
const PROJECT_NAME_PLACEHOLDER = 'Sans nom';
const CURRENT_PROJECT_STORAGE_KEY = 'khartis_current_project';
const DATASET_FILENAME = 'nuts2_data.csv';
const TEST_DATASET_PATH = join(
  process.cwd(),
  'e2e',
  'mocks',
  'csv',
  DATASET_FILENAME
);

test.describe('Create project kh', () => {
  test('renders create project modal on load', async ({ page }) => {
    await page.goto('/');

    const modal = await waitForModalVisible(page);

    const createButton = modal.getByRole('button', {
      name: CREATE_BUTTON_LABEL,
      exact: true
    });
    // Ensure the primary create action stays disabled without inputs
    await expect(createButton).toBeDisabled();
  });

  test('creates a kh project from modal and shows it in saved projects list', async ({
    page
  }) => {
    // Generate a unique project name to avoid collisions across runs
    const projectName = `${PROJECT_NAME_PREFIX} ${Date.now()}`;

    // Load the app and wait for the modal to render
    await page.goto('/');

    const modal = await waitForModalVisible(page);

    // Sélectionner l'onglet "Créer un nouveau projet" d'abord
    const createTab = modal.locator('[data-testid="tab-create-new"]');
    await createTab.click();
    await page.waitForTimeout(500);

    const fileInput = modal.locator('input[type="file"]').first();
    // Upload the reference CSV so the create button becomes available
    await fileInput.setInputFiles(TEST_DATASET_PATH);

    // Verify the uploaded filename appears in the modal summary
    await expect(modal.locator('.bx--file-filename').first()).toContainText(
      DATASET_FILENAME
    );

    // Fill in the project name using the data-testid input
    const projectNameInput = modal.locator(
      '[data-testid="project-name-input"]'
    );
    await projectNameInput.fill(projectName);
    await page.waitForTimeout(500);

    const createButton = modal.getByRole('button', {
      name: CREATE_BUTTON_LABEL,
      exact: true
    });
    // Once the name and dataset are provided the action must be enabled
    await expect(createButton).toBeEnabled();
    // Trigger project creation which also closes the modal
    await createButton.click();

    // Confirm the modal closed after successful project creation
    await expect(modal).toBeHidden();

    // Clear the persisted current project so the modal reopens on reload
    await page.evaluate(async (key) => {
      // Clear specific key from IndexedDB (localforage uses IndexedDB)
      return new Promise((resolve) => {
        const request = indexedDB.open('localforage');
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['keyvaluepairs'], 'readwrite');
          const store = transaction.objectStore('keyvaluepairs');
          const deleteRequest = store.delete(key);
          deleteRequest.onsuccess = () => resolve(true);
          deleteRequest.onerror = () => resolve(false);
        };
        request.onerror = () => resolve(false);
      });
    }, CURRENT_PROJECT_STORAGE_KEY);

    // Reload the app to reopen the modal with the latest saved projects list
    await page.reload();

    // Ensure the modal is displayed again after reload
    await waitForModalVisible(page);

    const openProjectTab = modal.getByRole('button', {
      name: SAVED_PROJECT_TAB_LABEL,
      exact: true
    });
    // Switch to the saved-projects tab inside the modal
    await openProjectTab.click();

    const savedProjectsSection = modal.locator('#khartis-open-project');
    // Wait for the saved projects panel to become visible
    await expect(savedProjectsSection).toBeVisible();

    const savedProjectHeading = savedProjectsSection.getByRole('heading', {
      name: projectName,
      level: 6
    });
    // Assert the newly created project is listed among the saved entries
    await expect(savedProjectHeading).toBeVisible();
  });
});
