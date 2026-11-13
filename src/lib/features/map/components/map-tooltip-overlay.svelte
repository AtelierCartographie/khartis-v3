<script lang="ts">
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
  import { mapTooltipStore } from '../stores/map-tooltip.store.svelte';
  import { mapHoverHighlightStore } from '../stores/map-hover-highlight.store.svelte';
  import {
    resolveCursorTooltipPosition,
    resolveTooltipViewportPosition
  } from '../utils/tooltip-position.utils';
  import * as m from '$lib/paraglide/messages';
  import { KEY } from '$lib/features/commons/constants/dom.constants';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { scrollShadows } from '$lib/features/commons/utils/scroll-shadows';
  import { Tag } from 'carbon-components-svelte';
  import TooltipGlyph from './tooltip-glyph.svelte';
  import Close from 'carbon-icons-svelte/lib/Close.svelte';

  const PREVIEW_MAX_ENTRIES_COUNT = 5;
  const PREVIEW_MAX_OTHER_VARIABLES_COUNT = 3;
  const DESKTOP_INSPECTOR_TARGET_HEIGHT = 352;
  const DESKTOP_INSPECTOR_MIN_HEIGHT = 220;
  const TOOLTIP_VIEWER_GAP = 12;
  const VIEWPORT_PADDING = 8;
  const CURSOR_OFFSET = 14;
  const HEADLINE_ENTRY_KEYS = ['NAME_LATIN', 'NAME', 'LABEL', 'TITLE'] as const;
  const BADGE_ENTRY_KEYS = ['NUTS_ID', 'OGC_FID', 'ID', 'CODE'] as const;

  let tooltipElement = $state<HTMLDivElement | null>(null);

  const tooltipState = $derived(mapTooltipStore.state);
  const isMobileLayout = $derived(globalState.isMobileView);
  const isStylingStep = $derived(
    globalState.selectedStep === ToolbarStep.Styling
  );
  const isInteractive = $derived(isMobileLayout || tooltipState.pinned);
  const titleEntry = $derived(
    tooltipState.entries.find((entry) => entry.role === 'title') ?? null
  );
  const bodyEntries = $derived(
    tooltipState.entries.filter((entry) => entry.role !== 'title')
  );
  // A visualization's data reads in three tiers: the entity, the variables
  // the map draws, then the others, quieter.
  const isVariableLayout = $derived(
    titleEntry !== null || bodyEntries.some((entry) => entry.isVizColumn)
  );
  const headlineEntry = $derived.by(() =>
    isInteractive && !titleEntry
      ? resolveHeadlineEntry(tooltipState.entries)
      : null
  );
  const badgeEntries = $derived.by(() =>
    isInteractive
      ? resolveBadgeEntries(bodyEntries, headlineEntry?.key ?? null)
      : []
  );
  // A heading or a title stays on one line: the tooltip widens to hold it.
  const hasHeading = $derived(
    tooltipState.entries.some(
      (entry) => entry.role === 'heading' || entry.role === 'title'
    )
  );
  const previewEntries = $derived(
    bodyEntries.filter((entry) => !entry.pinnedOnly)
  );
  const previewOtherCount = $derived(
    previewEntries.filter((entry) => !entry.isVizColumn && !entry.role).length
  );
  const visibleEntries = $derived.by(() => {
    if (!isInteractive) {
      return isVariableLayout
        ? layoutVariables(previewEntries, PREVIEW_MAX_OTHER_VARIABLES_COUNT)
        : previewEntries.slice(0, PREVIEW_MAX_ENTRIES_COUNT);
    }

    const skippedKeys = new Set<string>([
      ...(headlineEntry ? [headlineEntry.key] : []),
      ...badgeEntries.map((entry) => entry.key)
    ]);
    const entries = bodyEntries.filter((entry) => !skippedKeys.has(entry.key));
    return isVariableLayout ? layoutVariables(entries, null) : entries;
  });
  // The pinned inspector shows what the preview leaves out.
  const previewOverflowCount = $derived(
    isInteractive
      ? 0
      : (isVariableLayout
          ? Math.max(0, previewOtherCount - PREVIEW_MAX_OTHER_VARIABLES_COUNT)
          : Math.max(0, previewEntries.length - PREVIEW_MAX_ENTRIES_COUNT)) +
          tooltipState.entries.filter(
            (entry) => entry.pinnedOnly && !entry.role
          ).length
  );

  function layoutVariables(
    entries: typeof tooltipState.entries,
    maxOthers: number | null
  ): typeof tooltipState.entries {
    const variables = entries.filter((entry) => entry.isVizColumn);
    const others = entries.filter((entry) => !entry.isVizColumn);
    const shownOthers =
      maxOthers === null ? others : others.slice(0, maxOthers);
    const divider = {
      key: 'variables-divider',
      value: '',
      role: 'divider' as const
    };
    return [
      ...(titleEntry && !isInteractive && variables.length + shownOthers.length
        ? [{ ...divider, key: 'title-divider' }]
        : []),
      ...variables,
      ...(variables.length > 0 && shownOthers.length > 0 ? [divider] : []),
      ...shownOthers
    ];
  }

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
    if (!tooltipState.visible) {
      mapHoverHighlightStore.clear();
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
    void globalState.zoom.pageZoomScale;
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

    if (!isInteractive) {
      return {
        ...resolveCursorTooltipPosition({
          cursor: { x: tooltipState.x, y: tooltipState.y },
          tooltipSize: {
            width: rect?.width ?? 0,
            height: rect?.height ?? 0
          },
          bounds: {
            left: Math.max(0, viewerRect?.left ?? 0),
            top: Math.max(0, viewerRect?.top ?? 0),
            right: Math.min(
              viewportSize.width,
              viewerRect
                ? viewerRect.left + viewerRect.width
                : viewportSize.width
            ),
            bottom: Math.min(
              viewportSize.height,
              viewerRect
                ? viewerRect.top + viewerRect.height
                : viewportSize.height
            )
          },
          padding: VIEWPORT_PADDING,
          offset: CURSOR_OFFSET
        }),
        interactiveHeight: 0
      };
    }
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
    class:fit-heading={hasHeading}
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

        {#if titleEntry}
          <div class="tooltip-title">
            <span class="tooltip-title-text">{titleEntry.key}</span>
            {#if titleEntry.value}
              <span class="tooltip-title-subtitle">{titleEntry.value}</span>
            {/if}
          </div>
        {:else if headlineEntry}
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

    <div class="kh-scroll-area">
      <div class="tooltip-shell-body" use:scrollShadows>
        <div class="tooltip-entries">
          {#if titleEntry && !isInteractive}
            <div class="tooltip-preview-title">
              <span class="tooltip-title-text">{titleEntry.key}</span>
              {#if titleEntry.value}
                <span class="tooltip-title-subtitle">{titleEntry.value}</span>
              {/if}
            </div>
          {/if}
          {#each visibleEntries as entry, index (`${index}:${entry.key}`)}
            {#if entry.role === 'divider'}
              <hr class="tooltip-divider" />
            {:else if entry.role === 'subtitle'}
              <div class="tooltip-subtitle">{entry.key}</div>
            {:else if entry.role === 'heading'}
              <div class="tooltip-heading">
                <span class="tooltip-heading-key">{entry.key}</span>
                <span class="tooltip-chip tone-{entry.tone ?? 'ignored'}"
                  >{entry.value}</span
                >
              </div>
            {:else if entry.role === 'columns'}
              <div class="tooltip-columns">
                {#each entry.columns ?? [] as column, columnIndex (columnIndex)}
                  <div class="tooltip-column">
                    <span class="tooltip-key">{column.label}</span>
                    <span class="tooltip-column-value">{column.value}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <div
                class="tooltip-row"
                class:inline={entry.pinnedOnly}
                class:variable={isVariableLayout && entry.isVizColumn}
                class:other={isVariableLayout && !entry.isVizColumn}
              >
                <span class="tooltip-key" class:viz-column={entry.isVizColumn}>
                  {#if entry.glyphs?.length}
                    <span class="tooltip-glyphs">
                      {#each entry.glyphs as glyph, glyphIndex (glyphIndex)}
                        <TooltipGlyph glyph={glyph} />
                      {/each}
                    </span>
                  {/if}{entry.key}</span
                >
                <span class="tooltip-value">{entry.value}</span>
              </div>
            {/if}
          {/each}
        </div>

        {#if previewOverflowCount > 0}
          <div class="tooltip-preview-more">
            {previewOverflowCount === 1
              ? m.map_tooltip_more_variables_one()
              : m.map_tooltip_more_variables({ count: previewOverflowCount })}
          </div>
        {/if}
      </div>
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

  /* Translucent so the map stays readable under the cursor. */
  .map-tooltip.hover-preview {
    background: color-mix(
      in srgb,
      var(--cds-layer-01, #ffffff) 82%,
      transparent
    );
    width: min(13rem, calc(100vw - 16px));
    max-width: min(13rem, calc(100vw - 16px));
    max-height: min(11rem, calc(100dvh - 16px));
    overflow: hidden;
    pointer-events: none;
    user-select: none;
  }

  .map-tooltip.hover-preview.fit-heading {
    width: max-content;
    min-width: min(13rem, calc(100vw - 16px));
    max-width: min(22rem, calc(100vw - 16px));
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
    color: var(--cds-text-primary, #161616);
  }

  .tooltip-title-text {
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
  }
  .tooltip-title-subtitle {
    font-weight: 400;
    color: var(--cds-text-secondary, #525252);
  }
  .tooltip-title .tooltip-title-subtitle {
    display: block;
    font-size: 0.75rem;
  }
  .tooltip-preview-title {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    column-gap: 6px;
    font-size: 12px;
    font-weight: 600;
  }
  .tooltip-preview-title .tooltip-title-subtitle {
    font-size: 11px;
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
    width: var(--kh-size-xs);
    height: var(--kh-size-xs);
    min-height: var(--kh-size-xs);
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
    color: var(--cds-text-secondary, #525252);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 104px;
    flex-shrink: 1;
  }

  .tooltip-key.viz-column {
    font-weight: 600;
    color: var(--cds-text-primary, #161616);
  }
  /* The variables the map draws are never cut short: a long name wraps. */
  .tooltip-row.variable {
    grid-template-columns: minmax(0, max-content) minmax(3rem, 1fr);
  }
  .tooltip-row.variable .tooltip-key {
    max-width: none;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .tooltip-row.other .tooltip-value {
    font-weight: 400;
    color: var(--cds-text-secondary, #525252);
  }
  .tooltip-glyphs {
    display: inline-flex;
    gap: 2px;
    margin-right: 5px;
    vertical-align: -1px;
  }

  .tooltip-value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    max-width: 100%;
    justify-self: end;
  }

  .tooltip-heading {
    display: flex;
    align-items: baseline;
    gap: 6px;
    white-space: nowrap;
  }

  .tooltip-heading-key {
    font-weight: 600;
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
  }

  /* Drawn like the counts of the join summary and panel. */
  .tooltip-chip {
    --chip-color: var(--cds-border-strong-01, #8d8d8d);
    --chip-background: var(--cds-layer-01, #f4f4f4);
    padding: 0 4px 1px;
    font-weight: 600;
    color: var(--cds-text-primary, #161616);
    background-color: var(--chip-background);
    border-bottom: 1px solid var(--chip-color);
  }

  .tooltip-chip.tone-success {
    --chip-color: var(--khartis-additions-join-success, #24a148);
    --chip-background: var(--khartis-additions-join-success-bg, #defbe6);
  }

  .tooltip-chip.tone-warning {
    --chip-color: var(--khartis-additions-join-warning, #f1c21b);
    --chip-background: var(--khartis-additions-join-warning-bg, #fcf4d6);
  }

  .tooltip-chip.tone-error {
    --chip-color: var(--khartis-additions-join-error, #da1e28);
    --chip-background: var(--khartis-additions-join-error-bg, #fff1f1);
  }

  /* Two fields side by side, like a row of the join tables. */
  .tooltip-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 8px;
  }

  .tooltip-column {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  /* Read whole, on two lines when needed. */
  .tooltip-column .tooltip-key {
    white-space: normal;
    overflow: visible;
    max-width: none;
  }

  .tooltip-column-value {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .tooltip-subtitle {
    font-size: 10px;
    color: var(--cds-text-secondary, #525252);
    overflow-wrap: anywhere;
  }

  .tooltip-divider {
    margin: 4px 0;
    border: 0;
    border-top: 1px solid var(--cds-border-subtle-01, #e0e0e0);
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

  /* The pinned row's other variables: name and value on one line. */
  .interactive .tooltip-row.inline {
    grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
    column-gap: 8px;
    align-items: baseline;
  }

  .interactive .tooltip-row.inline .tooltip-value {
    justify-self: end;
    text-align: right;
  }

  .interactive .tooltip-row + .tooltip-row {
    border-top: 1px solid rgba(22, 22, 22, 0.08);
  }

  .interactive .tooltip-key {
    line-height: 1.3;
    color: var(--cds-text-helper, #6f6f6f);
  }

  .interactive .tooltip-key.viz-column {
    color: var(--cds-text-primary, #161616);
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
    color: var(--cds-text-secondary, #525252);
  }
</style>
