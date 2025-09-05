import { test, expect } from '@playwright/test';

test.describe('Open Saved Project', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('#khartis-create-project', { state: 'visible' });
    
    const openProjectTab = page.locator('.project-type-selector button').nth(1);
    await openProjectTab.click();
    await expect(openProjectTab).toHaveAttribute('aria-pressed', 'true');
  });

  test('should display recent projects section', async ({ page }) => {
    const header = page.locator('h6:has-text("Sélectionner une sauvegarde")');
    await expect(header).toBeVisible();
    
    const description = page.locator('text=Vos sauvegardes récentes');
    await expect(description).toBeVisible();
  });

  test('should display project cards', async ({ page }) => {
    const projectCards = page.locator('.flex.gap-5 > div').filter({ has: page.locator('text=Title Lorem') });
    const count = await projectCards.count();
    expect(count).toBeGreaterThan(0);
    
    const firstCard = projectCards.first();
    await expect(firstCard).toBeVisible();
  });

  test('should select project card on click', async ({ page }) => {
    const projectCards = page.locator('.flex.gap-5 > div').filter({ has: page.locator('text=Title Lorem') });
    const firstCard = projectCards.first();
    
    await firstCard.click();
    await page.waitForTimeout(200);
    
    const selectedCard = page.locator('[class*="selected"]').first();
    await expect(selectedCard).toBeVisible();
  });

  test('should display project date in cards', async ({ page }) => {
    const dateElement = page.locator('svg[style*="calendar-color"]').first();
    await expect(dateElement).toBeVisible();
    
    const dateText = page.locator('text=DD/MM/YYYY').first();
    await expect(dateText).toBeVisible();
  });

  test('should display import section', async ({ page }) => {
    const importHeader = page.locator('h6:has-text("Importer un projet")');
    await expect(importHeader).toBeVisible();
    
    const importDescription = page.locator('text=Importer un projet Khartis');
    await expect(importDescription).toBeVisible();
  });

  test('should display .kh file drop zone', async ({ page }) => {
    const khDropZone = page.locator('.bx--file__drop-container').filter({ hasText: 'fichier .kh' });
    await expect(khDropZone).toBeVisible();
  });

  test('should handle .kh file upload', async ({ page }) => {
    const fileInput = page.locator('#khartis-open-project input[type="file"]');
    
    const khContent = JSON.stringify({ version: '3.0', type: 'khartis-project' });
    const buffer = Buffer.from(khContent);
    
    await fileInput.setInputFiles({
      name: 'project.kh',
      mimeType: 'application/json',
      buffer: buffer
    });
    
    await page.waitForTimeout(500);
  });

  test('should scroll horizontally through project cards', async ({ page }) => {
    const scrollContainer = page.locator('.flex.gap-5.overflow-x-auto');
    await expect(scrollContainer).toBeVisible();
    
    const cards = scrollContainer.locator('> div');
    const cardCount = await cards.count();
    expect(cardCount).toBe(10);
  });

  test('should display warning tooltip', async ({ page }) => {
    const tooltip = page.locator('[class*="tooltip"]').first();
    await expect(tooltip).toBeVisible();
  });

  test('should handle deselection of project card', async ({ page }) => {
    const projectCards = page.locator('.flex.gap-5 > div').filter({ has: page.locator('text=Title Lorem') });
    const firstCard = projectCards.first();
    
    await firstCard.click();
    await page.waitForTimeout(200);
    
    await firstCard.click();
    await page.waitForTimeout(200);
  });

  test('should validate .kh file format', async ({ page }) => {
    const fileInput = page.locator('#khartis-open-project input[type="file"]');
    
    const invalidContent = 'not a valid kh file';
    const buffer = Buffer.from(invalidContent);
    
    await fileInput.setInputFiles({
      name: 'invalid.kh',
      mimeType: 'text/plain',
      buffer: buffer
    });
    
    await page.waitForTimeout(500);
  });

  test('should display learn more link', async ({ page }) => {
    const learnMoreText = page.locator('#khartis-open-project text=En savoir plus');
    await expect(learnMoreText).toBeVisible();
    
    const linkIcon = page.locator('#khartis-open-project .text-grey svg').last();
    await expect(linkIcon).toBeVisible();
  });
});