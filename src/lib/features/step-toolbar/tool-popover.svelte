<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import type { ProjectionViewMode } from '$lib/features/commons/types/global';
  import { clickOutside } from '$lib/features/commons/utils/click-outside';
  import { Popover } from 'carbon-components-svelte';
  import type { Snippet } from 'svelte';
  import {
    DOM_IDS,
    CSS_CLASSES,
    POPOVER_DIMENSIONS
  } from './step-toolbar.constants';

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
    const toolbar = document.getElementById(DOM_IDS.STEP_TOOLBAR);
    const target = event.detail?.originalEvent?.target as Node;

    if (!toolbar || !toolbar.contains(target)) {
      globalState.selectedTool = undefined;
    }
  }
</script>

<div
  id={DOM_IDS.TOOL_POPOVER}
  use:clickOutside={{
    enabled: open,
    excludeSelectors: [`#${DOM_IDS.STEP_TOOLBAR}`, `#${DOM_IDS.COLOR_PICKER}`]
  }}
  onoutsideclick={handleOutsideClick}
>
  <Popover
    open={open}
    align={align}
    light={light}
    class={CSS_CLASSES.TOOL_POPOVER}
    style={`--tool-popover-width:${widthCss};--popover-max-height:${POPOVER_DIMENSIONS.MAX_HEIGHT};--dropdown-max-height:${POPOVER_DIMENSIONS.DROPDOWN_MAX_HEIGHT};`}
  >
    <div class={CSS_CLASSES.POPOVER_SCROLL}>
      {@render (content as Snippet | undefined)?.()}
    </div>
  </Popover>
</div>

<style>
  :global(#khartis-tool-popover .bx--popover-contents) {
    width: var(--tool-popover-width) !important;
    max-width: var(--tool-popover-width) !important;
    max-height: var(--popover-max-height);
    overflow: visible;
    padding-bottom: var(--cds-spacing-03);
  }

  .popover-scroll {
    max-height: var(--popover-max-height);
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--cds-spacing-03) var(--cds-spacing-06) var(--cds-spacing-03)
      var(--cds-spacing-06);
  }

  :global(#khartis-tool-popover .bx--list-box__menu) {
    max-height: var(--dropdown-max-height);
    z-index: var(--z-toolbar);
  }
</style>
