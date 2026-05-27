---
paths:
  - 'src/**/*.svelte'
  - 'src/lib/features/commons/utils/portal.ts'
  - 'src/lib/features/commons/utils/click-outside.ts'
---

# Svelte 5 + Carbon UI traps

Carbon (`carbon-components-svelte`) ships as Svelte 4 source, so some events and bindings misfire under Svelte 5 runes. `CLAUDE.md` already lists three (`<Slider>` `on:input` only, `<Checkbox>` `on:change` only, `<RadioButtonGroup>` early-return). The ones below are the others that actually bite in this codebase.

## Carbon events & bindings

- **Prefer `value={...}` + an explicit callback over `bind:value`** on Carbon inputs; two-way binding is unreliable on these Svelte-4 components. `bind:this` and `<Modal bind:open>` are safe.
- **Dropdown / ComboBox**: handle `on:select` and read `e.detail.selectedId` — not `on:change`, not `bind`.
- **TextInput / NumberInput**: handle `on:input`; `e.detail` is heterogeneous (`string | number | { value }`), so parse it defensively (see the `slider-with-input.svelte` / `compact-number-input.svelte` wrappers) and debounce before firing a DuckDB recompute.
- **Modal**: `bind:open` + `on:click:button--primary` / `on:click:button--secondary` / `on:close`; update state **before** setting `open = false`.
- A `patches/carbon-components-svelte.patch` is applied — understand why before bumping Carbon, and re-check these traps after any upgrade.

## Snippets, portals, click-outside

- Use `Snippet` + `{@render}` instead of `<slot>`. Render overlays/portals at the **component root**, never inside a snippet.
- For floating UI use the house helpers `use:portal` (`portal.ts`) and `use:clickOutside` (`click-outside.ts`); both must clean up in their `destroy()`. The `setTimeout(…, 0)` before attaching the outside-click listener is deliberate (it avoids catching the opening click) — don't remove it.
- Custom controls (`simple-checkbox`, `simple-radio`, `switch`, `compact-number-input`, `expandable-section`) need explicit `aria-label` / `aria-checked` / `aria-expanded`, keyboard operability, and `Esc` to close.

## Effects

- Give every `$effect` that subscribes or observes a cleanup return; use `untrack()` to break accidental dependencies; never let an effect write a value it also reads (render loop) or fire a fetch on every `open` toggle.

## Never lazy-import a component

- Do **not** `import('./Foo.svelte')` dynamically. A dynamic import of a clicked/rendered component triggers a full app reload (Vite full reload in dev, service-worker recovery in prod). Import components statically — the repo currently has zero dynamic component imports; keep it that way.
