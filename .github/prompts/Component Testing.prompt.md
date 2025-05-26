# Write Tests for Khartis Components

Create comprehensive tests for Svelte components using Vitest and Testing Library.

Specify the component and testing scenarios if not already provided.

## Testing Requirements

- Use `@testing-library/svelte` for component testing
- Write test descriptions in English
- Test user interactions, accessibility, and edge cases
- Mock internationalization messages when needed
- Test responsive behavior and different states
- Include snapshot tests for complex UI components

## Test Structure Pattern

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { expect, test, describe, beforeEach, vi } from 'vitest';
import { m } from '$lib/paraglide/messages.js';
import Component from './Component.svelte';

// Mock Paraglide messages
vi.mock('$lib/paraglide/messages.js', () => ({
	m: {
		component_title: () => 'Component Title',
		component_description: ({ param }: { param: string }) => `Description with ${param}`
	}
}));

describe('Component', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('renders with required props', () => {
		render(Component, {
			props: { title: 'Test Title' }
		});

		expect(screen.getByText('Component Title')).toBeInTheDocument();
	});

	test('handles user interaction correctly', async () => {
		const user = userEvent.setup();
		render(Component);

		const button = screen.getByRole('button', { name: /save/i });
		await user.click(button);

		expect(/* expected behavior */).toBeTruthy();
	});

	test('is accessible to screen readers', () => {
		render(Component);

		expect(screen.getByRole('button')).toHaveAttribute('aria-label');
		expect(screen.getByRole('region')).toBeInTheDocument();
	});
});
```

Include E2E tests with Playwright for critical user flows.
