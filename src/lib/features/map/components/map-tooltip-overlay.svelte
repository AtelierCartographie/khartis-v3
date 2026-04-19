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
  const TOOLTIP_VIEWER_GAP = 12;
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
  const canToggleAccordion = $derived(tooltipState.pinned);

  function getTooltipViewerRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null {
    if (typeof document === 'undefined') {
      return null;
    }

    const pageContainer = document.querySelector('.page-container');
    if (pageContainer instanceof HTMLElement) {
      const { left, top, width, height } =
        pageContainer.getBoundingClientRect();
      return { left, top, width, height };
    }

    const thematicMapWrapper = document.querySelector('.thematic-map-wrapper');
    if (thematicMapWrapper instanceof HTMLElement) {
      const { left, top, width, height } =
        thematicMapWrapper.getBoundingClientRect();
      return { left, top, width, height };
    }

    const mapCanvas = mapInstanceStore.map?.getCanvas() ?? null;
    const orthographicCanvas = document.getElementById(DECK_CANVAS_ID);
    const viewportElement = mapCanvas ?? orthographicCanvas;

    if (!(viewportElement instanceof HTMLElement)) {
      return null;
    }

    const { left, top, width, height } =
      viewportElement.getBoundingClientRect();
    return { left, top, width, height };
  }

  $effect(() => {
    void tooltipState.entries;
    accordionOpen = false;
  });

  const tooltipPosition = $derived.by(() => {
    if (!tooltipState.visible) {
      return { left: 0, top: 0 };
    }

    void tooltipState.pinned;
    void tooltipState.entries.length;
    void accordionOpen;
    void globalState.zoom.pageZoomLevel;
    void globalState.zoom.pagePanOffset.x;
    void globalState.zoom.pagePanOffset.y;
    void mapInstanceStore.map;
    void mapInstanceStore.deckInstance;

    const rect = tooltipElement?.getBoundingClientRect();
    const viewerRect = getTooltipViewerRect();

    return resolveTooltipViewportPosition({
      viewerRect,
      tooltipSize: {
        width: rect?.width ?? 0,
        height: rect?.height ?? 0
      },
      viewportSize: {
        width: typeof window !== 'undefined' ? window.innerWidth : 0,
        height: typeof window !== 'undefined' ? window.innerHeight : 0
      },
      padding: VIEWPORT_PADDING,
      gap: TOOLTIP_VIEWER_GAP
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
          aria-label={m.close()}
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
          disabled={!canToggleAccordion}
          onclick={toggleAccordion}
          onkeydown={handleAccordionKeyDown}
          aria-expanded={canToggleAccordion ? accordionOpen : false}
        >
          <span class="accordion-chevron">
            <ChevronRight size={16} />
          </span>
          <span class="accordion-label">
            {m.tooltip_other_attributes()} ({secondaryEntries.length})
          </span>
        </button>

        {#if canToggleAccordion && accordionOpen}
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
    z-index: var(--z-map-overlay);
    background: var(--cds-layer-01, #ffffff);
    color: var(--cds-text-primary, #161616);
    padding: 20px 24px;
    border-radius: 0;
    font-size: 12px;
    font-family: 'IBM Plex Sans', sans-serif;
    box-shadow:
      0 18px 40px rgba(22, 22, 22, 0.08),
      0 6px 16px rgba(22, 22, 22, 0.06);
    border: none;
    max-width: min(320px, calc(100vw - 16px));
    max-height: min(20rem, calc(100dvh - 16px));
    overflow: auto;
    pointer-events: none;
    user-select: none;
    line-height: 1.35;
    overscroll-behavior: contain;
  }

  .map-tooltip.pinned {
    pointer-events: auto;
    user-select: text;
    box-shadow:
      0 22px 48px rgba(22, 22, 22, 0.1),
      0 8px 20px rgba(22, 22, 22, 0.08);
  }

  .tooltip-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 10px;
  }

  .tooltip-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    color: #525252;
    cursor: pointer;
  }

  .tooltip-close:hover {
    background: rgba(22, 22, 22, 0.06);
    color: #161616;
  }

  .tooltip-close:focus-visible {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: 2px;
  }

  .tooltip-entries {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tooltip-row {
    display: grid;
    grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
    align-items: start;
    column-gap: 20px;
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
    font-weight: 600;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
    flex-shrink: 0;
    justify-self: end;
  }

  .tooltip-accordion {
    margin-top: 14px;
    border-top: 1px solid #e0e0e0;
    padding-top: 10px;
  }

  .accordion-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    cursor: pointer;
    color: #525252;
    font-size: inherit;
    line-height: inherit;
    padding: 2px 0;
    font-family: 'IBM Plex Sans', sans-serif;
  }

  .accordion-toggle:hover {
    color: #161616;
  }

  .accordion-toggle:disabled {
    cursor: default;
    color: #8d8d8d;
  }

  .accordion-toggle:focus-visible {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: 2px;
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
    gap: 8px;
    margin-top: 10px;
    padding-left: 0;
  }
</style>
