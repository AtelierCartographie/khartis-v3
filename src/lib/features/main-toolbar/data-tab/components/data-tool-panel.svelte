<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import * as m from '$lib/paraglide/messages';
  import { Button } from 'carbon-components-svelte';
  import { Close } from 'carbon-icons-svelte';
  import type { Snippet } from 'svelte';
  import { fly } from 'svelte/transition';
  import { dataToolsStore } from '../data-tools.store.svelte';

  interface Props {
    title: string;
    children: Snippet;
  }

  let { title, children }: Props = $props();

  const toolbarWidth = $derived.by(() => {
    switch (globalState.toolbarState) {
      case ToolbarState.Collapsed:
        return '50px';

      case ToolbarState.Compact:
        return '400px';

      default:
        return '50vw';
    }
  });
</script>

<aside
  class="data-tool-panel"
  style:right={toolbarWidth}
  in:fly={{ x: 20, duration: 200 }}
  out:fly={{ x: 20, duration: 150 }}
>
  <header class="panel-header">
    <h3>{title}</h3>
    <Button
      kind="ghost"
      size="small"
      icon={Close}
      iconDescription={m.data_tool_close()}
      on:click={() => dataToolsStore.closeTool()}
    />
  </header>
  <div class="panel-content">
    {@render children()}
  </div>
</aside>

<style>
  .data-tool-panel {
    position: fixed;
    right: 50vw;
    top: 50%;
    transform: translateY(-50%);
    width: 280px;
    background: var(--cds-ui-02);
    border: 1px solid var(--cds-border-subtle);
    z-index: 100;
    display: flex;
    flex-direction: column;
    transition: right 0.2s ease-out;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-04);
    border-bottom: 1px solid var(--cds-border-subtle);
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .panel-content {
    padding: var(--cds-spacing-04);
  }
</style>
