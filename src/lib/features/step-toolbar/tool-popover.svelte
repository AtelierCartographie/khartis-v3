<script lang="ts">
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import type { ProjectionViewMode } from '$lib/features/commons/types/global';
  import { clickOutside } from '$lib/features/commons/utils/click-outside';
  import { Popover } from 'carbon-components-svelte';
  import { DRAGGED_ELEMENT_ID } from 'svelte-dnd-action';
  import { tick } from 'svelte';
  import type { Snippet } from 'svelte';
  import {
    DOM_IDS,
    CSS_CLASSES,
    POPOVER_DIMENSIONS
  } from './step-toolbar.constants';
  import { getAnnotationsState } from './tools/annotations/annotations.store.svelte';
  import { shouldBlockToolClose } from './tools/tool-close-guard';
  import { closeSelectedToolPanel } from './tools-list/tool-list.utils.svelte';

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
  const RECENT_DND_INTERACTION_ATTRIBUTE = 'data-khartis-recent-dnd-at';
  const RECENT_DND_INTERACTION_GRACE_MS = 500;
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

    computedTopOffset = Math.min(
      0,
      Math.round((toolbarRect.height - popoverRect.height) / 2)
    );
  }

  function handleOutsideClick(event: CustomEvent) {
    if (
      shouldBlockToolClose(
        globalState.selectedTool,
        getAnnotationsState().creationMode !== 'idle'
      )
    ) {
      return;
    }

    const toolbar = document.getElementById(DOM_IDS.STEP_TOOLBAR);
    const target = event.detail?.originalEvent?.target as Node;

    if (document.getElementById(DRAGGED_ELEMENT_ID)) return;

    const lastDndInteractionAt = Number(
      document.body.getAttribute(RECENT_DND_INTERACTION_ATTRIBUTE) ?? '0'
    );
    if (
      Number.isFinite(lastDndInteractionAt) &&
      Date.now() - lastDndInteractionAt < RECENT_DND_INTERACTION_GRACE_MS
    ) {
      return;
    }

    if (
      target instanceof Element &&
      target.closest(
        '.bx--modal-container, .bx--overflow-menu-options, .bx--list-box__menu'
      )
    ) {
      return;
    }

    const mobileToolsBar = document.querySelector('.mobile-tools-bar');
    const mobileBottomNav = document.querySelector('.mobile-bottom-nav');

    const insideStepToolbar = !!toolbar && toolbar.contains(target);
    const insideMobileToolsBar =
      !!mobileToolsBar && mobileToolsBar.contains(target);
    const insideMobileBottomNav =
      !!mobileBottomNav && mobileBottomNav.contains(target);

    if (!insideStepToolbar && !insideMobileToolsBar && !insideMobileBottomNav) {
      closeSelectedToolPanel();
    }
  }

  $effect(() => {
    if (!open) return;

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (
          shouldBlockToolClose(
            globalState.selectedTool,
            getAnnotationsState().creationMode !== 'idle'
          )
        ) {
          return;
        }
        closeSelectedToolPanel();
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
      `#${DOM_IDS.COLOR_PICKER_DROPDOWN}`,
      '.mobile-tools-bar',
      '.mobile-bottom-nav'
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
    {#key globalState.selectedTool}
      <div class={CSS_CLASSES.POPOVER_SCROLL}>
        {@render (content as Snippet | undefined)?.()}
      </div>
    {/key}
  </Popover>
</div>

<style>
  :global(#khartis-tool-popover) {
    transition: opacity 120ms ease;
  }

  :global(#khartis-tool-popover .bx--popover) {
    transition: opacity 120ms ease;
  }

  :global(body.is-dragging-styling-target #khartis-tool-popover) {
    pointer-events: none;
  }

  :global(body.is-dragging-styling-target #khartis-tool-popover .bx--popover) {
    opacity: 0.28;
    pointer-events: none;
  }

  :global(#khartis-tool-popover .bx--popover--right-top) {
    top: var(--tool-popover-top-offset) !important;
  }

  :global(#khartis-tool-popover .bx--popover-contents) {
    width: var(--tool-popover-width) !important;
    max-width: var(--tool-popover-width) !important;
    max-height: var(--popover-max-height);
    overflow: visible;
    background: var(--khartis-control-surface-background);
    padding: 0;
  }

  @media (max-width: 1023px) {
    :global(#khartis-tool-popover .bx--popover) {
      position: fixed !important;
      inset: auto 0 0 0 !important;
      top: auto !important;
      left: 0 !important;
      right: 0 !important;
      bottom: calc(
        60px + env(safe-area-inset-bottom, 0px) + var(--cds-spacing-03) + 48px +
          var(--cds-spacing-03)
      ) !important;
      transform: none !important;
      width: 100vw !important;
      max-width: 100vw !important;
      margin: 0 !important;
    }

    :global(#khartis-tool-popover .bx--popover-contents) {
      width: 100vw !important;
      max-width: 100vw !important;
      max-height: 70vh;
      border-radius: 8px 8px 0 0;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
    }

    .popover-scroll {
      max-height: 70vh;
    }
  }

  .popover-scroll {
    max-height: var(--popover-max-height);
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    padding-bottom: 0;
  }

  .popover-scroll::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }

  :global(#khartis-tool-popover .bx--list-box__menu) {
    max-height: var(--dropdown-max-height);
    z-index: var(--z-popover);
  }
</style>
