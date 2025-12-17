import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  GPX_PATH,
  waitForMap,
  createProject,
  freshStart,
  assertNoConsoleErrors
} from '../helpers';

test.describe('GPX Import', () => {
  test('should import star_arrets_physiques_actifs.gpx', async ({ page }) => {
    test.slow();
    const errorTracker = await freshStart(page);

    const gpxPath = join(
      GPX_PATH,
      'star_arrets_physiques_actifs',
      'star_arrets_physiques_actifs.gpx'
    );
    await createProject(page, gpxPath, `GPX STAR ${Date.now()}`);
    await waitForMap(page);

    await expect(page.locator('.map-container').first()).toBeVisible();
    assertNoConsoleErrors(errorTracker, 'GPX import');
  });
});
