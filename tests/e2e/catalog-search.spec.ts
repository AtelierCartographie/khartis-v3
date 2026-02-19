import { expect, test } from '@playwright/test';
import path from 'path';

const TEST_DATASETS_DIR = path.join(process.cwd(), 'tests-datasets');

test.describe.serial('TC-CATALOG-001: Catalog search and filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('displays catalog tab and search input', async ({ page }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(2000);

    const joinSection = page.getByText(/Joindre|Join/i).first();
    await joinSection.click();

    await page.waitForTimeout(1000);

    const catalogTab = page
      .getByRole('button', { name: /Catalog|catalog/i })
      .first();
    if (await catalogTab.isVisible()) {
      await catalogTab.click();
    }

    await page.waitForTimeout(500);

    const searchInput = page
      .locator(
        'input[placeholder*="Rechercher|Search"], .bx--combo-box input, [data-testid="basemap-search"]'
      )
      .first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });

  test('filters basemaps by search query', async ({ page }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(2000);

    const joinSection = page.getByText(/Joindre|Join/i).first();
    await joinSection.click();

    await page.waitForTimeout(1000);

    const catalogTab = page
      .getByRole('button', { name: /Catalog|catalog/i })
      .first();
    if (await catalogTab.isVisible()) {
      await catalogTab.click();
    }

    await page.waitForTimeout(500);

    const searchInput = page
      .locator(
        'input[placeholder*="Rechercher|Search"], .bx--combo-box input, [data-testid="basemap-search"]'
      )
      .first();

    await searchInput.fill('World');

    await page.waitForTimeout(500);

    const basemapCards = page.locator(
      '.basemap-cards-grid .basemap-card, [data-testid="basemap-card"]'
    );
    const count = await basemapCards.count();

    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 5); i++) {
      const cardText = await basemapCards.nth(i).textContent();
      expect(
        cardText?.toLowerCase().includes('world') ||
          cardText?.toLowerCase().includes('countries')
      ).toBe(true);
    }
  });

  test('filters basemaps by year', async ({ page }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(2000);

    const joinSection = page.getByText(/Joindre|Join/i).first();
    await joinSection.click();

    await page.waitForTimeout(1000);

    const catalogTab = page
      .getByRole('button', { name: /Catalog|catalog/i })
      .first();
    if (await catalogTab.isVisible()) {
      await catalogTab.click();
    }

    await page.waitForTimeout(500);

    const yearTags = page.locator('.year-filters .bx--tag--interactive');
    const tagCount = await yearTags.count();

    if (tagCount > 1) {
      await yearTags.nth(1).click();

      await page.waitForTimeout(500);

      const selectedTag = page.locator(
        '.year-filters .bx--tag--blue.bx--tag--interactive'
      );
      await expect(selectedTag.first()).toBeVisible();
    }
  });

  test('shows no results message when search has no matches', async ({
    page
  }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(2000);

    const joinSection = page.getByText(/Joindre|Join/i).first();
    await joinSection.click();

    await page.waitForTimeout(1000);

    const catalogTab = page
      .getByRole('button', { name: /Catalog|catalog/i })
      .first();
    if (await catalogTab.isVisible()) {
      await catalogTab.click();
    }

    await page.waitForTimeout(500);

    const searchInput = page
      .locator(
        'input[placeholder*="Rechercher|Search"], .bx--combo-box input, [data-testid="basemap-search"]'
      )
      .first();

    await searchInput.fill('NonexistentPlaceThatDoesNotExist');

    await page.waitForTimeout(500);

    const noResults = page.getByText(/Aucun.*resultat|No.*result|no basemap/i);
    await expect(noResults.first()).toBeVisible({ timeout: 5000 });
  });

  test('clears search and shows all basemaps', async ({ page }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(2000);

    const joinSection = page.getByText(/Joindre|Join/i).first();
    await joinSection.click();

    await page.waitForTimeout(1000);

    const catalogTab = page
      .getByRole('button', { name: /Catalog|catalog/i })
      .first();
    if (await catalogTab.isVisible()) {
      await catalogTab.click();
    }

    await page.waitForTimeout(500);

    const searchInput = page
      .locator(
        'input[placeholder*="Rechercher|Search"], .bx--combo-box input, [data-testid="basemap-search"]'
      )
      .first();

    await searchInput.fill('World');
    await page.waitForTimeout(300);

    await searchInput.clear();
    await page.waitForTimeout(300);

    const basemapCards = page.locator(
      '.basemap-cards-grid .basemap-card, [data-testid="basemap-card"]'
    );
    const countAfterClear = await basemapCards.count();

    expect(countAfterClear).toBeGreaterThan(2);
  });
});

test.describe
  .serial('TC-CATALOG-002: Catalog expands to show all basemaps', () => {
  test('displays suggestions section and other basemaps section', async ({
    page
  }) => {
    const fossilCsvPath = path.join(
      TEST_DATASETS_DIR,
      'csv',
      'fossil-fuel-subsidies-gdp-2021.csv'
    );

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fossilCsvPath);

    await page.waitForTimeout(2000);

    const codeColumn = page
      .locator(
        '[data-testid="geolocation-column-selector"], select, [role="combobox"]'
      )
      .first();
    if (await codeColumn.isVisible()) {
      await codeColumn.click();
      const codeOption = page.getByRole('option', { name: /Code/i });
      if (await codeOption.isVisible()) {
        await codeOption.click();
      }
    }

    await page.waitForTimeout(1000);

    const joinSection = page.getByText(/Joindre|Join/i).first();
    await joinSection.click();

    await page.waitForTimeout(2000);

    const suggestionsSection = page.getByText(/Suggestion|suggestion/i).first();
    await expect(suggestionsSection).toBeVisible({ timeout: 10000 });

    const otherSection = page.getByText(/Autre|Other|Autres fonds/i).first();
    await expect(otherSection).toBeVisible({ timeout: 5000 });
  });
});
