<script lang="ts">
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
  import { mapTooltipStore } from '../stores/map-tooltip.store.svelte';
  import { resolveTooltipViewportPosition } from '../utils/tooltip-position.utils';
  import * as m from '$lib/paraglide/messages';
  import { KEY } from '$lib/features/commons/constants/dom.constants';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { Tag } from 'carbon-components-svelte';
  import Close from 'carbon-icons-svelte/lib/Close.svelte';

  const PREVIEW_PRIMARY_ENTRIES_COUNT = 2;
  const DESKTOP_INSPECTOR_TARGET_HEIGHT = 352;
  const DESKTOP_INSPECTOR_MIN_HEIGHT = 220;
  const TOOLTIP_VIEWER_GAP = 12;
  const VIEWPORT_PADDING = 8;
  const HEADLINE_ENTRY_KEYS = ['NAME_LATIN', 'NAME', 'LABEL', 'TITLE'] as const;
  const BADGE_ENTRY_KEYS = ['NUTS_ID', 'OGC_FID', 'ID', 'CODE'] as const;

  let tooltipElement = $state<HTMLDivElement | null>(null);

  const tooltipState = $derived(mapTooltipStore.state);
  const isMobileLayout = $derived(globalState.isMobileView);
  const isStylingStep = $derived(
    globalState.selectedStep === ToolbarStep.Styling
  );
  const isInteractive = $derived(isMobileLayout || tooltipState.pinned);
  const headlineEntry = $derived.by(() =>
    isInteractive ? resolveHeadlineEntry(tooltipState.entries) : null
  );
  const badgeEntries = $derived.by(() =>
    isInteractive
      ? resolveBadgeEntries(tooltipState.entries, headlineEntry?.key ?? null)
      : []
  );
  const visibleEntries = $derived.by(() => {
    if (!isInteractive) {
      return tooltipState.entries.slice(0, PREVIEW_PRIMARY_ENTRIES_COUNT);
    }

    const skippedKeys = new Set<string>([
      ...(headlineEntry ? [headlineEntry.key] : []),
      ...badgeEntries.map((entry) => entry.key)
    ]);

    return tooltipState.entries.filter((entry) => !skippedKeys.has(entry.key));
  });
  const previewOverflowCount = $derived(
    isInteractive
      ? 0
      : Math.max(0, tooltipState.entries.length - PREVIEW_PRIMARY_ENTRIES_COUNT)
  );

  function getTooltipViewerRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null {
    const viewportElement = mapInstanceStore.workspaceViewportElement;
    if (!(viewportElement instanceof HTMLElement)) {
      return null;
    }

    const { left, top, width, height } =
      viewportElement.getBoundingClientRect();
    return { left, top, width, height };
  }

  function resolveHeadlineEntry(
    entries: typeof tooltipState.entries
  ): (typeof tooltipState.entries)[number] | null {
    for (const candidateKey of HEADLINE_ENTRY_KEYS) {
      const candidate = entries.find((entry) => entry.key === candidateKey);
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  function resolveBadgeEntries(
    entries: typeof tooltipState.entries,
    excludedKey: string | null
  ): typeof tooltipState.entries {
    return entries.filter((entry) => {
      if (entry.key === excludedKey) {
        return false;
      }

      const isPreferredKey = BADGE_ENTRY_KEYS.includes(
        entry.key as (typeof BADGE_ENTRY_KEYS)[number]
      );
      const isCompactValue =
        entry.value.length <= 14 && !/\s{2,}/.test(entry.value);

      return isPreferredKey && isCompactValue;
    });
  }

  function resolveDesktopInspectorHeight(maxAvailableHeight: number): number {
    if (maxAvailableHeight <= 0) {
      return DESKTOP_INSPECTOR_MIN_HEIGHT;
    }

    const minHeight = Math.min(
      DESKTOP_INSPECTOR_MIN_HEIGHT,
      maxAvailableHeight
    );
    return Math.max(
      Math.min(DESKTOP_INSPECTOR_TARGET_HEIGHT, maxAvailableHeight),
      minHeight
    );
  }

  $effect(() => {
    if (isStylingStep && tooltipState.visible) {
      mapTooltipStore.unpin();
    }
  });

  $effect(() => {
    if (
      globalState.isMobileView &&
      tooltipState.visible &&
      !tooltipState.pinned
    ) {
      mapTooltipStore.hide();
    }
  });

  $effect(() => {
    if (
      !tooltipState.visible ||
      !isInteractive ||
      typeof window === 'undefined'
    ) {
      return;
    }

    const handleWindowKeyDown = (event: KeyboardEvent): void => {
      if (event.key === KEY.ESCAPE) {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);

    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  });

  const tooltipLayout = $derived.by(() => {
    if (!tooltipState.visible) {
      return {
        left: 0,
        top: 0,
        interactiveHeight: DESKTOP_INSPECTOR_TARGET_HEIGHT
      };
    }

    if (globalState.isMobileView) {
      return {
        left: 0,
        top: 0,
        interactiveHeight: DESKTOP_INSPECTOR_TARGET_HEIGHT
      };
    }

    void tooltipState.entries.length;
    void globalState.zoom.pageZoomLevel;
    void globalState.zoom.pagePanOffset.x;
    void globalState.zoom.pagePanOffset.y;
    void mapInstanceStore.map;
    void mapInstanceStore.deckInstance;

    const rect = tooltipElement?.getBoundingClientRect();
    const viewerRect = getTooltipViewerRect();
    const viewportSize = {
      width: typeof window !== 'undefined' ? window.innerWidth : 0,
      height: typeof window !== 'undefined' ? window.innerHeight : 0
    };
    const interactiveHeight = isInteractive
      ? resolveDesktopInspectorHeight(
          viewportSize.height - (viewerRect?.top ?? 0) - VIEWPORT_PADDING * 2
        )
      : 0;
    const position = resolveTooltipViewportPosition({
      viewerRect,
      tooltipSize: {
        width: rect?.width ?? 0,
        height: isInteractive ? interactiveHeight : (rect?.height ?? 0)
      },
      viewportSize,
      padding: VIEWPORT_PADDING,
      gap: TOOLTIP_VIEWER_GAP,
      placement: 'inside-viewer-top'
    });

    return {
      ...position,
      interactiveHeight
    };
  });

  const tooltipInlineStyle = $derived.by(() => {
    if (isMobileLayout) {
      return '';
    }

    if (isInteractive) {
      return `--tooltip-interactive-height: ${tooltipLayout.interactiveHeight}px; left: ${tooltipLayout.left}px; top: ${tooltipLayout.top}px;`;
    }

    return `left: ${tooltipLayout.left}px; top: ${tooltipLayout.top}px;`;
  });

  function handleClose(): void {
    mapTooltipStore.unpin();
  }
</script>

{#if tooltipState.visible && !isStylingStep}
  <div
    bind:this={tooltipElement}
    class="map-tooltip"
    class:hover-preview={!isInteractive}
    class:interactive={isInteractive}
    class:pinned={tooltipState.pinned}
    class:mobile-sheet={isMobileLayout}
    style={tooltipInlineStyle}
    role={isInteractive ? 'dialog' : 'tooltip'}
    aria-modal={isInteractive ? 'false' : undefined}
  >
    {#if isInteractive}
      <div class="tooltip-shell-header">
        {#if isMobileLayout}
          <div class="mobile-sheet-grabber" aria-hidden="true"></div>
        {/if}
        <div class="tooltip-shell-actions">
          <IconButton
            class="tooltip-close"
            kind="ghost"
            size="small"
            icon={Close}
            iconDescription={m.close()}
            tooltipPosition="left"
            hideTooltip
            on:click={handleClose}
          />
        </div>

        {#if headlineEntry}
          <div class="tooltip-title">{headlineEntry.value}</div>
        {/if}

        {#if badgeEntries.length > 0}
          <div class="tooltip-badges">
            {#each badgeEntries as entry (entry.key)}
              <Tag size="sm" type="warm-gray">
                {entry.key}: {entry.value}
              </Tag>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <div class="tooltip-shell-body">
      <div class="tooltip-entries">
        {#each visibleEntries as entry (entry.key)}
          <div class="tooltip-row">
            <span class="tooltip-key">{entry.key}</span>
            <span class="tooltip-value">{entry.value}</span>
          </div>
        {/each}
      </div>

      {#if previewOverflowCount > 0}
        <div class="tooltip-preview-more" aria-hidden="true">
          +{previewOverflowCount}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .map-tooltip {
    position: fixed;
    z-index: var(--z-map-overlay, 1);
    display: flex;
    flex-direction: column;
    background: var(--cds-layer-01, #ffffff);
    color: var(--cds-text-primary, #161616);
    border: none;
    border-radius: 0;
    font-size: 11px;
    font-family: 'IBM Plex Sans', sans-serif;
    box-shadow:
      0 12px 28px rgba(22, 22, 22, 0.09),
      0 2px 8px rgba(22, 22, 22, 0.06);
    line-height: 1.25;
  }

  .map-tooltip.hover-preview {
    width: min(13rem, calc(100vw - 16px));
    max-width: min(13rem, calc(100vw - 16px));
    max-height: min(8.5rem, calc(100dvh - 16px));
    overflow: hidden;
    pointer-events: none;
    user-select: none;
  }

  .map-tooltip.interactive {
    width: min(18rem, calc(100vw - 24px));
    max-width: min(18rem, calc(100vw - 24px));
    max-height: var(--tooltip-interactive-height, 22rem);
    overflow: hidden;
    pointer-events: auto;
    user-select: text;
  }

  .map-tooltip.pinned {
    box-shadow:
      0 16px 36px rgba(22, 22, 22, 0.12),
      0 3px 10px rgba(22, 22, 22, 0.07);
  }

  .map-tooltip.mobile-sheet {
    left: var(--cds-spacing-03, 0.75rem);
    right: var(--cds-spacing-03, 0.75rem);
    bottom: calc(
      60px + env(safe-area-inset-bottom, 0px) + var(--cds-spacing-03, 0.75rem)
    );
    top: auto;
    width: auto;
    max-width: none;
    max-height: min(38dvh, 18rem);
    border-radius: 0;
    z-index: var(--z-mobile-overlay, 2);
  }

  .tooltip-shell-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 8px 0;
  }

  .tooltip-shell-actions {
    display: flex;
    justify-content: flex-end;
  }

  .tooltip-title {
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: break-word;
    color: #161616;
  }

  .tooltip-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .tooltip-badges :global(.bx--tag),
  .tooltip-badges :global(.cds--tag) {
    max-width: 100%;
    min-height: 1.25rem;
  }

  .tooltip-badges :global(.bx--tag__label),
  .tooltip-badges :global(.cds--tag__label) {
    overflow-wrap: anywhere;
  }

  .tooltip-shell-body {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    flex-direction: column;
    gap: 6px;
  }

  .hover-preview .tooltip-shell-body {
    padding: 8px 10px;
  }

  .interactive .tooltip-shell-body {
    padding: 0 10px 10px;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .mobile-sheet .tooltip-shell-body {
    padding: 0 10px calc(10px + env(safe-area-inset-bottom, 0px));
  }

  .mobile-sheet-grabber {
    width: 24px;
    height: 2px;
    border-radius: 0;
    background: var(--cds-border-subtle-01, #cac5c4);
    align-self: center;
  }

  .tooltip-shell-actions :global(.tooltip-close.bx--btn) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    min-height: 20px;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    color: #525252;
    cursor: pointer;
  }

  .tooltip-shell-actions :global(.tooltip-close.bx--btn:hover) {
    background: rgba(22, 22, 22, 0.06);
    color: #161616;
  }

  .tooltip-shell-actions :global(.tooltip-close.bx--btn:focus-visible) {
    outline: 1px solid rgba(15, 98, 254, 0.6);
    outline-offset: 1px;
  }

  .tooltip-entries {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .tooltip-row {
    display: grid;
    grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
    align-items: start;
    column-gap: 6px;
  }

  .tooltip-key {
    color: #525252;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 82px;
    flex-shrink: 1;
  }

  .tooltip-value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 114px;
    flex-shrink: 0;
    justify-self: end;
  }

  .interactive .tooltip-key,
  .interactive .tooltip-value {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    max-width: none;
  }

  .interactive .tooltip-entries {
    gap: 0;
  }

  .interactive .tooltip-row {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 2px;
    padding: 5px 0;
  }

  .interactive .tooltip-row + .tooltip-row {
    border-top: 1px solid rgba(22, 22, 22, 0.08);
  }

  .interactive .tooltip-key {
    font-size: 10px;
    line-height: 1.3;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #6f6f6f;
  }

  .interactive .tooltip-value {
    justify-self: start;
    text-align: left;
    line-height: 1.35;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .mobile-sheet .tooltip-row {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 4px;
  }

  .mobile-sheet .tooltip-value {
    justify-self: start;
    text-align: left;
  }

  .tooltip-preview-more {
    align-self: flex-end;
    min-width: 24px;
    height: 20px;
    padding: 0 6px;
    border-radius: 0;
    background: rgba(22, 22, 22, 0.06);
    color: #525252;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
  }
</style>
