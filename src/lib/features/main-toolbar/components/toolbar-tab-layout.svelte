<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
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
  {id}
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
    gap: 32px;
    padding: 16px;
    background-color: var(--cds-layer-01, #f4f4f4);
    min-height: 100%;
  }

  .toolbar-tab > :global(section),
  .toolbar-tab > :global(div) > :global(section) {
    background-color: var(--cds-background, #ffffff);
    padding: 16px;
  }

  :global(.collapsed-content) {
    opacity: 0.7;
    pointer-events: none;
  }
</style>
