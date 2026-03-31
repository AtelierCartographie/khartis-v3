import { expect, test } from '@playwright/test';
import { addDatasetViaModal, createProject, uploadURL } from './helpers';

const FOSSIL_CSV_PATH = 'csv/fossil-fuel-subsidies-gdp-2021.csv';
const WORLD_BANK_RURAL_CSV_PATH = 'csv/world-bank-rural-pop.csv';

async function selectEntityColumn(
  page: import('@playwright/test').Page
): Promise<void> {
  const entityColumn = page
    .locator(
      '[data-testid="geolocation-column-selector"] [role="combobox"], [data-testid="geolocation-column-selector"] select, #geolocation-step [role="combobox"]'
    )
    .first();

  await expect(entityColumn).toBeVisible({ timeout: 20000 });
  await entityColumn.click();

  const entityOption = page.getByRole('option', { name: /Entity|Entité/i });
  if (
    await entityOption
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await entityOption.first().click();
    return;
  }

  await page.getByRole('option').first().click();
}

// Smoke test: complete join workflow then import a second dataset
test.describe
  .serial('TC-JOIN-SECOND-001: Complete join then import second dataset', () => {
  test.setTimeout(120000);

  test('completes join workflow then imports second dataset world-bank-rural-pop.csv', async ({
    page
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await uploadURL(page, FOSSIL_CSV_PATH);

    await page.waitForTimeout(3000);

    await createProject(page, 'Test Join Second Dataset');

    await selectEntityColumn(page);

    await page.waitForTimeout(1000);

    const joinTab = page
      .locator('.bx--progress-step-button')
      .filter({ hasText: /Joindre|Join/i })
      .first();
    await expect(joinTab).toBeEnabled({ timeout: 20000 });
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

    await addDatasetViaModal(page, WORLD_BANK_RURAL_CSV_PATH);

    await page.waitForTimeout(5000);

    const ruralPopIndicator = page
      .locator('text=/world-bank|Country Code|rural/i')
      .first();
    const isVisible = await ruralPopIndicator.isVisible().catch(() => false);
    const datasetCount = await page
      .locator('.dataset-item, [data-testid="dataset-item"]')
      .count();
    expect(isVisible || datasetCount > 0).toBe(true);
  });
});
