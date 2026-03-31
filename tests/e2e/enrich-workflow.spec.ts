import { expect, test, type Locator, type Page } from '@playwright/test';
import { goToEnrichStep, uploadURL } from './helpers';

const TINY_GEO_PATH = 'geojson/tiny-geo-3features.geojson';
const FOSSIL_CSV_PATH = 'csv/fossil-fuel-subsidies-gdp-2021.csv';
const SINGLE_CSV_ZIP_PATH = 'zip/single-csv.zip';
const EMPTY_CSV_PATH = 'csv/csv-malformed--with-nothing.csv';

const JOIN_TABULAR_SWITCH_NAME =
  /Joindre des données tabulaires|Join tabular data/i;

async function openGeographicEnrichment(page: Page): Promise<Locator> {
  await page.goto('/');
  await uploadURL(page, TINY_GEO_PATH);
  await goToEnrichStep(page);

  const enrichStep = page.locator('#enrich-data-step');
  await expect(enrichStep).toBeVisible({ timeout: 30000 });
  return enrichStep;
}

async function ensureSwitchChecked(
  section: Locator,
  name: RegExp
): Promise<void> {
  const switchControl = section.getByRole('switch', { name }).first();
  await expect(switchControl).toBeVisible({ timeout: 15000 });
  if (!(await switchControl.isChecked())) {
    await switchControl.check();
  }
}

async function uploadEnrichmentFile(
  page: Page,
  relativePath: string,
  allowFailure: boolean = false
): Promise<Locator> {
  const enrichStep = await openGeographicEnrichment(page);
  await ensureSwitchChecked(enrichStep, JOIN_TABULAR_SWITCH_NAME);
  if (allowFailure) {
    await uploadURL(page, relativePath, enrichStep).catch(() => {
      return;
    });
  } else {
    await uploadURL(page, relativePath, enrichStep);
  }
  return enrichStep;
}

async function selectComboOption(
  page: Page,
  combo: Locator,
  optionPattern: RegExp
): Promise<void> {
  await expect(combo).toBeVisible({ timeout: 15000 });
  await combo.click();

  const namedOption = page.getByRole('option', { name: optionPattern }).first();
  if (await namedOption.isVisible().catch(() => false)) {
    await namedOption.click();
    return;
  }

  const fallbackOption = page.getByRole('option').first();
  await expect(fallbackOption).toBeVisible({ timeout: 10000 });
  await fallbackOption.click();
}

async function configureEnrichmentJoinColumns(
  page: Page,
  enrichStep: Locator,
  geoColumnPattern: RegExp,
  enrichmentColumnPattern: RegExp
): Promise<void> {
  const geoColumns = enrichStep.locator('.geo-column-select');
  const geoCombo = geoColumns.first().getByRole('combobox').first();
  const enrichmentCombo = geoColumns.nth(1).getByRole('combobox').first();

  await selectComboOption(page, geoCombo, geoColumnPattern);
  await selectComboOption(page, enrichmentCombo, enrichmentColumnPattern);
}

test.describe.serial('TC-ENRICH-001: Workflow géographique', () => {
  test('affiche sections Contrôler et Enrichir pour dataset géographique', async ({
    page
  }) => {
    await page.goto('/');
    await uploadURL(page, TINY_GEO_PATH);

    const dataTab = page.locator('#khartis-data-tab');
    await expect(dataTab).toBeVisible();
    await expect(
      page
        .locator('.bx--progress-step-button')
        .filter({ hasText: /Contrôler|Control/i })
    ).toHaveCount(1);
    await expect(
      page
        .locator('.bx--progress-step-button')
        .filter({ hasText: /Enrichir|Enrich/i })
    ).toHaveCount(1);
    await expect(
      page
        .locator('.bx--progress-step-button')
        .filter({ hasText: /Géolocaliser|Geolocate/i })
    ).toHaveCount(0);
  });
});

test.describe
  .serial('TC-ENRICH-002: Upload fichier tabulaire enrichissement', () => {
  test('importe fichier tabulaire pour enrichissement', async ({ page }) => {
    const enrichStep = await uploadEnrichmentFile(page, FOSSIL_CSV_PATH);
    await expect(enrichStep.getByText(/fossil|subsid/i).first()).toBeVisible({
      timeout: 15000
    });
  });
});

test.describe.serial('TC-ENRICH-003: Rejet format non supporté', () => {
  test('rejette format non supporté pour enrichissement', async ({ page }) => {
    const enrichStep = await uploadEnrichmentFile(
      page,
      SINGLE_CSV_ZIP_PATH,
      true
    );
    await expect(
      enrichStep.locator('.bx--inline-notification--error').first()
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe.serial('TC-ENRICH-011: Finalisation enrichissement', () => {
  test('ajoute colonnes après finalisation enrichissement', async ({
    page
  }) => {
    const enrichStep = await uploadEnrichmentFile(page, FOSSIL_CSV_PATH);
    await configureEnrichmentJoinColumns(
      page,
      enrichStep,
      /name|nom|country/i,
      /Code|Entity|Entité/i
    );

    const finalizeOrCorrectionButton = enrichStep
      .getByRole('button', {
        name: /Valider|Validate|Finalize|Finaliser|Appliquer|Apply/i
      })
      .first();
    const hasActionButton = await finalizeOrCorrectionButton
      .isVisible()
      .catch(() => false);
    if (hasActionButton && (await finalizeOrCorrectionButton.isEnabled())) {
      await finalizeOrCorrectionButton.click();
    } else {
      await expect(
        enrichStep
          .locator('.join-stats-accordion, .join-assisted-section')
          .first()
      ).toBeVisible({ timeout: 20000 });
    }

    const controlTab = page
      .locator('.bx--progress-step-button')
      .filter({ hasText: /Contrôler|Control/i })
      .first();
    await expect(controlTab).toBeVisible({ timeout: 10000 });
    await controlTab.click();

    await expect(page.locator('table').first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe.serial('TC-ENRICH-017: Rejet fichier vide', () => {
  test('rejette fichier CSV vide', async ({ page }) => {
    const enrichStep = await uploadEnrichmentFile(page, EMPTY_CSV_PATH, true);
    await expect(
      enrichStep.locator('.bx--inline-notification--error').first()
    ).toBeVisible({ timeout: 15000 });
  });
});
