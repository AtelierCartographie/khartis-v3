import { test } from '@playwright/test';

// TODO: Activer ce test quand tests-datasets/tsv/ contiendra des fichiers TSV
// Structure attendue: tests-datasets/tsv/example.tsv

test.describe('TSV Import', () => {
  test.skip('should import basic TSV file', async () => {
    // TODO: Implémenter quand on aura des fichiers TSV dans tests-datasets/tsv/
    // Exemple d'implémentation:
    //
    // const errorTracker = await freshStart(page);
    // const tsvPath = join(TSV_PATH, 'example.tsv');
    // await createProject(page, tsvPath, {
    //   projectName: `TSV Example ${Date.now()}`,
    //   fileAssertions: { minRows: 10, minColumns: 3 }
    // });
    // await waitForMap(page);
    // await expect(page.locator('.map-container').first()).toBeVisible();
    // assertNoConsoleErrors(errorTracker, 'TSV import');
  });

  test.skip('should handle TSV with different delimiters', async () => {
    // TODO: Tester les variantes de TSV (tab, semicolon, etc.)
  });
});
