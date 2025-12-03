<script lang="ts">
  import { Button } from 'carbon-components-svelte';
  import { Close } from 'carbon-icons-svelte';
  import type { Snippet } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { dataToolsStore } from '../data-tools.store.svelte';

  interface Props {
    title: string;
    children: Snippet;
  }

  let { title, children }: Props = $props();
</script>

<aside class="data-tool-panel">
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
    left: 72px;
    top: 64px;
    width: 280px;
    max-height: calc(100vh - 128px);
    background: var(--cds-ui-01);
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    z-index: 100;
    display: flex;
    flex-direction: column;
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
    overflow-y: auto;
    flex: 1;
  }
</style>
