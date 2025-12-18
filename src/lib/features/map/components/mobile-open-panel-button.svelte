<script lang="ts">
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
  import { Button } from 'carbon-components-svelte';
  import { ChevronLeft } from 'carbon-icons-svelte';
</script>

{#if globalState.isMobileView && !globalState.isMobileToolbarOpen}
  <Button
    kind="secondary"
    size="small"
    icon={ChevronLeft}
    iconDescription="Ouvrir le panneau"
    on:click={() => globalActions.openMobileToolbar()}
  />
{/if}

<style>
  :global(.bx--btn--secondary.bx--btn--sm) {
    position: fixed;
    top: calc(var(--cds-header-height) + var(--cds-spacing-03));
    right: var(--cds-spacing-03);
    z-index: 800;
    min-height: 32px;
    padding: 0 var(--cds-spacing-03);
  }
</style>
