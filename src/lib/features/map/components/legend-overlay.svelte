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
    clampPointToBounds,
    getDragBounds,
    snapPointWithinBounds,
    type PageGridPoint,
    type PageGridSize
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
  import type { LegendItem } from '$lib/features/step-toolbar/types/legend.types';
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

  const LEGEND_ANCHOR_MARGIN_PX = 12;
  const LEGEND_DRAG_THRESHOLD_PX = 3;
  const LEGEND_CLICK_SUPPRESSION_MS = 120;

  interface FrameMeasure {
    item: LegendItem;
    width: number;
    height: number;
  }

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
  const isLegendDraggable = $derived(
    !inline && globalState.selectedStep === ToolbarStep.Styling
  );
  const pageScale = $derived(Math.max(globalState.zoom.pageZoomScale, 0.1));
  const frameScale = $derived(
    pageScale * (inline ? Math.max(0, Math.min(1, sizeScale)) : 1)
  );
  const layoutTokens = $derived.by(() =>
    resolveLayoutSizingTokens(getFormatLayoutSizingContext(formatState))
  );
  const stackGap = $derived(
    Math.max(8, Math.round(layoutTokens.legend.fontSize * 0.7))
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

  function getFramePosition(item: LegendItem): PageGridPoint | null {
    if (inline) {
      return null;
    }
    return item.dragPosition ?? autoPositions[item.id] ?? null;
  }

  function getFrameAnchorClass(item: LegendItem): string {
    if (getFramePosition(item)) {
      return '';
    }
    return getPositionClass(legendState.position);
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

  function getFrameStyle(item: LegendItem): string {
    const hasBackground = legendState.style.background.enabled;
    const shellPaddingInline = hasBackground
      ? Math.max(4, Math.round(layoutTokens.legend.paddingInline * 0.35))
      : 0;
    const shellPaddingBlock = hasBackground
      ? Math.max(3, Math.round(layoutTokens.legend.paddingBlock * 0.35))
      : 0;
    const position = getFramePosition(item);
    const transform =
      !inline &&
      !position &&
      legendState.position === LegendPosition.BOTTOM_CENTER
        ? `translateX(-50%) scale(${frameScale})`
        : `scale(${frameScale})`;
    const legendFontSize = clampFontSize(
      legendState.style.fontSize,
      layoutTokens.legend.fontSize
    );
    const styles: string[] = [
      `--legend-page-scale: ${frameScale}`,
      `--legend-padding-inline: ${shellPaddingInline}px`,
      `--legend-padding-block: ${shellPaddingBlock}px`,
      `--legend-item-gap: ${stackGap}px`,
      `font-family: ${resolveFontFamilyStack(legendState.style.fontFamily)}`,
      `font-size: ${legendFontSize}px`,
      `color: ${textHex}`,
      'border-radius: 0px',
      `transform: ${transform}`,
      `transform-origin: ${inline ? 'bottom right' : getLegendTransformOrigin(legendState.position, Boolean(position))}`
    ];

    if (hasBackground) {
      styles.push(`background-color: ${bgHsl}`);
      styles.push('box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15)');
    } else {
      styles.push('background-color: transparent');
      styles.push('box-shadow: none');
    }

    if (position) {
      styles.push(`left: ${position.x * frameScale}px`);
      styles.push(`top: ${position.y * frameScale}px`);
    }

    return styles.join('; ');
  }

  let overlayElement = $state<HTMLDivElement | null>(null);
  let frameElements = $state<Record<string, HTMLDivElement | null>>({});
  let autoPositions = $state<Record<string, PageGridPoint>>({});
  let draggingItemId = $state<string | null>(null);
  let centeredItemId = $state<string | null>(null);
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  let currentDragMoved = false;
  let suppressedClickItemId: string | null = null;
  let suppressedClickTimeoutId: ReturnType<typeof setTimeout> | null = null;

  function getPageScale(): number {
    return pageScale;
  }

  function getKeyboardMoveStep(): number {
    return formatState.gridEnabled ? PAGE_GRID_SIZE_PX : 1;
  }

  function getKeyboardFastMoveStep(): number {
    return formatState.gridEnabled ? PAGE_GRID_SIZE_PX * 5 : 10;
  }

  function getOverlaySize(): PageGridSize | null {
    if (!overlayElement) {
      return null;
    }

    return {
      width: overlayElement.offsetWidth / getPageScale(),
      height: overlayElement.offsetHeight / getPageScale()
    };
  }

  function getFrameSize(itemId: string): PageGridSize | null {
    const element = frameElements[itemId];
    if (!element) {
      return null;
    }

    return {
      width: element.offsetWidth,
      height: element.offsetHeight
    };
  }

  function getMeasuredFramePosition(itemId: string): PageGridPoint | null {
    const element = frameElements[itemId];
    if (!overlayElement || !element) {
      return null;
    }

    const scale = getPageScale();
    const overlayRect = overlayElement.getBoundingClientRect();
    const frameRect = element.getBoundingClientRect();

    return {
      x: (frameRect.left - overlayRect.left) / scale,
      y: (frameRect.top - overlayRect.top) / scale
    };
  }

  function normalizeFramePosition(
    itemId: string,
    position: PageGridPoint,
    snapEnabled = formatState.gridEnabled
  ): PageGridPoint {
    const overlaySize = getOverlaySize();
    const frameSize = getFrameSize(itemId);

    if (!overlaySize || !frameSize) {
      return position;
    }

    return snapPointWithinBounds(
      position,
      getDragBounds(overlaySize, frameSize),
      snapEnabled
    );
  }

  function measureFrames(items: LegendItem[]): FrameMeasure[] | null {
    const measures: FrameMeasure[] = [];

    for (const item of items) {
      const size = getFrameSize(item.id);
      if (!size || size.width <= 0 || size.height <= 0) {
        return null;
      }
      measures.push({ item, width: size.width, height: size.height });
    }

    return measures;
  }

  function getAnchoredFrameX(frameWidth: number, overlayWidth: number): number {
    switch (legendState.position) {
      case LegendPosition.TOP_LEFT:
      case LegendPosition.BOTTOM_LEFT:
        return LEGEND_ANCHOR_MARGIN_PX;
      case LegendPosition.BOTTOM_CENTER:
        return (overlayWidth - frameWidth) / 2;
      default:
        return overlayWidth - frameWidth - LEGEND_ANCHOR_MARGIN_PX;
    }
  }

  function stacksFromBottom(): boolean {
    return (
      legendState.position === LegendPosition.BOTTOM_LEFT ||
      legendState.position === LegendPosition.BOTTOM_RIGHT ||
      legendState.position === LegendPosition.BOTTOM_CENTER
    );
  }

  function getStackedFramePositions(
    measures: FrameMeasure[],
    overlaySize: PageGridSize
  ): Record<string, PageGridPoint> {
    const totalHeight =
      measures.reduce((sum, measure) => sum + measure.height, 0) +
      stackGap * Math.max(0, measures.length - 1);
    // A legend saved before frames were split positioned the whole stack, so
    // its origin still anchors the frames it used to contain.
    const legacyOrigin = legendState.dragPosition;
    const positions: Record<string, PageGridPoint> = {};
    let y = legacyOrigin
      ? legacyOrigin.y
      : stacksFromBottom()
        ? overlaySize.height - LEGEND_ANCHOR_MARGIN_PX - totalHeight
        : LEGEND_ANCHOR_MARGIN_PX;

    for (const measure of measures) {
      positions[measure.item.id] = clampPointToBounds(
        {
          x: legacyOrigin
            ? legacyOrigin.x
            : getAnchoredFrameX(measure.width, overlaySize.width),
          y
        },
        getDragBounds(overlaySize, {
          width: measure.width,
          height: measure.height
        })
      );
      y += measure.height + stackGap;
    }

    return positions;
  }

  function areFramePositionsEqual(
    left: Record<string, PageGridPoint>,
    right: Record<string, PageGridPoint>
  ): boolean {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) =>
        areDraggablePageItemPointsEqual(left[key], right[key] ?? null)
      )
    );
  }

  function resolveAutoPositions(): void {
    const overlaySize = getOverlaySize();
    if (!overlaySize || overlaySize.width <= 0 || overlaySize.height <= 0) {
      return;
    }

    const measures = measureFrames(
      visibleItems.filter((item) => !item.dragPosition)
    );
    if (!measures) {
      return;
    }

    const stacked = getStackedFramePositions(measures, overlaySize);
    if (!untrack(() => areFramePositionsEqual(stacked, autoPositions))) {
      autoPositions = stacked;
    }
  }

  function reclampDraggedFrames(snapEnabled: boolean): void {
    for (const item of visibleItems) {
      if (!item.dragPosition) {
        continue;
      }

      const normalized = normalizeFramePosition(
        item.id,
        item.dragPosition,
        snapEnabled
      );

      if (!areDraggablePageItemPointsEqual(normalized, item.dragPosition)) {
        legendActions.updateLegendItem(item.id, { dragPosition: normalized });
      }
    }
  }

  $effect(() => {
    void formatState.width;
    void formatState.height;
    void formatState.margins.top;
    void formatState.margins.right;
    void formatState.margins.bottom;
    void formatState.margins.left;
    void legendState.items;
    void legendState.position;
    void visualizationStore.version;
    void getLocale();
    void legendState.style.fontFamily;
    void legendState.style.fontSize;
    void legendState.style.background.enabled;

    if (inline) {
      return;
    }

    resolveAutoPositions();

    if (draggingItemId) {
      return;
    }

    reclampDraggedFrames(untrack(() => formatState.gridEnabled));
  });

  // Legend content keeps growing with fonts, breaks, and categories after the
  // stores settle, so the default stack has to follow the rendered boxes.
  $effect(() => {
    if (inline || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observed = [
      overlayElement,
      ...visibleItems.map((item) => frameElements[item.id])
    ].filter((element): element is HTMLDivElement => Boolean(element));

    if (observed.length === 0) {
      return;
    }

    const observer = new ResizeObserver(() => resolveAutoPositions());
    for (const element of observed) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  });

  const legendDragController = createDraggablePageItemController({
    getOverlayElement: () => overlayElement,
    getPageScale,
    getCurrentPosition: () => {
      const item = draggingItemId ? findItem(draggingItemId) : undefined;
      return item ? getFramePosition(item) : null;
    },
    normalizePosition: (position) =>
      draggingItemId
        ? normalizeFramePosition(draggingItemId, position)
        : position,
    setPosition: (position) => {
      if (draggingItemId) {
        legendActions.updateLegendItem(draggingItemId, {
          dragPosition: position
        });
      }
    },
    onDraggingChange: (active) => {
      if (!active) {
        draggingItemId = null;
        currentDragMoved = false;
      }
    },
    onPointerMove: trackLegendDragMove,
    onPointerUp: suppressCurrentLegendClickAfterDrag
  });

  function clearSuppressedLegendClick(): void {
    if (suppressedClickTimeoutId) {
      clearTimeout(suppressedClickTimeoutId);
      suppressedClickTimeoutId = null;
    }

    suppressedClickItemId = null;
  }

  function suppressNextLegendClick(itemId: string): void {
    clearSuppressedLegendClick();
    suppressedClickItemId = itemId;
    suppressedClickTimeoutId = setTimeout(() => {
      suppressedClickTimeoutId = null;
      suppressedClickItemId = null;
    }, LEGEND_CLICK_SUPPRESSION_MS);
  }

  function trackLegendDragMove(event: PointerEvent): void {
    if (currentDragMoved) {
      return;
    }

    const pointerDistance = Math.hypot(
      event.clientX - dragStartClientX,
      event.clientY - dragStartClientY
    );

    if (pointerDistance >= LEGEND_DRAG_THRESHOLD_PX) {
      currentDragMoved = true;
    }
  }

  function suppressCurrentLegendClickAfterDrag(): void {
    if (draggingItemId && currentDragMoved) {
      suppressNextLegendClick(draggingItemId);
    }
  }

  function findItem(itemId: string): LegendItem | undefined {
    return legendState.items.find((item) => item.id === itemId);
  }

  function stopDragging(): void {
    legendDragController.stop();
  }

  function handleFramePointerDown(event: PointerEvent, item: LegendItem): void {
    if (!isLegendDraggable) {
      return;
    }

    const element = frameElements[item.id];
    if (!overlayElement || !element) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    draggingItemId = item.id;
    currentDragMoved = false;
    dragStartClientX = event.clientX;
    dragStartClientY = event.clientY;

    if (!legendDragController.start({ event, itemElement: element })) {
      draggingItemId = null;
    }
  }

  function handleFrameClick(event: MouseEvent | KeyboardEvent): void {
    event.stopPropagation();
    legendActions.markAsOpened();
    activateStylingToolFromMap(StylingTools.Legend);
  }

  function centerFrameInViewport(target: EventTarget | null): void {
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const delta = getElementCenteringDelta(
      getFocusViewportElement(overlayElement),
      target
    );

    if (!delta) {
      return;
    }

    if (Math.abs(delta.x) < 0.5 && Math.abs(delta.y) < 0.5) {
      return;
    }

    globalActions.panPageBy(delta.x, delta.y);
  }

  function resetFrameCentering(): void {
    if (!centeredItemId) {
      return;
    }

    centeredItemId = null;
    globalActions.resetPagePan();
  }

  function handleFrameFocusClick(event: MouseEvent, item: LegendItem): void {
    if (suppressedClickItemId === item.id) {
      event.preventDefault();
      event.stopPropagation();
      clearSuppressedLegendClick();
      return;
    }

    handleFrameClick(event);
    centeredItemId = item.id;

    const currentTarget = event.currentTarget;
    if (currentTarget instanceof HTMLElement) {
      currentTarget.focus({ preventScroll: true });
    }

    void tick().then(() => {
      centerFrameInViewport(currentTarget);
    });
  }

  function handleFrameBlur(): void {
    resetFrameCentering();
  }

  function moveFrameWithKeyboard(
    event: KeyboardEvent,
    item: LegendItem
  ): boolean {
    const delta = getKeyboardMoveDelta(
      event,
      getKeyboardMoveStep(),
      getKeyboardFastMoveStep()
    );
    if (!delta || inline) {
      return false;
    }

    const currentPosition =
      getFramePosition(item) ?? getMeasuredFramePosition(item.id);
    if (!currentPosition) {
      return false;
    }

    event.preventDefault();
    handleFrameClick(event);
    legendActions.updateLegendItem(item.id, {
      dragPosition: normalizeFramePosition(item.id, {
        x: currentPosition.x + delta.x,
        y: currentPosition.y + delta.y
      })
    });
    return true;
  }

  function handleFrameKeyDown(event: KeyboardEvent, item: LegendItem): void {
    if (moveFrameWithKeyboard(event, item)) {
      return;
    }

    if (event.key !== KEY.ENTER && event.key !== KEY.SPACE) {
      return;
    }

    event.preventDefault();
    handleFrameClick(event);
    centeredItemId = item.id;
    void tick().then(() => {
      centerFrameInViewport(event.currentTarget);
    });
  }

  $effect(() => {
    if (!centeredItemId) {
      return;
    }

    if (hidden || !legendState.visible || visibleItems.length === 0) {
      resetFrameCentering();
      return;
    }

    if (!isLegendActive) {
      resetFrameCentering();
    }
  });

  onDestroy(() => {
    centeredItemId = null;
    clearSuppressedLegendClick();
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
    {#each visibleItems as item (item.id)}
      {@const viz = vizByItemId.get(item.id)}
      {@const legendSegments = getLegendSegments(item, viz, legendState.style)}
      <div
        bind:this={frameElements[item.id]}
        class="legend-container {getFrameAnchorClass(item)}"
        class:draggable={isLegendDraggable}
        class:dragging={draggingItemId === item.id}
        data-workspace-pan-ignore="true"
        style={getFrameStyle(item)}
        role="button"
        tabindex="0"
        aria-label={m.legend_frame_label({ name: item.title || item.name })}
        onclick={(event: MouseEvent) => handleFrameFocusClick(event, item)}
        onblur={handleFrameBlur}
        onkeydown={(event: KeyboardEvent) => handleFrameKeyDown(event, item)}
        onpointerdown={(event: PointerEvent) =>
          handleFramePointerDown(event, item)}
      >
        <div class="legend-item">
          {#if legendSegments.length > 0}
            <!-- Chrome keeps SVG text metrics from the last painted ancestor scale; a fresh SVG root re-measures its labels. -->
            {#key frameScale}
              {#each legendSegments as segment (segment.key)}
                <LegendSvg
                  markup={segment.svg.markup}
                  width={segment.svg.width}
                  height={segment.svg.height}
                  class={segment.className}
                  textColor={textHex}
                />
              {/each}
            {/key}
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
      </div>
    {/each}
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
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: flex-end;
    gap: 4px;
    padding: 6px;
  }

  .legend-overlay.inline .legend-container {
    position: relative;
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
    /* Positioning a frame by `left` alone would let the page edge re-wrap it
       narrower than the width its placement was measured on. */
    width: max-content;
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

  .legend-overlay:not(.inline) .legend-container:hover {
    outline: 1px dashed var(--cds-border-strong-02, #6f6f6f);
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
