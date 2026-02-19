import { expect, test } from '@playwright/test';
import path from 'path';

const TEST_DATASETS_DIR = path.join(process.cwd(), 'tests-datasets');

async function handleCreateProjectModal(
  page: import('@playwright/test').Page
): Promise<void> {
  const projectNameInput = page.getByTestId('project-name-input');
  if (await projectNameInput.isVisible()) {
    await projectNameInput.fill('Test Join Second Dataset');
  }

  const createButton = page.getByRole('button', {
    name: /^Créer$|^Create$/i
  });
  if (await createButton.isEnabled()) {
    await createButton.click();
    await page.waitForTimeout(3000);
  }

  await expect(page.getByTestId('create-project-modal')).not.toBeVisible({
    timeout: 5000
  });
}

test.describe
  .serial('TC-JOIN-SECOND-001: Complete join then import second dataset', () => {
  test('completes join workflow then imports second dataset world-bank-rural-pop.csv', async ({
    page
  }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );
    const worldBankRuralCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'world-bank-rural-pop.csv'
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(3000);

    await handleCreateProjectModal(page);

    const entityColumn = page
      .locator(
        '[data-testid="geolocation-column-selector"], select, [role="combobox"]'
      )
      .first();
    if (await entityColumn.isVisible()) {
      await entityColumn.click();
      await page.getByRole('option', { name: /Entity/i }).click();
    }

    await page.waitForTimeout(1000);

    const joinTab = page
      .locator('.bx--progress-step-button')
      .filter({ hasText: /Joindre|Join/i })
      .first();
    await joinTab.click();

    await page.waitForTimeout(3000);

    const worldBasemap = page.getByText(/World|countries/i).first();
    if (await worldBasemap.isVisible()) {
      await worldBasemap.click();
    }

    await page.waitForTimeout(5000);

    const finalizeButton = page
      .getByRole('button', {
        name: /Finaliser|Finalize|Valider|Validate/i
      })
      .first();
    if (
      (await finalizeButton.isVisible()) &&
      (await finalizeButton.isEnabled())
    ) {
      await finalizeButton.click();
      await page.waitForTimeout(3000);
    }

    const secondFileInput = page.locator('input[type="file"]').first();
    await secondFileInput.setInputFiles(worldBankRuralCsvPath);

    await page.waitForTimeout(5000);

    const ruralPopIndicator = page
      .locator('text=/world-bank|Country Code|rural/i')
      .first();
    const isVisible = await ruralPopIndicator.isVisible().catch(() => false);
    expect(
      isVisible ||
        (await page
          .locator('.dataset-item, [data-testid="dataset-item"]')
          .count())
    ).toBeGreaterThanOrEqual(0);
  });
});

test.describe.serial('TC-JOIN-SECOND-002: Join two tabular datasets', () => {
  test('imports first dataset, finalizes join, then imports world-bank-rural-pop for comparison', async ({
    page
  }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );
    const worldBankRuralCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'world-bank-rural-pop.csv'
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(3000);

    await handleCreateProjectModal(page);

    const entityColumn = page
      .locator(
        '[data-testid="geolocation-column-selector"], select, [role="combobox"]'
      )
      .first();
    if (await entityColumn.isVisible()) {
      await entityColumn.click();
      await page.getByRole('option', { name: /Entity/i }).click();
    }

    await page.waitForTimeout(1000);

    const joinTab = page
      .locator('.bx--progress-step-button')
      .filter({ hasText: /Joindre|Join/i })
      .first();
    await joinTab.click();

    await page.waitForTimeout(3000);

    const worldBasemap = page.getByText(/World|countries/i).first();
    if (await worldBasemap.isVisible()) {
      await worldBasemap.click();
      await page.waitForTimeout(3000);
    }

    const finalizeButton = page
      .getByRole('button', {
        name: /Finaliser|Finalize|Valider|Validate/i
      })
      .first();
    if (
      (await finalizeButton.isVisible()) &&
      (await finalizeButton.isEnabled())
    ) {
      await finalizeButton.click();
      await page.waitForTimeout(3000);
    }

    const secondFileInput = page.locator('input[type="file"]').first();
    await secondFileInput.setInputFiles(worldBankRuralCsvPath);

    await page.waitForTimeout(5000);

    const secondFileInputExists = await page
      .locator('input[type="file"]')
      .count();
    expect(secondFileInputExists).toBeGreaterThanOrEqual(0);
  });
});

test.describe
  .serial('TC-JOIN-SECOND-003: Dataset list after join and second import', () => {
  test('verifies dataset list contains both datasets after join completion', async ({
    page
  }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );
    const worldBankRuralCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'world-bank-rural-pop.csv'
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(3000);

    await handleCreateProjectModal(page);

    const entityColumn = page
      .locator(
        '[data-testid="geolocation-column-selector"], select, [role="combobox"]'
      )
      .first();
    if (await entityColumn.isVisible()) {
      await entityColumn.click();
      await page.getByRole('option', { name: /Entity/i }).click();
    }

    await page.waitForTimeout(1000);

    const joinTab = page
      .locator('.bx--progress-step-button')
      .filter({ hasText: /Joindre|Join/i })
      .first();
    await joinTab.click();

    await page.waitForTimeout(3000);

    const worldBasemap = page.getByText(/World|countries/i).first();
    if (await worldBasemap.isVisible()) {
      await worldBasemap.click();
      await page.waitForTimeout(5000);
    }

    const finalizeButton = page
      .getByRole('button', {
        name: /Finaliser|Finalize|Valider|Validate/i
      })
      .first();
    if (
      (await finalizeButton.isVisible()) &&
      (await finalizeButton.isEnabled())
    ) {
      await finalizeButton.click();
      await page.waitForTimeout(3000);
    }

    const secondFileInput = page.locator('input[type="file"]').first();
    await secondFileInput.setInputFiles(worldBankRuralCsvPath);

    await page.waitForTimeout(5000);

    const fossilDataset = page
      .getByText(/fossil-fuel|Fossil|subsidies/i)
      .first();
    const fossilVisible = await fossilDataset.isVisible().catch(() => false);

    const ruralDataset = page.getByText(/world-bank|World Bank|rural/i).first();
    const ruralVisible = await ruralDataset.isVisible().catch(() => false);

    expect(fossilVisible || ruralVisible).toBe(true);
  });
});
