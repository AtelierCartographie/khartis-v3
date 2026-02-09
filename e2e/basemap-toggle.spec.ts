import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  CSV_PATH,
  ConsoleErrorTracker,
  createProject,
  freshStart,
  waitForMap
} from './helpers';

async function clickBasemapToggle(
  page: import('@playwright/test').Page,
  label: string
): Promise<void> {
  const switchEl = page
    .getByRole('switch', {
      name: new RegExp(`^${label}$`, 'i')
    })
    .first();

  await expect(switchEl).toBeVisible({ timeout: 10000 });
  await switchEl.click();
  await page.waitForTimeout(800);
}

test.describe('Basemap toggles', () => {
  test('should keep map rendered when non-symbol basemap toggles are switched', async ({
    page
  }) => {
    test.slow();

    const errorTracker: ConsoleErrorTracker = await freshStart(page);

    const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
    await createProject(page, csvPath, 'Basemap Toggle Stability');
    await waitForMap(page);

    await page
      .getByRole('button', { name: /Visualisations/i })
      .first()
      .click();
    await page.waitForTimeout(1200);

    const deckCanvas = page.locator('canvas#deckgl-overlay');
    await expect(deckCanvas).toBeVisible({ timeout: 15000 });

    const labelsToToggle = [
      'Terre',
      'Mers/Océans',
      'Lacs',
      'Rivières',
      'Équateur',
      'Méridiens/Parallèles',
      'Frontières/Limites'
    ];

    for (const label of labelsToToggle) {
      await clickBasemapToggle(page, label);
      await clickBasemapToggle(page, label);
    }

    await expect(deckCanvas).toBeVisible({ timeout: 10000 });

    const canvasSize = await deckCanvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height
    }));
    expect(canvasSize.width).toBeGreaterThan(0);
    expect(canvasSize.height).toBeGreaterThan(0);

    const errors = errorTracker.getErrors();
    if (errors.length > 0) {
      throw new Error(
        `Console errors after basemap toggles:\n${errorTracker.getErrorSummary()}`
      );
    }
  });
});
