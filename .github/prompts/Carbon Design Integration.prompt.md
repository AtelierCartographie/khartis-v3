# Carbon Design System Integration

Your goal is to properly integrate Carbon Design System components in Khartis.

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
