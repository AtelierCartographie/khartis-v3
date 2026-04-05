import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const OUTPUT_DIR = path.join(
  process.cwd(),
  '.codex',
  'playwright',
  'khartis-v3',
  'output'
);
const FIXTURE_BASE_URL =
  'http://localhost:5176/cartographie/khartisnewpprd/tests-datasets/';

function fixtureUrl(relativePath: string): string {
  return new URL(relativePath.replace(/^\/+/, ''), FIXTURE_BASE_URL).toString();
}

async function uploadFixtureByUrl(
  page: Page,
  relativePath: string
): Promise<void> {
  const urlInput = page.getByRole('textbox', {
    name: /Lien vers un fichier|Link to a file stored online|Online file/i
  });
  const loadButton = page.getByRole('button', {
    name: /^Charger$|^Load$/i
  });

  await expect(urlInput).toBeVisible({ timeout: 15000 });
  await urlInput.fill(fixtureUrl(relativePath));
  await urlInput.press('Tab');
  await page.waitForTimeout(500);

  await expect(loadButton).toBeEnabled({ timeout: 15000 });
  await loadButton.click();

  await expect(
    page
      .locator(
        '[data-testid="file-processing"], [data-testid="file-complete"], [data-testid="file-incomplete"], [data-testid="file-error"]'
      )
      .first()
  ).toBeVisible({ timeout: 30000 });
}

test.setTimeout(120000);

async function ensureCleanStart(page: Page): Promise<void> {
  const urlInput = page.getByRole('textbox', {
    name: /Lien vers un fichier|Link to a file stored online|Online file/i
  });
  if (await urlInput.isVisible().catch(() => false)) {
    return;
  }

  const hamburgerButton = page.locator('.bx--header__menu-trigger').first();
  if (await hamburgerButton.isVisible().catch(() => false)) {
    await hamburgerButton.click();
  }

  const deleteButton = page.getByTestId('sidenav-delete-project');
  if (await deleteButton.isVisible().catch(() => false)) {
    await deleteButton.click();

    const confirmDeleteButton = page.getByRole('button', {
      name: /Supprimer|Delete/i
    });
    await expect(confirmDeleteButton).toBeVisible({ timeout: 10000 });
    await confirmDeleteButton.click();
  }

  await expect(urlInput).toBeVisible({ timeout: 30000 });
}

async function ensureProjectCreated(page: Page): Promise<void> {
  const urlInput = page.getByRole('textbox', {
    name: /Lien vers un fichier|Link to a file stored online|Online file/i
  });
  if (!(await urlInput.isVisible().catch(() => false))) {
    return;
  }

  const createButton = page.getByRole('button', { name: /^Créer$|^Create$/i });
  await expect(createButton).toBeEnabled({ timeout: 30000 });
  await createButton.click();
  await expect(urlInput).not.toBeVisible({ timeout: 60000 });
}

async function waitForVisualizationsReady(page: Page): Promise<void> {
  const vizTab = page.locator('#khartis-viz-tab');
  if (!(await vizTab.isVisible().catch(() => false))) {
    const visualizeButton = page.getByRole('button', {
      name: /Visualiser|Visualize/i
    });

    if (await visualizeButton.isVisible().catch(() => false)) {
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

  await expect(vizTab).toBeVisible({
    timeout: 60000
  });
  await expect(
    page.getByRole('button', {
      name: /Créer sa visualisation|Create visualization/i
    })
  ).toBeVisible({ timeout: 30000 });
  await page
    .locator('.skeleton-loader, .view-mode-loader, .error-state')
    .first()
    .waitFor({ state: 'hidden', timeout: 5000 })
    .catch(() => undefined);
  await page.waitForTimeout(1200);
}

async function capture(page: Page, name: string): Promise<void> {
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

test('audit: nuts2 suggestions stay visually coherent', async ({ page }) => {
  await page.goto('/cartographie/khartisnewpprd/', {
    waitUntil: 'domcontentloaded'
  });
  await ensureCleanStart(page);
  await uploadFixtureByUrl(page, 'geojson/nuts2_data.geojson');
  await ensureProjectCreated(page);

  await capture(page, 'audit-nuts2-baseline');

  await page
    .locator('.suggestion-card')
    .filter({ hasText: /Symboles proportionnels/i })
    .first()
    .click();
  await capture(page, 'audit-nuts2-proportional');

  await page
    .locator('.suggestion-card')
    .filter({ hasText: /Double symboles proportionnels/i })
    .first()
    .click();
  await capture(page, 'audit-nuts2-double-proportional');
});

test('audit: qualitative suggestion and year filter stay aligned', async ({
  page
}) => {
  await page.goto('/cartographie/khartisnewpprd/', {
    waitUntil: 'domcontentloaded'
  });
  await ensureCleanStart(page);
  await uploadFixtureByUrl(page, 'geojson/visualization-toolbox-cases.geojson');
  await ensureProjectCreated(page);

  await capture(page, 'audit-toolbox-baseline');

  await page
    .locator('.suggestion-card')
    .filter({ hasText: /qualitatif/i })
    .first()
    .click();
  await capture(page, 'audit-toolbox-qualitative');

  await page
    .getByLabel(/Colonne année|Year column/i)
    .selectOption({ label: 'year' })
    .catch(async () => {
      await page.getByLabel(/Colonne année|Year column/i).selectOption('year');
    });
  await page
    .getByLabel(/Valeur année|Year value/i)
    .selectOption({ label: '2024' })
    .catch(async () => {
      await page.getByLabel(/Valeur année|Year value/i).selectOption('2024');
    });
  await capture(page, 'audit-toolbox-year-2024');

  await page
    .getByLabel(/Valeur année|Year value/i)
    .selectOption({ label: '2023' })
    .catch(async () => {
      await page.getByLabel(/Valeur année|Year value/i).selectOption('2023');
    });
  await capture(page, 'audit-toolbox-year-2023');
});
