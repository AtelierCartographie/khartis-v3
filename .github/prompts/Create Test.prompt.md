# Create Test for Khartis Component

Your goal is to create comprehensive tests for Svelte components using Vitest and Testing Library.

## Test Requirements

- Use `@testing-library/svelte` for component testing
- Write test descriptions in English
- Test accessibility features
- Test internationalization if applicable
- Test user interactions and state changes
- Use proper TypeScript types

## Test Structure

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { expect, test, describe, vi } from 'vitest';
import Component from './Component.svelte';

describe('Component', () => {
	test('should render with required props', () => {
		render(Component, { title: 'Test Title' });

		expect(screen.getByText('Test Title')).toBeInTheDocument();
	});

	test('should handle user interactions', async () => {
		const mockFn = vi.fn();
		render(Component, { onClick: mockFn });

		await fireEvent.click(screen.getByRole('button'));

		expect(mockFn).toHaveBeenCalledOnce();
	});

	test('should be accessible', () => {
		render(Component, { title: 'Accessible Title' });

		expect(screen.getByRole('button')).toHaveAccessibleName();
	});
});
```

## E2E Test Structure (Playwright)

```ts
import { test, expect } from '@playwright/test';

test('should navigate and interact correctly', async ({ page }) => {
	await page.goto('/');

	await page.click('[data-testid="navigation-button"]');

	await expect(page).toHaveURL('/dashboard');
});
```

Please specify which component or functionality needs testing.
