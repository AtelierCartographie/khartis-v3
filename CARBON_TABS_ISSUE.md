# [Svelte 5] `Tabs` causes `effect_update_depth_exceeded` error

## Description

The `Tabs` component causes an infinite loop (`effect_update_depth_exceeded`) when used with Svelte 5, even without binding the `selected` prop.

This is the same issue that was fixed for the `Select` component in #2107 / PR #2108 (v0.87.7), but the fix was never applied to `Tabs`.

## Reproduction

**Environment:**
- carbon-components-svelte: 0.93.0
- svelte: 5.x
- sveltekit: 2.x

**Minimal reproduction:**

```svelte
<script>
  import { Modal, Tabs, Tab, TabContent } from 'carbon-components-svelte';

  let open = $state(false);
</script>

<button onclick={() => open = true}>Open Modal</button>

<Modal {open} on:close={() => open = false}>
  <Tabs>
    <Tab label="Tab 1" />
    <Tab label="Tab 2" />
    <svelte:fragment slot="content">
      <TabContent>Content 1</TabContent>
      <TabContent>Content 2</TabContent>
    </svelte:fragment>
  </Tabs>
</Modal>
```

**Error:**
```
Uncaught Svelte error: effect_update_depth_exceeded
Maximum update depth exceeded. This typically indicates that an effect reads and writes the same piece of state
```

## Root Cause

In `src/Tabs/Tabs.svelte`, there's a reactive loop between:

1. **Line 220** - Reactive statement:
   ```javascript
   $: currentIndex = selected;
   ```

2. **Line 207** - In `afterUpdate()`:
   ```javascript
   selected = currentIndex;
   ```

This creates a cycle:
1. `selected` changes → `$: currentIndex = selected` triggers
2. `currentIndex` changes → `afterUpdate()` runs
3. `afterUpdate()` sets `selected = currentIndex`
4. Go back to step 1

In Svelte 5, `$:` reactive statements are converted to effects, which makes this bidirectional update pattern cause infinite loops.

## Proposed Fix

Apply the same fix that was used for `Select` in PR #2108:

```diff
  afterUpdate(() => {
    // ... existing code ...

-   selected = currentIndex;
+   if (selected !== currentIndex) {
+     selected = currentIndex;
+   }

    if (prevIndex > -1 && prevIndex !== currentIndex) {
      dispatch("change", currentIndex);
    }

    prevIndex = currentIndex;
  });
```

This conditional check prevents unnecessary updates when the value hasn't actually changed, breaking the cycle.

## Workarounds

Until this is fixed, users can:

1. **Use `patch-package`** to apply the fix locally:
   ```bash
   yarn add -D patch-package postinstall-postinstall
   # Manually edit node_modules/carbon-components-svelte/src/Tabs/Tabs.svelte
   npx patch-package carbon-components-svelte
   ```

2. **Conditionally render Tabs** only when the parent container is visible:
   ```svelte
   <Modal {open}>
     {#if open}
       <Tabs>...</Tabs>
     {/if}
   </Modal>
   ```

3. **Create a custom Tabs component** that uses Svelte 5 patterns.

## Related Issues

- #2107 - `[Svelte 5] Select causes effect_update_depth_exceeded error when binding to same object` (Fixed in v0.87.7)
- PR #2108 - Fix for Select component

## Additional Context

This issue affects any usage of `Tabs` in a Svelte 5 application, particularly when:
- The component is mounted inside a Modal or other container
- The parent component uses `$state` for reactive variables
- Multiple reactive updates occur during initialization

The error can occur even at app initialization if Tabs is mounted (even when not visible), because Svelte 5's effect system tracks all reactive dependencies more strictly than Svelte 4.
