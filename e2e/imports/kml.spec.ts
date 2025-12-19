import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  KML_PATH,
  waitForMap,
  createProject,
  freshStart,
  assertNoConsoleErrors
} from '../helpers';

test.describe('KML Import', () => {
  test('should import aires-covoiturage.kml', async ({ page }) => {
    test.slow();
    const errorTracker = await freshStart(page);

    const kmlPath = join(
      KML_PATH,
      'aires-covoiturage',
      'aires-covoiturage.kml'
    );
    await createProject(page, kmlPath, {
      projectName: `KML Covoiturage ${Date.now()}`,
      fileAssertions: { minRows: 50, minColumns: 3 }
    });
    await waitForMap(page);

    await expect(page.locator('.map-container').first()).toBeVisible();
    assertNoConsoleErrors(errorTracker, 'KML import');
  });
});
