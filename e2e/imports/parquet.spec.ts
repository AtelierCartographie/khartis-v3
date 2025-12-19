import { test } from '@playwright/test';

// TODO: Activer ce test quand tests-datasets/parquet/ contiendra des fichiers Parquet
// Structure attendue: tests-datasets/parquet/example.parquet

test.describe('Parquet Import', () => {
  test.skip('should import basic Parquet file', async () => {
    // TODO: Implémenter quand on aura des fichiers Parquet dans tests-datasets/parquet/
    // Exemple d'implémentation:
    //
    // const errorTracker = await freshStart(page);
    // const parquetPath = join(PARQUET_PATH, 'example.parquet');
    // await createProject(page, parquetPath, {
    //   projectName: `Parquet Example ${Date.now()}`,
    //   fileAssertions: { minRows: 100, minColumns: 5 }
    // });
    // await waitForMap(page);
    // await expect(page.locator('.map-container').first()).toBeVisible();
    // assertNoConsoleErrors(errorTracker, 'Parquet import');
  });

  test.skip('should import GeoParquet file with geometry', async () => {
    // TODO: Tester GeoParquet avec colonnes géométriques (GeoArrow encoding)
  });
});
