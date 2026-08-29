<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  let { children } = $props();
</script>

<div id="khartis-tools-list-container" class="tools-section">
  <header class="tools-header">
    <span class="tools-title">{m.step_toolbar_tools()}</span>
  </header>

  {@render children()}
</div>

<style>
  .tools-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-top: var(--cds-spacing-03);
    padding-bottom: var(--cds-spacing-03);
  }

  .tools-title {
    padding-bottom: var(--cds-spacing-02);
  }

  header span {
    color: var(--cds-text-secondary);
    font-weight: bold;
    font-size: 14px;
  }

  .tools-section {
    position: relative;
    border-top: 1px solid var(--cds-ui-01);
    padding-top: var(--cds-spacing-03);
    padding-bottom: var(--cds-spacing-03);
    display: flex;
    flex-direction: column;
  }

  #khartis-tools-list-container :global(.tools-grid) {
    display: grid;
    row-gap: var(--cds-spacing-03);
  }

  #khartis-tools-list-container :global(.tools-grid .bx--row) {
    margin-top: 0;
    margin-bottom: 0;
  }

  #khartis-tools-list-container :global(.tools-grid .bx--col) {
    padding-top: 0;
    padding-bottom: 0;
  }

  #khartis-tools-list-container :global(.tool-button-wrapper) {
    position: relative;
    display: inline-block;
  }

  #khartis-tools-list-container :global(.notification-badge) {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 8px;
    height: 8px;
    background-color: var(--cds-support-error, #da1e28);
    border-radius: 50%;
    pointer-events: none;
  }
</style>
