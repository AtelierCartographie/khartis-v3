<script lang="ts">
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import clsx from 'clsx';
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    id?: string;
  }

  let { children, id }: Props = $props();
</script>

<div
  id={id}
  class={clsx(
    'toolbar-tab',
    globalState.toolbarState === ToolbarState.Collapsed && 'collapsed-content'
  )}
>
  {@render children()}
</div>

<style>
  .toolbar-tab {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-section);
    padding: var(--kh-pad-panel);
    background-color: var(
      --khartis-main-toolbar-background,
      var(--cds-ui-01, #f4f4f4)
    );
    min-height: 100%;
  }

  .toolbar-tab > :global(section),
  .toolbar-tab > :global(div) > :global(section) {
    background-color: var(
      --khartis-main-toolbar-surface-background,
      var(--cds-ui-02, #ffffff)
    );
    padding: var(--kh-pad-panel);
  }

  :global(.collapsed-content) {
    opacity: 0.7;
    pointer-events: none;
  }
</style>
