import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { goToJoinStep } from './helpers';

const OUTPUT_DIR = path.join(
  process.cwd(),
  '.codex',
  'playwright',
  'khartis-v3',
  'output'
);

const FIXTURE_BASE_URL =
  'http://localhost:5176/cartographie/khartisnewpprd/tests-datasets/';
const STORAGE_STATE = path.join(
  process.cwd(),
  'tests',
  'e2e',
  'storage-state.json'
);

const SCENARIOS = [
  {
    slug: 'csv-sites-seveso',
    fixture: 'csv/sites-seveso-idf.csv',
    expectSuggestions: true,
    preparation: 'gps-osm'
  },
  {
    slug: 'geojson-nuts2',
    fixture: 'geojson/nuts2_data.geojson',
    expectSuggestions: true,
    assertSplit: true
  },
  {
    slug: 'geojson-lines-star',
    fixture: 'geojson/lignes-du-reseau-star-de-rennes-metropole.geojson',
    expectSuggestions: true
  },
  {
    slug: 'gpkg-compagnies-herault',
    fixture: 'gpkg/compagnies-herault-l93.gpkg',
    expectSuggestions: true
  },
  {
    slug: 'gpx-star-arrets',
    fixture:
      'gpx/star_arrets_physiques_actifs/star_arrets_physiques_actifs.gpx',
    expectSuggestions: true
  },
  {
    slug: 'kml-aires-covoiturage',
    fixture: 'kml-kmz/aires-covoiturage/aires-covoiturage.kml',
    expectSuggestions: true
  },
  {
    slug: 'zip-shapefile-complete',
    fixture: 'zip/shapefile-complete.zip',
    expectSuggestions: true
  },
  {
    slug: 'zip-single-csv',
    fixture: 'zip/single-csv.zip',
    expectSuggestions: true
  },
  {
    slug: 'zip-multiple-csv',
    fixture: 'zip/multiple-csv.zip',
    expectSuggestions: true
  },
  {
    slug: 'shp-ne50m-incomplete',
    fixture: 'shp-incomplete/ne_50m_admin_0_countries_lakes.shp',
    expectSuggestions: false
  }
] as const;

