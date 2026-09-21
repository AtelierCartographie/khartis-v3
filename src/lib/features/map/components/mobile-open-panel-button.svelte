<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/stores/global.svelte';
  import { m } from '$lib/paraglide/messages';
  import { ChevronLeft } from 'carbon-icons-svelte';
</script>

{#if globalState.isMobileView && !globalState.isMobileToolbarOpen}
  <div class="open-panel-button-wrapper">
    <IconButton
      kind="primary"
      size="small"
      icon={ChevronLeft}
      iconDescription={m.open_panel_tooltip()}
      on:click={() => globalActions.openMobileToolbar()}
    />
  </div>
{/if}

<style>
  .open-panel-button-wrapper {
    position: fixed;
    top: calc(var(--cds-header-height) + var(--cds-spacing-03));
    right: var(--cds-spacing-03);
    z-index: var(--z-mobile-open-button);
  }

  .open-panel-button-wrapper :global(.bx--btn) {
    min-height: var(--kh-size-control-md);
    padding: 0 var(--cds-spacing-03);
  }
</style>
