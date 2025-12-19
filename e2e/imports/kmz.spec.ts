import { test } from '@playwright/test';

// TODO: Activer ce test quand tests-datasets/kml-kmz/ contiendra des fichiers KMZ
// Structure attendue: tests-datasets/kml-kmz/example.kmz

test.describe('KMZ Import', () => {
  test.skip('should import KMZ file (compressed KML)', async () => {
    // TODO: Implémenter quand on aura des fichiers KMZ dans tests-datasets/kml-kmz/
    // KMZ = ZIP contenant un KML + éventuellement des images/ressources
    //
    // Exemple d'implémentation:
    //
    // const errorTracker = await freshStart(page);
    // const kmzPath = join(KML_PATH, 'example.kmz');
    // await createProject(page, kmzPath, {
    //   projectName: `KMZ Example ${Date.now()}`,
    //   fileAssertions: { minRows: 10, minColumns: 3 }
    // });
    // await waitForMap(page);
    // await expect(page.locator('.map-container').first()).toBeVisible();
    // assertNoConsoleErrors(errorTracker, 'KMZ import');
  });
});
