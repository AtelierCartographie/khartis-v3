<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
  import { mapTooltipStore } from '../stores/map-tooltip.store.svelte';
  import { DECK_CANVAS_ID } from '../constants';
  import { resolveTooltipViewportPosition } from '../utils/tooltip-position';
  import * as m from '$lib/paraglide/messages';
  import { KEY } from '$lib/features/commons/constants/dom.constants';
  import ChevronRight from 'carbon-icons-svelte/lib/ChevronRight.svelte';
  import Close from 'carbon-icons-svelte/lib/Close.svelte';

  const PRIMARY_ENTRIES_COUNT = 5;
  const TOOLTIP_OFFSET_X = 12;
  const TOOLTIP_OFFSET_Y = 12;
  const VIEWPORT_PADDING = 8;

  let tooltipElement = $state<HTMLDivElement | null>(null);
  let accordionOpen = $state(false);

  const tooltipState = $derived(mapTooltipStore.state);
  const primaryEntries = $derived(
    tooltipState.entries.slice(0, PRIMARY_ENTRIES_COUNT)
  );
  const secondaryEntries = $derived(
    tooltipState.entries.slice(PRIMARY_ENTRIES_COUNT)
  );
  const hasSecondaryEntries = $derived(secondaryEntries.length > 0);

  function getActiveViewportRect(): { left: number; top: number } | null {
    if (typeof document === 'undefined') {
      return null;
    }

    const mapCanvas = mapInstanceStore.map?.getCanvas() ?? null;
    const orthographicCanvas = document.getElementById(DECK_CANVAS_ID);
    const viewportElement = mapCanvas ?? orthographicCanvas;

    if (!(viewportElement instanceof HTMLElement)) {
      return null;
    }

    const { left, top } = viewportElement.getBoundingClientRect();
    return { left, top };
  }

  // Reset accordion when tooltip hides or entries change
  $effect(() => {
    void tooltipState.entries;
    accordionOpen = false;
  });

  const tooltipPosition = $derived.by(() => {
    if (!tooltipState.visible) {
      return { left: 0, top: 0 };
    }

    // Deck.gl PickingInfo.x/y are relative to the active map viewport, not the
    // browser window. Convert them to viewport coordinates for the global overlay.
    void globalState.zoom.pageZoomLevel;
    void globalState.zoom.pagePanOffset.x;
    void globalState.zoom.pagePanOffset.y;
    void mapInstanceStore.deckInstance;

    const rect = tooltipElement?.getBoundingClientRect();
    const viewportRect = getActiveViewportRect();

    return resolveTooltipViewportPosition({
      anchor: { x: tooltipState.x, y: tooltipState.y },
      viewportOrigin: viewportRect,
      tooltipSize: {
        width: rect?.width ?? 0,
        height: rect?.height ?? 0
      },
      viewportSize: {
        width: typeof window !== 'undefined' ? window.innerWidth : 0,
        height: typeof window !== 'undefined' ? window.innerHeight : 0
      },
      offsetX: TOOLTIP_OFFSET_X,
      offsetY: TOOLTIP_OFFSET_Y,
      padding: VIEWPORT_PADDING
    });
  });

  function handleClose(): void {
    mapTooltipStore.unpin();
  }

  function handleCloseKeyDown(event: KeyboardEvent): void {
    if (event.key === KEY.ENTER || event.key === KEY.SPACE) {
      event.preventDefault();
      handleClose();
    }
  }

  function toggleAccordion(): void {
    accordionOpen = !accordionOpen;
  }

  function handleAccordionKeyDown(event: KeyboardEvent): void {
    if (event.key === KEY.ENTER || event.key === KEY.SPACE) {
      event.preventDefault();
      toggleAccordion();
    }
  }
</script>

{#if tooltipState.visible}
  <div
    bind:this={tooltipElement}
    class="map-tooltip"
    class:pinned={tooltipState.pinned}
    style="left: {tooltipPosition.left}px; top: {tooltipPosition.top}px;"
    role="tooltip"
  >
    {#if tooltipState.pinned}
      <div class="tooltip-header">
        <button
          class="tooltip-close"
          aria-label="Close"
          onclick={handleClose}
          onkeydown={handleCloseKeyDown}
        >
          <Close size={16} />
        </button>
      </div>
    {/if}

    <div class="tooltip-entries">
      {#each primaryEntries as entry (entry.key)}
        <div class="tooltip-row">
          <span class="tooltip-key">{entry.key}</span>
          <span class="tooltip-value">{entry.value}</span>
        </div>
      {/each}
    </div>

    {#if hasSecondaryEntries}
      <div class="tooltip-accordion" class:open={accordionOpen}>
        <button
          class="accordion-toggle"
          onclick={toggleAccordion}
          onkeydown={handleAccordionKeyDown}
          aria-expanded={accordionOpen}
        >
          <span class="accordion-chevron">
            <ChevronRight size={16} />
          </span>
          <span class="accordion-label">
            {m.tooltip_other_attributes()} ({secondaryEntries.length})
          </span>
        </button>

        {#if accordionOpen}
          <div class="accordion-content">
            {#each secondaryEntries as entry (entry.key)}
              <div class="tooltip-row">
                <span class="tooltip-key">{entry.key}</span>
                <span class="tooltip-value">{entry.value}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .map-tooltip {
    position: fixed;
    z-index: var(--z-notification);
    background: rgba(255, 255, 255, 0.96);
    color: #161616;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-family: 'IBM Plex Sans', sans-serif;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    border: 1px solid #8d8d8d;
    max-width: 320px;
    pointer-events: none;
    user-select: none;
    line-height: 1.4;
  }

  .map-tooltip.pinned {
    pointer-events: auto;
    user-select: text;
    border-color: #0f62fe;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .tooltip-header {
    display: flex;
    justify-content: flex-end;
    margin: -4px -4px 4px 0;
  }

  .tooltip-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 2px;
    background: transparent;
    color: #525252;
    cursor: pointer;
  }

  .tooltip-close:hover {
    background: #e0e0e0;
    color: #161616;
  }

  .tooltip-entries {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .tooltip-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }

  .tooltip-key {
    color: #525252;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
    flex-shrink: 1;
  }

  .tooltip-value {
    font-weight: 500;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
    flex-shrink: 0;
  }

  .tooltip-accordion {
    margin-top: 6px;
    border-top: 1px solid #e0e0e0;
    padding-top: 4px;
  }

  .accordion-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    color: #525252;
    font-size: 11px;
    padding: 2px 0;
    font-family: 'IBM Plex Sans', sans-serif;
  }

  .accordion-toggle:hover {
    color: #161616;
  }

  .accordion-chevron {
    display: flex;
    align-items: center;
    transition: transform 0.15s ease;
  }

  .tooltip-accordion.open .accordion-chevron {
    transform: rotate(90deg);
  }

  .accordion-content {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 4px;
    padding-left: 4px;
  }
</style>
