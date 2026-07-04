<script lang="ts">
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/stores/global.svelte';
  import {
    StylingTools,
    ToolbarStep
  } from '$lib/features/commons/types/global';
  import { LegendPosition } from '$lib/features/commons/constants/ui.constants';
  import {
    visualizationStore,
    type VisualizationConfig
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { resolveLayoutSizingTokens } from '$lib/features/commons/utils/layout-sizing.utils';
  import {
    clampFontSize,
    resolveFontFamilyStack
  } from '$lib/features/step-toolbar/fonts.constants';
  import { KEY } from '$lib/features/commons/constants/dom.constants';
  import {
    PAGE_GRID_SIZE_PX,
    getDragBounds,
    snapPointWithinBounds
  } from '$lib/features/commons/utils/page-grid.utils';
  import {
    getElementCenteringDelta,
    getFocusViewportElement
  } from '../utils/focus-viewport.utils';
  import {
    areDraggablePageItemPointsEqual,
    createDraggablePageItemController
  } from '../utils/use-draggable-page-item';
  import { getKeyboardMoveDelta } from '../utils/keyboard-position.utils';
  import {
    getLegendState,
    legendActions,
    selectRenderedLegendItems
  } from '$lib/features/step-toolbar/tools/legend';
  import {
    getFormatLayoutSizingContext,
    getFormatState
  } from '$lib/features/step-toolbar/tools/format';
  import * as m from '$lib/paraglide/messages';
  import { tick, untrack, onDestroy } from 'svelte';
  import { activateStylingToolFromMap } from '../utils/styling-tool-activation.utils';
  import { LegendSvg } from '$lib/features/commons/components/legend';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import { getLegendSegments } from '../utils/legend-segments.utils';

  // `scopeVizId`, `inline`, and `sizeScale` make legends facet-cell scoped.
  let {
    hidden = false,
    scopeVizId = null,
    inline = false,
    sizeScale = 1
  }: {
    hidden?: boolean;
    scopeVizId?: string | null;
    inline?: boolean;
    sizeScale?: number;
  } = $props();

  const legendState = $derived(getLegendState());
  const formatState = $derived(getFormatState());
  const visibleItems = $derived.by(() =>
    selectRenderedLegendItems(
      legendState.items.filter((i) => i.visible),
      { scopeVizId }
    )
  );

  const vizByItemId = $derived.by(() => {
    void visualizationStore.version;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Recreated wholesale in a derived value; mutation tracking is unnecessary.
    const map = new Map<string, VisualizationConfig>();
    for (const item of legendState.items) {
      if (item.variableId) {
        const viz = visualizationStore.visualizations.find(
          (v) => v.id === item.variableId
        );
        if (viz) map.set(item.id, viz);
      }
    }
    return map;
  });

  $effect(() => {
    void getLocale();
    void visualizationStore.version;
    legendActions.syncWithVisualizations();
  });

  const bgColor = $derived(legendState.style.background.color);
  const bgOpacity = $derived(
    Math.max(0, Math.min(100, legendState.style.background.opacity)) / 100
  );
  const bgHsl = $derived(
    `hsl(${bgColor.hue} ${bgColor.saturation}% ${bgColor.lightness}% / ${bgOpacity})`
  );
  const textColor = $derived(legendState.style.textColor);
  const textHex = $derived(
    hslToHex(textColor.hue, textColor.saturation, textColor.lightness)
  );
  const isLegendActive = $derived(
    !inline &&
      globalState.selectedStep === ToolbarStep.Styling &&
      globalState.selectedTool === StylingTools.Legend
  );
  const pageScale = $derived(Math.max(globalState.zoom.pageZoomScale, 0.1));
  const layoutTokens = $derived.by(() =>
    resolveLayoutSizingTokens(getFormatLayoutSizingContext(formatState))
  );

  function getPositionClass(position: LegendPosition): string {
    switch (position) {
      case LegendPosition.TOP_LEFT:
        return 'top-left';
      case LegendPosition.TOP_RIGHT:
        return 'top-right';
      case LegendPosition.BOTTOM_LEFT:
        return 'bottom-left';
      case LegendPosition.BOTTOM_RIGHT:
        return 'bottom-right';
      case LegendPosition.BOTTOM_CENTER:
        return 'bottom-center';
      default:
        return 'top-right';
    }
  }

  const positionClass = $derived.by(() => {
    if (inline || legendState.dragPosition) {
      return '';
    }
    return getPositionClass(legendState.position);
  });

  const containerStyle = $derived.by(() => {
    const scale =
      getPageScale() * (inline ? Math.max(0, Math.min(1, sizeScale)) : 1);
    const hasBackground = legendState.style.background.enabled;
    const shellPaddingInline = hasBackground
      ? Math.max(4, Math.round(layoutTokens.legend.paddingInline * 0.35))
      : 0;
    const shellPaddingBlock = hasBackground
      ? Math.max(3, Math.round(layoutTokens.legend.paddingBlock * 0.35))
      : 0;
    const transform =
      !inline &&
      !legendState.dragPosition &&
      legendState.position === LegendPosition.BOTTOM_CENTER
        ? `translateX(-50%) scale(${scale})`
        : `scale(${scale})`;
    const legendFontSize = clampFontSize(
      legendState.style.fontSize,
      layoutTokens.legend.fontSize
    );
    const styles: string[] = [
      `--legend-page-scale: ${scale}`,
      `--legend-padding-inline: ${shellPaddingInline}px`,
      `--legend-padding-block: ${shellPaddingBlock}px`,
      `--legend-item-gap: ${Math.max(8, Math.round(layoutTokens.legend.fontSize * 0.7))}px`,
      `font-family: ${resolveFontFamilyStack(legendState.style.fontFamily)}`,
      `font-size: ${legendFontSize}px`,
      `color: ${textHex}`,
      'border-radius: 0px',
      `transform: ${transform}`,
      `transform-origin: ${inline ? 'bottom right' : getLegendTransformOrigin(legendState.position, Boolean(legendState.dragPosition))}`
    ];

    if (hasBackground) {
      styles.push(`background-color: ${bgHsl}`);
      styles.push('box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15)');
    } else {
      styles.push('background-color: transparent');
      styles.push('box-shadow: none');
    }

    if (!inline && legendState.dragPosition) {
      styles.push(`left: ${legendState.dragPosition.x * scale}px`);
      styles.push(`top: ${legendState.dragPosition.y * scale}px`);
    }

    return styles.join('; ');
  });

  let overlayElement = $state<HTMLDivElement | null>(null);
  let legendElement = $state<HTMLDivElement | null>(null);
  let isDragging = $state(false);
  let isLegendCentered = $state(false);

  function getPageScale(): number {
    return pageScale;
  }

  function getKeyboardMoveStep(): number {
    return formatState.gridEnabled ? PAGE_GRID_SIZE_PX : 1;
  }

  function getKeyboardFastMoveStep(): number {
    return formatState.gridEnabled ? PAGE_GRID_SIZE_PX * 5 : 10;
  }

  function getLegendTransformOrigin(
    position: LegendPosition,
    isCustomPosition: boolean
  ): string {
    if (isCustomPosition) {
      return 'top left';
    }

    switch (position) {
      case LegendPosition.TOP_LEFT:
        return 'top left';
      case LegendPosition.BOTTOM_LEFT:
        return 'bottom left';
      case LegendPosition.BOTTOM_RIGHT:
        return 'bottom right';
      case LegendPosition.BOTTOM_CENTER:
        return 'bottom center';
      case LegendPosition.TOP_RIGHT:
      default:
        return 'top right';
    }
  }

  function getOverlaySize(): { width: number; height: number } | null {
    if (!overlayElement) {
      return null;
    }

    return {
      width: overlayElement.offsetWidth / getPageScale(),
      height: overlayElement.offsetHeight / getPageScale()
    };
  }

  function getLegendSize(): { width: number; height: number } | null {
    if (!legendElement) {
      return null;
    }

    return {
      width: legendElement.offsetWidth,
      height: legendElement.offsetHeight
    };
  }

  function getLegendKeyboardPosition(): { x: number; y: number } | null {
    if (legendState.dragPosition) {
      return legendState.dragPosition;
    }

    if (!overlayElement || !legendElement) {
      return null;
    }

    const scale = getPageScale();
    const overlayRect = overlayElement.getBoundingClientRect();
    const legendRect = legendElement.getBoundingClientRect();

    return {
      x: (legendRect.left - overlayRect.left) / scale,
      y: (legendRect.top - overlayRect.top) / scale
    };
  }

  function normalizeLegendDragPosition(
    position: { x: number; y: number },
    snapEnabled = formatState.gridEnabled
  ): { x: number; y: number } {
    const overlaySize = getOverlaySize();
    const legendSize = getLegendSize();

    if (!overlaySize || !legendSize) {
      return position;
    }

    return snapPointWithinBounds(
      position,
      getDragBounds(overlaySize, legendSize),
      snapEnabled
    );
  }

  $effect(() => {
    void formatState.width;
    void formatState.height;
    void formatState.margins.top;
    void formatState.margins.right;
    void formatState.margins.bottom;
    void formatState.margins.left;
    void legendState.items;
    void legendState.style.fontFamily;
    void legendState.style.fontSize;
    void legendState.style.background.enabled;

    if (isDragging || !legendState.dragPosition) {
      return;
    }

    const normalizedPosition = normalizeLegendDragPosition(
      legendState.dragPosition,
      untrack(() => formatState.gridEnabled)
    );

    if (
      !areDraggablePageItemPointsEqual(
        normalizedPosition,
        legendState.dragPosition
      )
    ) {
      legendActions.setDragPosition(normalizedPosition);
    }
  });

  const legendDragController = createDraggablePageItemController({
    getOverlayElement: () => overlayElement,
    getPageScale,
    getCurrentPosition: () => legendState.dragPosition,
    normalizePosition: normalizeLegendDragPosition,
    setPosition: (position) => legendActions.setDragPosition(position),
    onDraggingChange: (active) => {
      isDragging = active;
    }
  });

  function stopDragging(): void {
    legendDragController.stop();
  }

  function handleLegendPointerDown(event: PointerEvent): void {
    if (!isLegendActive) {
      return;
    }

    if (!overlayElement || !legendElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    legendDragController.start({
      event,
      itemElement: legendElement
    });
  }

  function handleLegendClick(event: MouseEvent | KeyboardEvent): void {
    event.stopPropagation();
    legendActions.markAsOpened();
    activateStylingToolFromMap(StylingTools.Legend);
  }

  function centerLegendInViewport(target: EventTarget | null): void {
    const targetElement =
      target instanceof HTMLElement ? target : legendElement;
    const delta = getElementCenteringDelta(
      getFocusViewportElement(overlayElement),
      targetElement
    );

    if (!delta) {
      return;
    }

    if (Math.abs(delta.x) < 0.5 && Math.abs(delta.y) < 0.5) {
      return;
    }

    globalActions.panPageBy(delta.x, delta.y);
  }

  function resetLegendCentering(): void {
    if (!isLegendCentered) {
      return;
    }

    isLegendCentered = false;
    globalActions.resetPagePan();
  }

  function handleLegendFocusClick(event: MouseEvent): void {
    handleLegendClick(event);
    isLegendCentered = true;

    const currentTarget = event.currentTarget;
    if (currentTarget instanceof HTMLElement) {
      currentTarget.focus({ preventScroll: true });
    }

    void tick().then(() => {
      centerLegendInViewport(currentTarget);
    });
  }

  function handleLegendBlur(): void {
    resetLegendCentering();
  }

  function moveLegendWithKeyboard(event: KeyboardEvent): boolean {
    const delta = getKeyboardMoveDelta(
      event,
      getKeyboardMoveStep(),
      getKeyboardFastMoveStep()
    );
    if (!delta || inline) {
      return false;
    }

    const currentPosition = getLegendKeyboardPosition();
    if (!currentPosition) {
      return false;
    }

    event.preventDefault();
    handleLegendClick(event);
    legendActions.setDragPosition(
      normalizeLegendDragPosition({
        x: currentPosition.x + delta.x,
        y: currentPosition.y + delta.y
      })
    );
    return true;
  }

  function handleLegendKeyDown(event: KeyboardEvent): void {
    if (moveLegendWithKeyboard(event)) {
      return;
    }

    if (event.key !== KEY.ENTER && event.key !== KEY.SPACE) {
      return;
    }

    event.preventDefault();
    handleLegendClick(event);
    isLegendCentered = true;
    void tick().then(() => {
      centerLegendInViewport(event.currentTarget);
    });
  }

  $effect(() => {
    if (!isLegendCentered) {
      return;
    }

    if (hidden || !legendState.visible || visibleItems.length === 0) {
      resetLegendCentering();
      return;
    }

    if (!isLegendActive) {
      resetLegendCentering();
    }
  });

  onDestroy(() => {
    isLegendCentered = false;
    stopDragging();
  });
</script>

{#if legendState.visible && visibleItems.length > 0}
  <div
    class="legend-overlay"
    class:hidden={hidden}
    class:inline={inline}
    bind:this={overlayElement}
  >
    <div
      bind:this={legendElement}
      class="legend-container {positionClass}"
      class:draggable={isLegendActive}
      class:dragging={isDragging}
      data-workspace-pan-ignore="true"
      style={containerStyle}
      role="button"
      tabindex="0"
      aria-label={m.tool_legend()}
      ondblclick={handleLegendFocusClick}
      onblur={handleLegendBlur}
      onkeydown={handleLegendKeyDown}
      onpointerdown={handleLegendPointerDown}
    >
      {#each visibleItems as item (item.id)}
        {@const viz = vizByItemId.get(item.id)}
        {@const legendSegments = getLegendSegments(
          item,
          viz,
          legendState.style
        )}
        <div class="legend-item">
          {#if legendSegments.length > 0}
            {#each legendSegments as segment (segment.key)}
              <LegendSvg
                markup={segment.svg.markup}
                width={segment.svg.width}
                height={segment.svg.height}
                class={segment.className}
                textColor={textHex}
              />
            {/each}
          {:else}
            {#if item.title}
              <h4 class="legend-title">{item.title}</h4>
            {/if}
            {#if item.subtitle}
              <p class="legend-subtitle">{item.subtitle}</p>
            {/if}
            {#if item.note}
              <p class="legend-note">{item.note}</p>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .legend-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: var(--z-content);
  }

  .legend-overlay.hidden {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  :global(.is-exporting-map) .legend-overlay.hidden {
    opacity: 1;
    visibility: visible;
  }

  .legend-overlay.inline {
    position: absolute;
    inset: 0;
  }

  .legend-overlay.inline .legend-container {
    position: absolute;
    right: 6px;
    bottom: 6px;
    cursor: default;
    pointer-events: none;
  }

  .legend-container {
    --legend-page-scale: 1;
    --legend-padding-inline: 0px;
    --legend-padding-block: 0px;
    --legend-item-gap: 4px;
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: var(--legend-item-gap);
    background: transparent;
    padding: var(--legend-padding-block) var(--legend-padding-inline);
    border-radius: 0;
    box-shadow: none;
    max-width: 90%;
    overflow-wrap: anywhere;
    pointer-events: auto;
    cursor: pointer;
    touch-action: none;
    outline: none;
  }

  .legend-container.draggable {
    cursor: grab;
  }

  .legend-container.draggable:hover {
    outline: 1px dashed #726e6e;
  }

  .legend-container.dragging {
    cursor: grabbing;
    user-select: none;
    background-color: var(--cds-layer-hover-01, #f4f4f4) !important;
  }

  .legend-container.top-left {
    top: calc(12px * var(--legend-page-scale));
    left: calc(12px * var(--legend-page-scale));
  }

  .legend-container.top-right {
    top: calc(12px * var(--legend-page-scale));
    right: calc(12px * var(--legend-page-scale));
  }

  .legend-container.bottom-left {
    bottom: calc(12px * var(--legend-page-scale));
    left: calc(12px * var(--legend-page-scale));
  }

  .legend-container.bottom-right {
    bottom: calc(12px * var(--legend-page-scale));
    right: calc(12px * var(--legend-page-scale));
  }

  .legend-container.bottom-center {
    bottom: calc(12px * var(--legend-page-scale));
    left: 50%;
  }

  .legend-item {
    min-width: 0;
    padding-bottom: var(--legend-item-gap);
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }

  .legend-item:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }

  .legend-title {
    margin: 0 0 3px 0;
    font-size: 1em;
    font-weight: 600;
    color: inherit;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .legend-subtitle {
    margin: 0 0 2px 0;
    color: inherit;
    font-size: 0.9em;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .legend-note {
    margin: 0;
    color: inherit;
    font-size: 0.85em;
    font-style: italic;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  :global(.legend-svg) {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 0;
    overflow: visible;
  }
</style>
