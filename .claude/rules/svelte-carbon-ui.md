---
paths:
  - 'src/**/*.svelte'
  - 'src/lib/features/commons/utils/portal.ts'
  - 'src/lib/features/commons/utils/click-outside.ts'
---

# Svelte 5 with Carbon components

Carbon (`carbon-components-svelte`) ships as Svelte 4 source, so some events and bindings misfire under Svelte 5 runes. These are the ones that bite in this codebase.

## Carbon events and bindings

- **Slider**: handle `on:input` only, never `on:change`.
- **Checkbox, Toggle**: handle `on:change` only, never `on:check`, and pass the state down instead of `bind:checked`.
- **RadioButtonGroup**: `on:change` also fires without a change, so return early when the value is the same.
- **Inputs in general**: prefer `value={...}` with an explicit callback over `bind:value`, which is unreliable on these Svelte 4 components. `bind:this` and `<Modal bind:open>` are safe.
- **Dropdown, ComboBox**: handle `on:select` and read `e.detail.selectedId`, not `on:change` and not a binding.
- **ComboBox with late `items`**: the dropdown list reacts to `items`, but `selectedItem` is resolved only when `selectedId` changes, never when `items` arrive after mount. A ComboBox mounted before its items are ready shows an empty field until it is remounted. Force the remount with `{#key <signature>}`, where the signature is a stable string that changes only when the option set really changes (for example `Array.from(valueSet).sort().join(...)`). Keying on the array reference remounts on every render and leaves the field blank. See `joinedValueSignature` in `join-assisted-section.svelte`.
- **TextInput, NumberInput**: handle `on:input`. `e.detail` is heterogeneous (`string | number | { value }`), so parse it defensively as the `slider-with-input.svelte` and `compact-number-input.svelte` wrappers do, and debounce before a DuckDB recompute.
- **Modal**: `bind:open` with `on:click:button--primary`, `on:click:button--secondary` and `on:close`. Update state before setting `open = false`.
- Button colors come from the Carbon tokens overridden in `commons/assets/styles/global.css`, including the modal cancel button. A dialog does not restyle its own buttons.
- `patches/carbon-components-svelte.patch` is applied. Understand why before bumping Carbon, and re-check these traps after an upgrade.

## Snippets, portals, click-outside

- Use `Snippet` with `{@render}` instead of `<slot>`. Overlays and portals render at the component root, never inside a snippet.
- Floating UI uses the house helpers `use:portal` (`portal.ts`) and `use:clickOutside` (`click-outside.ts`). Both clean up in `destroy()`. The `setTimeout(…, 0)` before the outside-click listener is attached is deliberate: it avoids catching the opening click.
- Custom controls (`simple-checkbox`, `simple-radio`, `switch`, `compact-number-input`, `expandable-section`) carry explicit `aria-label`, `aria-checked` or `aria-expanded`, work from the keyboard, and close on `Esc`.

## Effects

Every `$effect` that subscribes or observes returns a cleanup. `untrack()` breaks accidental dependencies. An effect that writes a value it also reads loops, and one that fetches on every `open` toggle floods the network.

## Components are imported statically

A dynamic `import('./Foo.svelte')` of a clicked or rendered component triggers a full app reload: a Vite full reload in dev, service-worker recovery in production. Application code has no dynamic component import; only tests use them, for isolation.
