import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { CSV_PATH, createProject, freshStart, waitForMap } from './helpers';

test.describe('Step Navigation', () => {
	test('should navigate from Données to Visualisations to Habillage', async ({
		page
	}) => {
		test.slow();
		await freshStart(page);

		const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
		await createProject(page, csvPath, 'Test Step Navigation');
		await waitForMap(page);

		// Navigate to Visualisations step
		await page.locator('button:has-text("Visualisations")').first().click();
		await page.waitForTimeout(1500);

		// Verify Visualisations step is active
		await expect(
			page.locator('button:has-text("Visualisations")').first()
		).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 });

		// Navigate to Habillage step
		await page.locator('button:has-text("Habillage")').first().click();
		await page.waitForTimeout(1500);

		// Verify Habillage step is active
		await expect(
			page.locator('button:has-text("Habillage")').first()
		).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 });
	});

	test('should preserve map state across step changes', async ({ page }) => {
		test.slow();
		await freshStart(page);

		const csvPath = join(CSV_PATH, 'fossil-fuel-subsidies-gdp-2021.csv');
		await createProject(page, csvPath, 'Test State Preservation');
		await waitForMap(page);

		// Verify map canvas exists
		const mapCanvas = page.locator('.map-canvas').first();
		await expect(mapCanvas).toBeVisible();

		// Navigate to Visualisations
		const vizStepButton = page.locator('button:has-text("Visualisations")').first();
		await vizStepButton.click();
		await page.waitForTimeout(1000);

		// Verify map canvas still visible
		await expect(mapCanvas).toBeVisible();

		// Navigate to Habillage
		const styleStepButton = page.locator('button:has-text("Habillage")').first();
		await styleStepButton.click();
		await page.waitForTimeout(1000);

		// Verify map canvas still visible
		await expect(mapCanvas).toBeVisible();
	});
});
