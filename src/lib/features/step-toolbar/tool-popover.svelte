<script lang="ts">
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import {
    type ProjectionViewMode,
    StylingTools
  } from '$lib/features/commons/types/global';
  import { clickOutside } from '$lib/features/commons/utils/click-outside';
  import { Popover } from 'carbon-components-svelte';
  import { DRAGGED_ELEMENT_ID } from 'svelte-dnd-action';
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import {
    CSS_CLASSES,
    DOM_IDS,
    POPOVER_DIMENSIONS,
    type ToolPopoverSizing
  } from './step-toolbar.constants';
  import { getAnnotationsState } from './tools/annotations/annotations.store.svelte';
  import { shouldBlockToolClose } from './tools/tool-close-guard';
  import { closeSelectedToolPanel } from './tools-list/tool-list.utils.svelte';
  import { hasRecentDndInteraction } from '$lib/features/map/utils/tool-popover-drag-visibility.utils';
  import { motionDuration } from '$lib/features/commons/utils/step-transition.svelte';

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
    sizing = 'fit' as ToolPopoverSizing,
    content
  } = $props();

  const widthCss = $derived(viewMode === 'grid' ? gridWidth : `${listWidth}px`);
  const hideForMobileAnnotationCreation = $derived(
    globalState.isMobileView &&
      globalState.selectedTool === StylingTools.Annotations &&
      getAnnotationsState().creationMode !== 'idle'
  );
  let popoverRoot: HTMLDivElement | null = null;
  let topOffset = $state(0);
  let availableHeight = $state<number | null>(null);

  // The window sits in the free area of the map view, above the zoom
  // toolbar. It moves only when that area changes, never with its content:
  // a 'fill' tool takes the whole area (capped and centred on the toolbar on
  // tall screens), a 'fit' tool hangs from the step toolbar and grows
  // downwards.
  function syncGeometry(): void {
    const toolbar = document.getElementById(DOM_IDS.STEP_TOOLBAR);
    const popover = popoverRoot?.querySelector('.bx--popover');

    if (
      !open ||
      globalState.isMobileView ||
      align !== 'right-top' ||
      !(toolbar instanceof HTMLElement) ||
      !(popover instanceof HTMLElement)
    ) {
      topOffset = 0;
      availableHeight = null;
      return;
    }

    const margin = POPOVER_DIMENSIONS.VIEWPORT_MARGIN;
    const toolbarRect = toolbar.getBoundingClientRect();
    const toolbarTop = toolbarRect.top;
    const popoverRect = popover.getBoundingClientRect();
    const viewRect = (
      toolbar.offsetParent ?? document.documentElement
    ).getBoundingClientRect();
    const zoomRect = document
      .getElementById(DOM_IDS.ZOOM_TOOLBAR)
      ?.getBoundingClientRect();
    const zoomBelow =
      zoomRect !== undefined &&
      zoomRect.width > 0 &&
      zoomRect.left < popoverRect.right &&
      zoomRect.right > popoverRect.left;

    const areaTop = viewRect.top + margin;
    const areaBottom = (zoomBelow ? zoomRect.top : viewRect.bottom) - margin;
    const areaHeight = Math.max(0, areaBottom - areaTop);

    if (sizing === 'fill') {
      const height = Math.min(areaHeight, POPOVER_DIMENSIONS.FILL_MAX_HEIGHT);
      const centredTop = toolbarTop + toolbarRect.height / 2 - height / 2;
      const top = Math.min(Math.max(centredTop, areaTop), areaBottom - height);
      topOffset = Math.round(top - toolbarTop);
      availableHeight = Math.round(height);
      return;
    }

    const top = Math.max(areaTop, toolbarTop);
    topOffset = Math.round(top - toolbarTop);
    availableHeight = Math.max(0, Math.round(areaBottom - top));
  }

  // Closing empties the popover at once (its content follows the selected
  // tool), so an inert copy of the last frame fades out in its place.
  let wasOpen = false;

  $effect.pre(() => {
    const isOpen = open;
    if (wasOpen && !isOpen) {
      fadeOutClosedPopover();
    }
    wasOpen = isOpen;
  });

  function fadeOutClosedPopover(): void {
    const duration = motionDuration(140);
    const contents = popoverRoot?.querySelector<HTMLElement>(
      '.bx--popover-contents'
    );
    if (!contents || duration === 0) return;

    const rect = contents.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const computed = getComputedStyle(contents);
    const ghost = contents.cloneNode(true) as HTMLElement;
    ghost.classList.add('tool-popover-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      maxWidth: 'none',
      maxHeight: 'none',
      margin: '0',
      padding: computed.padding,
      overflow: 'hidden',
      background: computed.backgroundColor,
      boxShadow: computed.boxShadow,
      borderRadius: computed.borderRadius,
      zIndex: 'var(--z-popover)',
      pointerEvents: 'none',
      animation: 'none'
    });
    // The copy leaves the popover root, which carries the theme surfaces.
    const rootStyle = popoverRoot ? getComputedStyle(popoverRoot) : null;
    for (const property of [
      '--khartis-expandable-section-background',
      '--khartis-expandable-section-hover-background'
    ]) {
      const value = rootStyle?.getPropertyValue(property);
      if (value) ghost.style.setProperty(property, value);
    }
    document.body.append(ghost);

    ghost
      .animate(
        [
          { opacity: 1, transform: 'none' },
          {
            opacity: 0,
            transform: globalState.isMobileView
              ? 'translateY(8px)'
              : 'translateX(-6px)'
          }
        ],
        { duration, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
      )
      .finished.then(
        () => ghost.remove(),
        () => ghost.remove()
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

    if (hasRecentDndInteraction()) {
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
    void sizing;
    void globalState.isMobileView;

    if (!open) {
      topOffset = 0;
      availableHeight = null;
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const handleWindowResize = () => syncGeometry();

    void tick().then(() => {
      if (cancelled) return;

      syncGeometry();

      const toolbar = document.getElementById(DOM_IDS.STEP_TOOLBAR);
      if (toolbar instanceof HTMLElement) {
        resizeObserver = new ResizeObserver(() => syncGeometry());
        resizeObserver.observe(toolbar);
      }

      window.addEventListener('resize', handleWindowResize);
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  });

  const geometryStyle = $derived(
    availableHeight === null
      ? ''
      : `--tool-popover-max-height:${availableHeight}px;${
          sizing === 'fill' ? `--tool-popover-height:${availableHeight}px;` : ''
        }`
  );
</script>

<div
  id={DOM_IDS.TOOL_POPOVER}
  class:mobile-annotation-creation={hideForMobileAnnotationCreation}
  inert={hideForMobileAnnotationCreation}
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
    style={`--tool-popover-width:${widthCss};--tool-popover-top-offset:${topOffset}px;--dropdown-max-height:${POPOVER_DIMENSIONS.DROPDOWN_MAX_HEIGHT};${geometryStyle}`}
  >
    {#key globalState.selectedTool}
      <div class={CSS_CLASSES.POPOVER_FRAME}>
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
    display: flex;
    flex-direction: column;
    width: var(--tool-popover-width) !important;
    max-width: var(--tool-popover-width) !important;
    height: var(--tool-popover-height, auto);
    max-height: var(--tool-popover-max-height, 80vh);
    overflow: visible;
    background: var(--khartis-control-surface-background);
    padding: 0;
    animation: tool-popover-enter 180ms cubic-bezier(0, 0, 0.38, 0.9);
  }

  @keyframes tool-popover-enter {
    from {
      opacity: 0;
      transform: translateX(-6px);
    }
  }

  @keyframes tool-popover-enter-up {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  @keyframes tool-content-swap {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  @media (max-width: 1023px) {
    :global(#khartis-tool-popover.mobile-annotation-creation) {
      pointer-events: none;
    }

    :global(#khartis-tool-popover.mobile-annotation-creation .bx--popover) {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }

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
      height: auto;
      max-height: 70vh;
      border-radius: 8px 8px 0 0;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
      animation-name: tool-popover-enter-up;
    }
  }

  /* A copy replays nothing: its content stays as the popover left it. */
  :global(.tool-popover-ghost),
  :global(.tool-popover-ghost *) {
    animation: none !important;
    transition: none !important;
  }

  /* The tool body scrolls inside; the frame only passes the height on. */
  .popover-frame {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    animation: tool-content-swap 200ms cubic-bezier(0, 0, 0.38, 0.9);
  }

  @media (prefers-reduced-motion: reduce) {
    :global(#khartis-tool-popover .bx--popover-contents),
    .popover-frame {
      animation: none;
    }
  }

  :global(#khartis-tool-popover .bx--list-box__menu) {
    max-height: var(--dropdown-max-height);
    z-index: var(--z-popover);
  }
</style>
