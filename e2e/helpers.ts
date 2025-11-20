import { expect, type Page } from '@playwright/test';

const MODAL_CONTAINER_SELECTOR = '#khartis-create-project .bx--modal-container';

export async function waitForAppInitialization(page: Page, timeout = 10000) {
  await page.waitForSelector('.loading-container', {
    state: 'hidden',
    timeout
  });
  await page.waitForTimeout(500);
}

export async function waitForModalVisible(page: Page, timeout = 10000) {
  await waitForAppInitialization(page, timeout);
  const modal = page.locator(MODAL_CONTAINER_SELECTOR);
  await expect(modal).toBeVisible({ timeout });
  return modal;
}

export { MODAL_CONTAINER_SELECTOR };
