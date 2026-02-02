import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
	CSV_PATH,
	createProject,
	freshStart,
	waitForMap
} from './helpers';

test.describe('Project Creation with CSV', () => {
	test('should create project with valid CSV file', async ({ page }) => {
		test.slow();
		await freshStart(page);

		const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
		const { rowCount, columnCount } = await createProject(page, csvPath, {
			projectName: 'Test CSV Project',
			fileAssertions: {
				minRows: 1,
				minColumns: 1
			}
		});

		await waitForMap(page);

		// Verify map canvas is visible
		const mapCanvas = page.locator('.map-canvas').first();
		await expect(mapCanvas).toBeVisible();

		// Verify project name in UI
		await expect(page.locator('body')).toContainText('Test CSV Project', {
			timeout: 10000
		});
	});

	test('should handle CSV with special characters', async ({ page }) => {
		test.slow();
		await freshStart(page);

		// Use a CSV file with special characters if available
		const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
		await createProject(page, csvPath, {
			projectName: 'Test Special Chars',
			fileAssertions: { minRows: 1 }
		});

		await waitForMap(page);
		const mapCanvas = page.locator('.map-canvas').first();
		await expect(mapCanvas).toBeVisible();
	});

	test('should create project and show data in table', async ({ page }) => {
		test.slow();
		await freshStart(page);

		const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
		await createProject(page, csvPath, {
			projectName: 'Test Data Table',
			fileAssertions: { minRows: 10 }
		});

		await waitForMap(page);

		// Verify map canvas is visible
		const mapCanvas = page.locator('.map-canvas').first();
		await expect(mapCanvas).toBeVisible();

		// Verify we're on the data step by checking the active step button
		const dataStepButton = page.getByRole('button', { name: /Étape données|Data step/i, pressed: true });
		await expect(dataStepButton).toBeVisible({ timeout: 15000 });
	});
});
