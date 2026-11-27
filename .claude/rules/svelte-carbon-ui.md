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

## Carbon v11 tokens and surfaces

- Carbon 0.114 follows Carbon v11. Read v11 token names (`--cds-text-primary`, `--cds-layer-01`, `--cds-border-subtle-00`…). The v10 names (`--cds-ui-01`, `--cds-text-02`, `--cds-interactive-01`…) are no longer declared and resolve to nothing, without an error.
- `global.css` overrides the brand tokens in both themes (`--cds-button-*`, `--cds-background-brand`, `--cds-interactive`, `--cds-link-*`, `--cds-focus*`). Carbon components read `--cds-layer-01` themselves: Khartis's white control surface is `--khartis-control-surface-background`, not an override of `--cds-layer-01`.
- `light` no longer exists: a field that sits on another surface goes in a `<Layer>`. Fields in a modal already sit on a layer.
- A field always stands out from the surface that carries it: grey on a white surface, white on a grey one. Carbon fields read the contextual `--cds-field` (and `--cds-field-hover`), which is `field-01` (grey) by default. A hand-built field reads the same tokens, never `--cds-field-01`, `--cds-field-02` or `--khartis-control-surface-background`, and is never transparent. A grey surface that carries fields declares `--cds-field: var(--cds-field-02)` and `--cds-field-hover: var(--cds-field-hover-02)` once (the colour menu of `color-picker.svelte`, the join table); its fields then follow without an override of their own.
- A transactional modal stays open on an outside click unless it sets `preventCloseOnClickOutside={false}`, as Khartis's modals do. Notifications default to `role="status"`; errors pass `role="alert"`.

## Inline notifications

Every `InlineNotification` is `lowContrast`. `global.css` takes away Carbon's width limits and margins: a notification spans its container, and the container spaces it (a flex `gap`, `.kh-notification-stack` for several in a row). A modal body keeps a margin around it. The usage sets the rest:

| Usage                                           | `kind`                  | Close button                         | Text                                                            |
| ----------------------------------------------- | ----------------------- | ------------------------------------ | --------------------------------------------------------------- |
| State of a panel, shown while a condition holds | `info`, `warning`       | none: it leaves with its condition   | `subtitle`, plus a `title` when there is a heading and a detail |
| Error after a user action                       | `error`, `role="alert"` | yes, and closing clears the error    | `title` names the failure, `subtitle` says why or what to do    |
| Confirmation of an action                       | `success`               | yes                                  | `subtitle`                                                      |
| Suggestion the user may set aside               | `info`                  | yes, and the dismissal is remembered | `title` and `subtitle`                                          |

A one-sentence message goes in `subtitle`: a `title` alone sets a whole sentence in bold.

## Snippets, portals, click-outside

- Use `Snippet` with `{@render}` instead of `<slot>`. Overlays and portals render at the component root, never inside a snippet.
- Floating UI uses the house helpers `use:portal` (`portal.ts`) and `use:clickOutside` (`click-outside.ts`). Both clean up in `destroy()`. The `setTimeout(…, 0)` before the outside-click listener is attached is deliberate: it avoids catching the opening click.
- Custom controls (`simple-checkbox`, `simple-radio`, `switch`, `compact-number-input`, `expandable-section`) carry explicit `aria-label`, `aria-checked` or `aria-expanded`, work from the keyboard, and close on `Esc`.

## Effects

Every `$effect` that subscribes or observes returns a cleanup. `untrack()` breaks accidental dependencies. An effect that writes a value it also reads loops, and one that fetches on every `open` toggle floods the network.

## Components are imported statically

A dynamic `import('./Foo.svelte')` of a clicked or rendered component triggers a full app reload: a Vite full reload in dev, service-worker recovery in production. Application code has no dynamic component import; only tests use them, for isolation.
