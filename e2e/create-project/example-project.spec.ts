import { test, expect } from '@playwright/test';

test.describe('Try With Example Project', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('#khartis-create-project', { state: 'visible' });
    
    const exampleTab = page.locator('.project-type-selector button').nth(2);
    await exampleTab.click();
    await expect(exampleTab).toHaveAttribute('aria-pressed', 'true');
  });

  test('should display example section header', async ({ page }) => {
    const header = page.locator('h6:has-text("Choisir un exemple")');
    await expect(header).toBeVisible();
    
    const description = page.locator('text=Découvrez les possibilités');
    await expect(description).toBeVisible();
  });

  test('should display graphic primitives section', async ({ page }) => {
    const primitivesText = page.locator('text=Primitives graphiques');
    await expect(primitivesText).toBeVisible();
  });

  test('should display filter tags', async ({ page }) => {
    const tags = [
      'Tous',
      'Symboles',
      'Polygones', 
      'Lignes',
      'Textes',
      'Hybrides'
    ];
    
    for (const tagText of tags) {
      const tag = page.locator(`.bx--tag:has-text("${tagText}")`);
      await expect(tag).toBeVisible();
    }
  });

  test('should have "Tous" tag selected by default', async ({ page }) => {
    const allTag = page.locator('.bx--tag[type="high-contrast"]:has-text("Tous")');
    await expect(allTag).toBeVisible();
  });

  test('should display example project cards', async ({ page }) => {
    const projectCards = page.locator('#khartis-try-with-example .flex.gap-5 > div').filter({ has: page.locator('text=Title Lorem') });
    const count = await projectCards.count();
    expect(count).toBe(10);
    
    const firstCard = projectCards.first();
    await expect(firstCard).toBeVisible();
  });

  test('should select example card on click', async ({ page }) => {
    const projectCards = page.locator('#khartis-try-with-example .flex.gap-5 > div').filter({ has: page.locator('text=Title Lorem') });
    const firstCard = projectCards.first();
    
    await firstCard.click();
    await page.waitForTimeout(200);
    
    const selectedCard = page.locator('[class*="selected"]').first();
    await expect(selectedCard).toBeVisible();
  });

  test('should display gray variant cards', async ({ page }) => {
    const grayCards = page.locator('[variant="gray"]');
    const count = await grayCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should scroll horizontally through example cards', async ({ page }) => {
    const scrollContainer = page.locator('#khartis-try-with-example .flex.gap-5.overflow-x-auto');
    await expect(scrollContainer).toBeVisible();
    
    const lastCard = page.locator('#khartis-try-with-example .flex.gap-5 > div').last();
    await lastCard.scrollIntoViewIfNeeded();
    await expect(lastCard).toBeInViewport();
  });

  test('should click filter tags', async ({ page }) => {
    const symbolsTag = page.locator('.bx--tag:has-text("Symboles")');
    await symbolsTag.click();
    await page.waitForTimeout(200);
    
    const polygonsTag = page.locator('.bx--tag:has-text("Polygones")');
    await polygonsTag.click();
    await page.waitForTimeout(200);
    
    const linesTag = page.locator('.bx--tag:has-text("Lignes")');
    await linesTag.click();
    await page.waitForTimeout(200);
  });

  test('should handle deselection of example card', async ({ page }) => {
    const projectCards = page.locator('#khartis-try-with-example .flex.gap-5 > div').filter({ has: page.locator('text=Title Lorem') });
    const firstCard = projectCards.first();
    
    await firstCard.click();
    await page.waitForTimeout(200);
    
    await firstCard.click();
    await page.waitForTimeout(200);
  });

  test('should display footer content in cards', async ({ page }) => {
    const footerText = page.locator('#khartis-try-with-example text=Lorem ipsum').first();
    await expect(footerText).toBeVisible();
  });

  test('should handle multiple card selection', async ({ page }) => {
    const projectCards = page.locator('#khartis-try-with-example .flex.gap-5 > div').filter({ has: page.locator('text=Title Lorem') });
    
    const firstCard = projectCards.nth(0);
    const secondCard = projectCards.nth(1);
    
    await firstCard.click();
    await page.waitForTimeout(200);
    
    await secondCard.click();
    await page.waitForTimeout(200);
  });
});