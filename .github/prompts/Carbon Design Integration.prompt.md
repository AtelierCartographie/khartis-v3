# Carbon Design System Integration

Your goal is to properly integrate Carbon Design System components with TailwindCSS in Khartis.

## Carbon Component Usage

### Import Pattern

```svelte
<script lang="ts">
	import { Button, TextInput, Modal, DataTable, Accordion } from 'carbon-components-svelte';
</script>
```

### Theme Configuration

```svelte
<!-- +layout.svelte -->
<script lang="ts">
	import { Theme } from 'carbon-components-svelte';
	import 'carbon-components-svelte/css/all.css';

	let theme = $state('white'); // or 'g10', 'g90', 'g100'
</script>

<Theme bind:theme />
```

### Combining Carbon + TailwindCSS

```svelte
<!-- Use Carbon for components, Tailwind for layout -->
<div class="mx-auto max-w-4xl space-y-6 p-6">
	<DataTable>
		<svelte:fragment slot="title">
			{m.table_title()}
		</svelte:fragment>
	</DataTable>

	<Button kind="primary" class="w-full">
		{m.submit_button()}
	</Button>
</div>
```

### Accessibility Features

Carbon components include built-in accessibility:

- Use `assistiveText` prop for screen readers
- Use `iconDescription` for icon buttons
- Leverage built-in ARIA attributes

### Common Carbon Components

- `Button` (primary, secondary, ghost, danger)
- `TextInput`, `PasswordInput`, `Select`
- `Modal`, `Tooltip`, `Loading`
- `DataTable`, `Pagination`
- `Accordion`, `Tabs`, `Tag`

Please specify which Carbon component or integration you need help with.
