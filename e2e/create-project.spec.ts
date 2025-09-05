import { test, expect } from '@playwright/test';

test.describe('Create Project Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should open create project modal when triggered', async ({ page }) => {
    const createProjectModal = page.locator('#khartis-create-project');
    
    await expect(createProjectModal).toBeVisible({ timeout: 10000 });
    
    const modalTitle = page.locator('.bx--modal-header__heading');
    await expect(modalTitle).toBeVisible();
    await expect(modalTitle).toContainText('Bienvenue');
  });

  test('should display three project tabs', async ({ page }) => {
    await page.waitForSelector('#khartis-create-project', { state: 'visible' });
    
    const projectTabs = page.locator('.project-type-selector button');
    await expect(projectTabs).toHaveCount(3);
    
    const firstTab = projectTabs.nth(0);
    const secondTab = projectTabs.nth(1);
    const thirdTab = projectTabs.nth(2);
    
    await expect(firstTab).toContainText('Nouveau projet');
    await expect(secondTab).toContainText('Ouvrir un projet');
    await expect(thirdTab).toContainText('Essayer avec un exemple');
  });

  test('should switch between tabs when clicked', async ({ page }) => {
    await page.waitForSelector('#khartis-create-project', { state: 'visible' });
    
    const projectTabs = page.locator('.project-type-selector button');
    
    await projectTabs.nth(0).click();
    await expect(projectTabs.nth(0)).toHaveAttribute('aria-pressed', 'true');
    
    await projectTabs.nth(1).click();
    await expect(projectTabs.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(projectTabs.nth(0)).toHaveAttribute('aria-pressed', 'false');
    
    await projectTabs.nth(2).click();
    await expect(projectTabs.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(projectTabs.nth(1)).toHaveAttribute('aria-pressed', 'false');
  });

  test('should show new project content when first tab is selected', async ({ page }) => {
    await page.waitForSelector('#khartis-create-project', { state: 'visible' });
    
    const firstTab = page.locator('.project-type-selector button').nth(0);
    await firstTab.click();
    
    const newProjectContent = page.locator('.tab-content');
    await expect(newProjectContent).toBeVisible();
    
    const projectNameInput = page.locator('input[placeholder*="nom du projet"]');
    await expect(projectNameInput).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await page.waitForSelector('#khartis-create-project', { state: 'visible' });
    
    const modal = page.locator('.bx--modal-container');
    await expect(modal).toBeVisible();
    
    const projectSelector = page.locator('.project-type-selector');
    const computedStyle = await projectSelector.evaluate((el) => {
      return window.getComputedStyle(el);
    });
    
    expect(computedStyle.flexDirection).toBe('column');
  });

  test('modal should not close on outside click', async ({ page }) => {
    await page.waitForSelector('#khartis-create-project', { state: 'visible' });
    
    await page.mouse.click(50, 50);
    
    const modal = page.locator('#khartis-create-project');
    await expect(modal).toBeVisible();
  });

  test('should have proper ARIA labels for accessibility', async ({ page }) => {
    await page.waitForSelector('#khartis-create-project', { state: 'visible' });
    
    const projectSelector = page.locator('.project-type-selector');
    await expect(projectSelector).toHaveAttribute('aria-label', 'selectable tiles');
    await expect(projectSelector).toHaveAttribute('role', 'group');
    
    const buttons = projectSelector.locator('button');
    const firstButton = buttons.nth(0);
    await expect(firstButton).toHaveAttribute('aria-pressed');
  });
});