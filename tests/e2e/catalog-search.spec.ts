import { expect, test } from '@playwright/test';
import {
  goToJoinStep,
  selectGeolocationLinkedVariable,
  uploadURL
} from './helpers';

const FOSSIL_CSV_PATH = 'csv/fossil-fuel-subsidies-gdp-2021.csv';

async function openCatalogTab(
  page: import('@playwright/test').Page
): Promise<import('@playwright/test').Locator> {
  const basemapStep = page.locator('#basemap-join-step');
  const catalogTab = basemapStep
    .getByRole('button', { name: /Catalogue|Catalog/i })
    .first();
  await expect(catalogTab).toBeVisible({ timeout: 10000 });
  await catalogTab.click();

  const otherBasemapsSection = basemapStep
    .locator('button')
    .filter({ hasText: /Autres fonds de carte|Other basemaps|Autre/i })
    .first();
  if (await otherBasemapsSection.isVisible().catch(() => false)) {
    const isExpanded =
      (await otherBasemapsSection.getAttribute('aria-expanded')) === 'true';
    if (!isExpanded) {
      await otherBasemapsSection.click();
    }
  }

  return basemapStep;
}

async function prepareCatalog(
  page: import('@playwright/test').Page
): Promise<import('@playwright/test').Locator> {
  await uploadURL(page, FOSSIL_CSV_PATH);
  await selectGeolocationLinkedVariable(page, /Code|Entity|Entité/i);
  await goToJoinStep(page);
  return openCatalogTab(page);
}

test.describe.serial('TC-CATALOG-001: Catalog search and filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('displays catalog tab and search input', async ({ page }) => {
    const basemapStep = await prepareCatalog(page);
    await expect(
      basemapStep.getByRole('button', { name: /Catalogue|Catalog/i }).first()
    ).toBeVisible({ timeout: 10000 });
    await expect(
      basemapStep
        .getByRole('button', { name: /World|Europe|France|countries|regions/i })
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('filters basemaps by search query', async ({ page }) => {
    const basemapStep = await prepareCatalog(page);
    const searchInput = basemapStep
      .locator('.catalogue-filters')
      .getByRole('combobox')
      .first();

    await searchInput.fill('World');
    await page.waitForTimeout(300);

    await expect(searchInput).toHaveValue(/World/i);

    const matchingBasemapButtons = basemapStep.getByRole('button', {
      name: /World|countries/i
    });
    expect(await matchingBasemapButtons.count()).toBeGreaterThan(0);
  });

  test('filters basemaps by year', async ({ page }) => {
    const basemapStep = await prepareCatalog(page);
    const yearTags = basemapStep.locator('.year-filters .bx--tag--interactive');
    const tagCount = await yearTags.count();

    if (tagCount > 1) {
      await yearTags.nth(1).click();

      await page.waitForTimeout(500);

      const selectedTag = basemapStep.locator(
        '.year-filters .bx--tag--blue.bx--tag--interactive'
      );
      await expect(selectedTag.first()).toBeVisible();
    }
  });

  test('shows no results message when search has no matches', async ({
    page
  }) => {
    const basemapStep = await prepareCatalog(page);
    const searchInput = basemapStep
      .locator('.catalogue-filters')
      .getByRole('combobox')
      .first();

    await searchInput.fill('NonexistentPlaceThatDoesNotExist');

    await page.waitForTimeout(500);

    const noResults = basemapStep.getByText(
      /Aucun.*resultat|No.*result|no basemap/i
    );
    const noResultsVisible = await noResults
      .first()
      .isVisible()
      .catch(() => false);
    const visibleCardsCount = await basemapStep
      .locator('.basemap-cards-grid button')
      .count();
    expect(noResultsVisible || visibleCardsCount === 0).toBe(true);
  });

  test('clears search and shows all basemaps', async ({ page }) => {
    const basemapStep = await prepareCatalog(page);
    const searchInput = basemapStep
      .locator('.catalogue-filters')
      .getByRole('combobox')
      .first();

    await searchInput.fill('World');
    await page.waitForTimeout(300);

    await searchInput.clear();
    await page.waitForTimeout(300);

    await expect(searchInput).toHaveValue('');
    await expect(
      basemapStep
        .getByRole('button', { name: /World|Europe|France|countries|regions/i })
        .first()
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe
  .serial('TC-CATALOG-002: Catalog expands to show all basemaps', () => {
  test('displays suggestions section and other basemaps section', async ({
    page
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await uploadURL(page, FOSSIL_CSV_PATH);
    await selectGeolocationLinkedVariable(page, /Code/i);
    await goToJoinStep(page);

    await page.waitForTimeout(2000);

    const basemapStep = page.locator('#basemap-join-step');
    const suggestionsSection = basemapStep
      .getByText(/Suggestion|suggestion/i)
      .first();
    await expect(suggestionsSection).toBeVisible({ timeout: 10000 });

    const otherSection = basemapStep
      .getByText(/Autre|Other|Autres fonds/i)
      .first();
    await expect(otherSection).toBeVisible({ timeout: 5000 });
  });
});
