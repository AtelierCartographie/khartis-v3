<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import type { ProjectionViewMode } from '$lib/features/commons/types/global';
  import { clickOutside } from '$lib/features/commons/utils/click-outside';
  import { Popover } from 'carbon-components-svelte';
  import { tick } from 'svelte';
  import type { Snippet } from 'svelte';
  import {
    DOM_IDS,
    CSS_CLASSES,
    POPOVER_DIMENSIONS
  } from './step-toolbar.constants';
  import { getAnnotationsState } from './tools/annotations/annotations.store.svelte';
  import { shouldBlockToolClose } from './tools/tool-close-guard';

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
    listWidth = 320,
    gridWidth = '50vw',
    content
  } = $props();

  const widthCss = $derived(viewMode === 'grid' ? gridWidth : `${listWidth}px`);
  let popoverRoot: HTMLDivElement | null = null;
  let computedTopOffset = $state(0);

  function syncCenteredOffset(): void {
    if (!open || align !== 'right-top') {
      computedTopOffset = 0;
      return;
    }

    const toolbar = document.getElementById(DOM_IDS.STEP_TOOLBAR);
    const popover = popoverRoot?.querySelector('.bx--popover');

    if (
      !(toolbar instanceof HTMLElement) ||
      !(popover instanceof HTMLElement)
    ) {
      computedTopOffset = 0;
      return;
    }

    const toolbarRect = toolbar.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();

    computedTopOffset = Math.round(
      (toolbarRect.height - popoverRect.height) / 2
    );
  }

  function handleOutsideClick(event: CustomEvent) {
    if (
      shouldBlockToolClose(
        globalState.selectedTool,
        getAnnotationsState().isDrawingMode
      )
    ) {
      return;
    }

    // Drag-and-drop interactions can end with a synthetic click target
    // outside the popover while the dragged clone still exists.
    if (document.getElementById('dnd-action-dragged-el')) return;

    const toolbar = document.getElementById(DOM_IDS.STEP_TOOLBAR);
    const target = event.detail?.originalEvent?.target as Node;

    if (!toolbar || !toolbar.contains(target)) {
      globalState.selectedTool = undefined;
    }
  }

  $effect(() => {
    if (!open) return;

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (
          shouldBlockToolClose(
            globalState.selectedTool,
            getAnnotationsState().isDrawingMode
          )
        ) {
          return;
        }
        globalState.selectedTool = undefined;
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  $effect(() => {
    void open;
    void widthCss;

    if (!open) {
      computedTopOffset = 0;
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const handleWindowResize = () => syncCenteredOffset();

    void tick().then(() => {
      if (cancelled) return;

      syncCenteredOffset();

      resizeObserver = new ResizeObserver(() => syncCenteredOffset());

      const toolbar = document.getElementById(DOM_IDS.STEP_TOOLBAR);
      const popover = popoverRoot?.querySelector('.bx--popover');
      const contents = popoverRoot?.querySelector('.bx--popover-contents');

      if (toolbar instanceof HTMLElement) {
        resizeObserver.observe(toolbar);
      }
      if (popover instanceof HTMLElement) {
        resizeObserver.observe(popover);
      }
      if (contents instanceof HTMLElement) {
        resizeObserver.observe(contents);
      }

      window.addEventListener('resize', handleWindowResize);
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  });
</script>

<div
  id={DOM_IDS.TOOL_POPOVER}
  bind:this={popoverRoot}
  use:clickOutside={{
    enabled: open,
    excludeSelectors: [
      `#${DOM_IDS.STEP_TOOLBAR}`,
      `#${DOM_IDS.COLOR_PICKER}`,
      `#${DOM_IDS.COLOR_PICKER_DROPDOWN}`
    ]
  }}
  onoutsideclick={handleOutsideClick}
>
  <Popover
    open={open}
    align={align}
    light={light}
    class={CSS_CLASSES.TOOL_POPOVER}
    style={`--tool-popover-width:${widthCss};--tool-popover-top-offset:${computedTopOffset}px;--popover-max-height:${POPOVER_DIMENSIONS.MAX_HEIGHT};--dropdown-max-height:${POPOVER_DIMENSIONS.DROPDOWN_MAX_HEIGHT};`}
  >
    <div class={CSS_CLASSES.POPOVER_SCROLL}>
      {@render (content as Snippet | undefined)?.()}
    </div>
  </Popover>
</div>

<style>
  :global(#khartis-tool-popover .bx--popover--right-top) {
    top: var(--tool-popover-top-offset) !important;
  }

  :global(#khartis-tool-popover .bx--popover-contents) {
    width: var(--tool-popover-width) !important;
    max-width: var(--tool-popover-width) !important;
    max-height: var(--popover-max-height);
    overflow: visible;
    padding: 0;
  }

  .popover-scroll {
    max-height: var(--popover-max-height);
    overflow-y: auto;
    overflow-x: hidden;
    padding-bottom: var(--cds-spacing-03);
  }

  :global(#khartis-tool-popover .bx--list-box__menu) {
    max-height: var(--dropdown-max-height);
    z-index: var(--z-popover);
  }
</style>
