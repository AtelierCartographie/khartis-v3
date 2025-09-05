import { test, expect } from '@playwright/test';

test.describe('New Project Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('#khartis-create-project', { state: 'visible' });
    
    const newProjectTab = page.locator('.project-type-selector button').nth(0);
    await newProjectTab.click();
    await expect(newProjectTab).toHaveAttribute('aria-pressed', 'true');
  });

  test('should display file upload area', async ({ page }) => {
    const dropZone = page.locator('.bx--file__drop-container');
    await expect(dropZone).toBeVisible();
    await expect(dropZone).toContainText('Glissez et déposez');
  });

  test('should display paste data area', async ({ page }) => {
    const pasteArea = page.locator('textarea[placeholder*="Coller"]');
    await expect(pasteArea).toBeVisible();
  });

  test('should display URL input and load button', async ({ page }) => {
    const urlInput = page.locator('input[placeholder="https://"]');
    await expect(urlInput).toBeVisible();
    
    const loadButton = page.locator('button:has-text("Charger")');
    await expect(loadButton).toBeVisible();
  });

  test('should handle file upload via drag and drop', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    
    const csvContent = 'name,value\nTest,100';
    const buffer = Buffer.from(csvContent);
    
    await fileInput.setInputFiles({
      name: 'test.csv',
      mimeType: 'text/csv',
      buffer: buffer
    });
    
    await page.waitForTimeout(500);
  });

  test('should handle paste data', async ({ page }) => {
    const pasteArea = page.locator('textarea[placeholder*="Coller"]');
    const testData = 'name,value\nParis,100\nLyon,50';
    
    await pasteArea.fill(testData);
    await expect(pasteArea).toHaveValue(testData);
  });

  test('should handle URL input', async ({ page }) => {
    const urlInput = page.locator('input[placeholder="https://"]');
    const testUrl = 'https://example.com/data.csv';
    
    await urlInput.fill(testUrl);
    await expect(urlInput).toHaveValue(testUrl);
    
    const loadButton = page.locator('button:has-text("Charger")');
    await expect(loadButton).toBeEnabled();
  });

  test('should validate file size limits', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    
    const largeContent = 'x'.repeat(2000000);
    const buffer = Buffer.from(largeContent);
    
    await fileInput.setInputFiles({
      name: 'large.csv',
      mimeType: 'text/csv',
      buffer: buffer
    });
    
    await page.waitForTimeout(500);
  });

  test('should display learn more link', async ({ page }) => {
    const learnMoreText = page.locator('text=En savoir plus sur les données');
    await expect(learnMoreText).toBeVisible();
    
    const linkIcon = page.locator('.text-grey svg').first();
    await expect(linkIcon).toBeVisible();
  });

  test('should accept multiple file formats', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    
    const formats = [
      { name: 'test.csv', mimeType: 'text/csv' },
      { name: 'test.json', mimeType: 'application/json' },
      { name: 'test.geojson', mimeType: 'application/geo+json' }
    ];
    
    for (const format of formats) {
      await fileInput.setInputFiles({
        name: format.name,
        mimeType: format.mimeType,
        buffer: Buffer.from('test content')
      });
      
      await page.waitForTimeout(200);
    }
  });
});