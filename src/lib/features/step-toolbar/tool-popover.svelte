<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import type { ProjectionViewMode } from '$lib/features/commons/types/global';
  import { clickOutside } from '$lib/features/commons/utils/click-outside';
  import { logger, LogCategory } from '$lib/features/commons/utils/logger';
  import { Popover } from 'carbon-components-svelte';
  import type { Snippet } from 'svelte';

  const {
    open = false,
    viewMode = 'list' as ProjectionViewMode,
    light = true,
    align = 'right-top' as
      | 'top'
      | 'top-left'
      | 'top-right'
      | 'bottom'
      | 'bottom-left'
      | 'bottom-right'
      | 'left'
      | 'left-bottom'
      | 'left-top'
      | 'right'
      | 'right-bottom'
      | 'right-top',
    listWidth = 340,
    gridWidth = '50vw',
    content
  } = $props();

  const widthCss = $derived(viewMode === 'grid' ? gridWidth : `${listWidth}px`);

  function handleOutsideClick(event: CustomEvent) {
    const toolbar = document.getElementById('khartis-step-toolbar');
    const target = event.detail?.originalEvent?.target as Node;

    if (!toolbar || !toolbar.contains(target)) {
      globalState.selectedTool = undefined;
    }
  }
</script>

<div
  id="khartis-tool-popover"
  use:clickOutside={{
    enabled: open,
    excludeSelectors: ['#khartis-step-toolbar', '#khartis-color-picker']
  }}
  onoutsideclick={handleOutsideClick}
>
  <Popover
    open={open}
    align={align}
    light={light}
    class="tool-popover"
    style={`--tool-popover-width:${widthCss};`}
  >
    <div class="popover-scroll">
      {@render (content as Snippet | undefined)?.()}
    </div>
  </Popover>
</div>

<style>
  #khartis-tool-popover :global(.bx--popover-contents) {
    width: var(--tool-popover-width) !important;
    max-width: var(--tool-popover-width) !important;
    max-height: 70vh;
    overflow: visible;
    padding-bottom: var(--cds-spacing-03);
  }

  .popover-scroll {
    max-height: 70vh;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--cds-spacing-03) var(--cds-spacing-06) var(--cds-spacing-03)
      var(--cds-spacing-06);
  }

  #khartis-tool-popover :global(.bx--list-box__menu) {
    max-height: 11rem;
    z-index: 1000;
  }
</style>