function fixtureUrl(relativePath: string): string {
  const url = new URL(relativePath.replace(/^\/+/, ''), FIXTURE_BASE_URL);
  url.searchParams.set(
    '__audit',
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  return url.toString();
}

async function acceptCookiesIfNeeded(page: Page): Promise<void> {
  const acceptButton = page.getByRole('button', {
    name: /^Accepter$|^Accept$/i
  });

  if (await acceptButton.isVisible().catch(() => false)) {
    await acceptButton.click({ force: true });
  }
}

async function uploadFixtureByUrl(
  page: Page,
  relativePath: string
): Promise<void> {
  const uploadUrl = fixtureUrl(relativePath);
  const urlInput = page.getByRole('textbox', {
    name: /Lien vers un fichier|Link to a file stored online|Online file/i
  });
  const loadButton = page.getByRole('button', {
    name: /^Charger$|^Load$/i
  });
  const createButton = page.getByRole('button', {
    name: /^Créer$|^Create$/i
  });
  const processingStatus = page.getByTestId('file-processing').first();
  const completeStatus = page.getByTestId('file-complete').first();
  const incompleteStatus = page.getByTestId('file-incomplete').first();
  const errorStatus = page.getByTestId('file-error').first();

  await expect(urlInput).toBeVisible({ timeout: 20000 });
  await urlInput.fill('');
  await page.waitForTimeout(100);
  await urlInput.fill(uploadUrl);
  await urlInput.press('Tab');
  await page.waitForTimeout(300);
  await expect(loadButton).toBeEnabled({ timeout: 20000 });
  const responsePromise = page
    .waitForResponse((response) => response.url() === uploadUrl, {
      timeout: 12000
    })
    .catch(() => null);
  await loadButton.click();
  await responsePromise;

  await Promise.race([
    expect(completeStatus).toBeVisible({ timeout: 60000 }),
    expect(incompleteStatus).toBeVisible({ timeout: 60000 }),
    expect(errorStatus).toBeVisible({ timeout: 60000 }),
    expect(createButton).toBeEnabled({ timeout: 60000 })
  ]).catch(async () => {
    const processingVisible = await processingStatus
      .isVisible()
      .catch(() => false);
    if (processingVisible) {
      await processingStatus
        .waitFor({ state: 'hidden', timeout: 60000 })
        .catch(() => undefined);
    }
  });
}

async function ensureCleanStart(page: Page): Promise<void> {
  const inlineUrlInput = page.getByRole('textbox', {
    name: /Lien vers un fichier|Link to a file stored online|Online file/i
  });
  const modalUrlInput = page
    .getByTestId('create-project-modal')
    .locator('input[placeholder^="https"]')
    .first();

  if (
    (await inlineUrlInput.isVisible().catch(() => false)) ||
    (await modalUrlInput.isVisible().catch(() => false))
  ) {
    return;
  }

  const hamburgerButton = page.locator('.bx--header__menu-trigger').first();
  const deleteButton = page.getByTestId('sidenav-delete-project');
  let hasDeleteButton = false;

  for (let attempt = 0; attempt < 3 && !hasDeleteButton; attempt += 1) {
    if (await hamburgerButton.isVisible().catch(() => false)) {
      await hamburgerButton.click({ force: true });
    }

    hasDeleteButton = await expect(deleteButton)
      .toBeVisible({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
  }

  if (hasDeleteButton) {
    await deleteButton.click({ force: true });

    const deleteDialog = page.getByRole('dialog', {
      name: /Supprimer le projet actuel|Delete current project/i
    });
    await expect(deleteDialog).toBeVisible({ timeout: 10000 });

    const confirmDeleteButton = deleteDialog.getByRole('button', {
      name: /^Supprimer$|^Delete$/i
    });
    await expect(confirmDeleteButton).toBeVisible({ timeout: 10000 });
    await confirmDeleteButton.click({ force: true });
    await page.waitForLoadState('domcontentloaded');
  }

  await expect(inlineUrlInput.or(modalUrlInput)).toBeVisible({
    timeout: 30000
  });
}

async function deleteProjectFromSideNav(page: Page): Promise<void> {
  const hamburgerButton = page.locator('.bx--header__menu-trigger').first();
  const deleteButton = page.getByTestId('sidenav-delete-project');

  await expect(hamburgerButton).toBeVisible({ timeout: 10000 });
  await hamburgerButton.click({ force: true });
  await expect(deleteButton).toBeVisible({ timeout: 10000 });
  await expect(deleteButton).toBeEnabled({ timeout: 10000 });
  await deleteButton.click({ force: true });

  const deleteDialog = page.getByRole('dialog', {
    name: /Supprimer le projet actuel|Delete current project/i
  });
  await expect(deleteDialog).toBeVisible({ timeout: 10000 });

  const confirmDeleteButton = deleteDialog.getByRole('button', {
    name: /^Supprimer$|^Delete$/i
  });
  await confirmDeleteButton.click({ force: true });
  await page.waitForLoadState('domcontentloaded');
  await expect(
    page.getByRole('textbox', {
      name: /Lien vers un fichier|Link to a file stored online|Online file/i
    })
  ).toBeVisible({ timeout: 30000 });
}

async function ensureProjectName(page: Page, slug: string): Promise<boolean> {
  const projectNameInput = page.getByTestId('project-name-input').first();

  if (!(await projectNameInput.isVisible().catch(() => false))) {
    return false;
  }

  const value = await projectNameInput.inputValue().catch(() => '');
  if (!value.trim()) {
    await projectNameInput.fill(`Suggestion audit ${slug}`);
    await projectNameInput.press('Tab').catch(() => undefined);
  }

  return true;
}

async function ensureProjectCreated(
  page: Page,
  slug: string
): Promise<boolean> {
  const urlInput = page.getByRole('textbox', {
    name: /Lien vers un fichier|Link to a file stored online|Online file/i
  });

  if (!(await urlInput.isVisible().catch(() => false))) {
    return true;
  }

  const createButton = page.getByRole('button', {
    name: /^Créer$|^Create$/i
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await ensureProjectName(page, slug);
    const enabled = await createButton.isEnabled().catch(() => false);
    if (enabled) {
      await createButton.click();
      await expect(urlInput).not.toBeVisible({ timeout: 60000 });
      return true;
    }
    await page.waitForTimeout(1000);
  }

  return false;
}

async function waitForVisualizationsReady(page: Page): Promise<void> {
  const vizTab = page.locator('#khartis-viz-tab');
  if (!(await vizTab.isVisible().catch(() => false))) {
    const visualizeButton = page.getByRole('button', {
      name: /Visualiser|Visualize/i
    });

    if (
      (await visualizeButton.isVisible().catch(() => false)) &&
      (await visualizeButton.isEnabled().catch(() => false))
    ) {
      await visualizeButton.click();
    } else {
      const visualizeStepButton = page.getByRole('button', {
        name: /Étape visualisations|Visualizations step|Visualisations/i
      });
      if (await visualizeStepButton.isVisible().catch(() => false)) {
        await visualizeStepButton.click();
      }
    }
  }

  await expect(vizTab).toBeVisible({ timeout: 60000 });
  await page
    .locator('.skeleton-loader, .view-mode-loader, .error-state')
    .first()
    .waitFor({ state: 'hidden', timeout: 10000 })
    .catch(() => undefined);
  await page.waitForTimeout(1200);
}

async function captureVisualization(page: Page, name: string): Promise<void> {
  await waitForVisualizationsReady(page);
  await page.screenshot({
    path: path.join(OUTPUT_DIR, `${name}-full.png`),
    fullPage: true
  });
  await page.waitForTimeout(300);
  await page
    .locator('.thematic-map-wrapper')
    .first()
    .screenshot({
      path: path.join(OUTPUT_DIR, `${name}-map.png`)
    });
}

async function captureData(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: path.join(OUTPUT_DIR, `${name}-full.png`),
    fullPage: true
  });
  await page.waitForTimeout(300);
  await page
    .locator('.thematic-map-wrapper')
    .first()
    .screenshot({
      path: path.join(OUTPUT_DIR, `${name}-map.png`)
    });
}

async function captureSuggestionCard(
  card: Locator,
  name: string
): Promise<void> {
  await card.screenshot({
    path: path.join(OUTPUT_DIR, `${name}-card.png`)
  });
}

async function assertNoNaNLegend(page: Page): Promise<void> {
  const legendLabels = page.locator('.legend-scale-label');
  const count = await legendLabels.count();

  for (let i = 0; i < count; i += 1) {
    await expect(legendLabels.nth(i)).not.toContainText('NaN');
  }
}

async function getSuggestionLabels(page: Page): Promise<string[]> {
  const cards = page.locator('.suggestion-card');
  const count = await cards.count();
  const labels: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const title = await cards.nth(i).locator('.card-title').innerText();
    labels.push(title.trim());
  }

  return labels;
}

async function openScenario(
  page: Page,
  scenario: (typeof SCENARIOS)[number]
): Promise<boolean> {
  await page.goto('/cartographie/khartisnewpprd/', {
    waitUntil: 'domcontentloaded'
  });
  await acceptCookiesIfNeeded(page);
  await ensureCleanStart(page);
  await uploadFixtureByUrl(page, scenario.fixture);
  return ensureProjectCreated(page, scenario.slug);
}

async function tryOpenVisualizations(page: Page): Promise<boolean> {
  const vizTab = page.locator('#khartis-viz-tab');
  if (await vizTab.isVisible().catch(() => false)) {
    return true;
  }

  const visualizeButton = page.locator('.visualize-button');

  const enabled = await expect(visualizeButton)
    .toBeEnabled({ timeout: 12000 })
    .then(() => true)
    .catch(() => false);

  if (!enabled) {
    return false;
  }

  await visualizeButton.click();
  await expect(vizTab).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(1200);
  return true;
}

async function prepareGpsDatasetForVisualization(page: Page): Promise<void> {
  await goToJoinStep(page);

  const basemapStep = page.locator('#basemap-join-step');
  await expect(basemapStep).toBeVisible({ timeout: 30000 });
  await basemapStep.scrollIntoViewIfNeeded();

  const osmTab = basemapStep.getByRole('button', {
    name: /Fond de référence|Reference basemap/i
  });
  await expect(osmTab).toBeVisible({ timeout: 10000 });
  await osmTab.click();

  const addOsmButton = basemapStep.getByRole('button', {
    name: /^Ajouter$|^Add$/i
  });
  await expect(addOsmButton).toBeVisible({ timeout: 10000 });
  await addOsmButton.click();

  await expect(page.locator('.visualize-button')).toBeEnabled({
    timeout: 30000
  });
}

async function ensureScenarioReady(
  page: Page,
  scenario: (typeof SCENARIOS)[number]
): Promise<boolean> {
  if (await tryOpenVisualizations(page)) {
    return true;
  }

  if (scenario.preparation === 'gps-osm') {
    await prepareGpsDatasetForVisualization(page);
    return tryOpenVisualizations(page);
  }

  return false;
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(240000);

for (const scenario of SCENARIOS) {
  test(`audit suggestion formats: ${scenario.slug}`, async ({
    page,
    browser
  }) => {
    const projectCreated = await openScenario(page, scenario);
    if (projectCreated) {
      await captureData(page, `${scenario.slug}-data-baseline`);
    }

    const reachedVisualization = projectCreated
      ? await ensureScenarioReady(page, scenario)
      : false;

    const suggestionLabels = projectCreated
      ? await getSuggestionLabels(page)
      : [];

    if (!scenario.expectSuggestions) {
      expect(
        reachedVisualization,
        `${scenario.fixture} should stay outside visualization mode when no suggestions are expected`
      ).toBe(false);
      expect(
        suggestionLabels.length,
        `${scenario.fixture} should not expose automatic suggestions`
      ).toBe(0);
      await deleteProjectFromSideNav(page).catch(() => undefined);
      return;
    }

    expect(
      reachedVisualization,
      `${scenario.fixture} should become visualizable before auditing suggestions`
    ).toBe(true);

    await captureVisualization(page, `${scenario.slug}-baseline`);

    expect(
      suggestionLabels.length,
      `${scenario.fixture} should expose at least one suggestion`
    ).toBeGreaterThan(0);

    if (scenario.assertSplit) {
      const firstCard = page.locator('.suggestion-card').first();
      const previewBox = await firstCard.locator('.card-preview').boundingBox();
      const contentBox = await firstCard.locator('.card-content').boundingBox();

      expect(previewBox).not.toBeNull();
      expect(contentBox).not.toBeNull();

      const widthDelta = Math.abs(
        (previewBox?.width ?? 0) - (contentBox?.width ?? 0)
      );
      expect(
        widthDelta,
        'suggestion card halves should stay visually equal'
      ).toBeLessThanOrEqual(2);
      await captureSuggestionCard(firstCard, `${scenario.slug}-split-check`);
    }

    for (let index = 0; index < suggestionLabels.length; index += 1) {
      const label = suggestionLabels[index];
      const context = await browser.newContext({ storageState: STORAGE_STATE });
      const suggestionPage = await context.newPage();

      try {
        const recreatedProject = await openScenario(suggestionPage, scenario);
        expect(recreatedProject).toBe(true);
        const readyAfterReset = await ensureScenarioReady(
          suggestionPage,
          scenario
        );
        expect(readyAfterReset).toBe(true);

        const card = suggestionPage.locator('.suggestion-card').nth(index);
        await expect(card).toBeVisible({ timeout: 20000 });
        await card.click();
        await suggestionPage.waitForTimeout(1200);
        await assertNoNaNLegend(suggestionPage);
        await captureVisualization(
          suggestionPage,
          `${scenario.slug}-suggestion-${index + 1}`
        );
        await captureSuggestionCard(
          card,
          `${scenario.slug}-suggestion-${index + 1}`
        );

        await expect
          .soft(
            card.locator('.card-title'),
            `suggestion card title should remain stable after click: ${label}`
          )
          .toHaveText(label);
      } finally {
        await context.close();
      }
    }

    await deleteProjectFromSideNav(page).catch(() => undefined);
  });
}
