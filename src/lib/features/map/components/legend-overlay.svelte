<script lang="ts">
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/stores/global.svelte';
  import {
    StylingTools,
    ToolbarStep
  } from '$lib/features/commons/types/global';
  import {
    layoutDropShadow,
    LegendPosition
  } from '$lib/features/commons/constants/ui.constants';
  import {
    type VisualizationConfig,
    visualizationStore
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { resolveLayoutSizingTokens } from '$lib/features/commons/utils/layout-sizing.utils';
  import {
    clampFontSize,
    resolveFontFamilyStack
  } from '$lib/features/step-toolbar/fonts.constants';
  import { EVENT, KEY } from '$lib/features/commons/constants/dom.constants';
  import {
    clampPointToBounds,
    getDragBounds,
    PAGE_GRID_SIZE_PX,
    PAGE_SNAP_STEP_PX,
    type PageGridPoint,
    type PageGridSize,
    remapAreaPointToResizedPage,
    roundToLayoutUnit,
    snapAreaPointWithinPage,
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
  import { alignSideTitle } from '../utils/side-title-align';
  import {
    clearLegendItemCentering,
    getLegendState,
    getPendingLegendItemCentering,
    legendActions,
    requestLegendItemFocus,
    resolveLegendItemLayout,
    selectRenderedLegendItems,
    setRenderedLegendSegments,
    setSelectedLegendItem
  } from '$lib/features/step-toolbar/tools/legend';
  import type { LegendItem } from '$lib/features/step-toolbar/types/legend.types';
  import {
    getFormatLayoutSizingContext,
    getFormatState,
    getLastPageResize,
    type PageResize
  } from '$lib/features/step-toolbar/tools/format';
  import * as m from '$lib/paraglide/messages';
  import { onDestroy, tick, untrack } from 'svelte';
  import { activateStylingToolFromMap } from '../utils/styling-tool-activation.utils';
  import { LegendSvg } from '$lib/features/commons/components/legend';
  import { mapHoverHighlightStore } from '../stores/map-hover-highlight.store.svelte';
  import { pageItemObstaclesStore } from '../stores/page-item-obstacles.store.svelte';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import {
    getLegendSegments,
    getLegendSideHeader,
    getLegendSideNote,
    isMapSizeLegendSegment,
    type LegendSegment
  } from '../utils/legend-segments.utils';
  import type { LegendSvgDefinition } from '$lib/features/commons/components/legend';

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
  const candidateItems = $derived.by(() =>
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

  // A legend points at the hovered feature when its visualization draws from
  // the same dataset; a legend anchored in a collection map answers to that
  // map alone. Exports never carry the mark.
  function getActiveEntry(
    item: LegendItem,
    segment: LegendSegment
  ): string | null {
    const hoveredRow = mapHoverHighlightStore.hoveredRow;
    if (!hoveredRow || globalState.isMapExporting || !segment.resolveEntry) {
      return null;
    }
    if (scopeVizId && hoveredRow.vizId !== scopeVizId) {
      return null;
    }
    const viz = vizByItemId.get(item.id);
    return viz?.datasetId === hoveredRow.datasetId
      ? segment.resolveEntry(hoveredRow.readValue)
      : null;
  }

  const segmentsByItemId = $derived.by(() => {
    void getLocale();
    const segments: Record<string, LegendSegment[]> = {};
    for (const item of candidateItems) {
      segments[item.id] = getLegendSegments(
        item,
        vizByItemId.get(item.id),
        legendState.style
      );
    }
    return segments;
  });

  interface LegendSideBlocks {
    header: LegendSvgDefinition | null;
    note: LegendSvgDefinition | null;
    align: 'start' | 'center' | 'end';
  }

  // A legend with its title at the left draws the title and the note apart
  // from its entries; the note spans the title and the entries.
  const sideBlocksByItemId = $derived.by(() => {
    void getLocale();
    const blocks: Record<string, LegendSideBlocks> = {};
    for (const item of candidateItems) {
      const layout = resolveLegendItemLayout(item);
      if (!layout.titleSide) continue;
      const header = getLegendSideHeader(item, legendState.style);
      const bodyWidth = Math.max(
        0,
        ...(segmentsByItemId[item.id] ?? []).map((segment) => segment.svg.width)
      );
      blocks[item.id] = {
        header,
        note: getLegendSideNote(
          item,
          legendState.style,
          (header?.width ?? 0) + bodyWidth
        ),
        align: layout.titleAlign
      };
    }
    return blocks;
  });

  function getSideTitleAlignKey(
    item: LegendItem,
    segments: LegendSegment[],
    blocks: LegendSideBlocks | undefined
  ): string {
    if (!blocks) return '';
    return [
      getItemScale(item),
      blocks.align,
      blocks.header
        ? `${blocks.header.markup.length}:${blocks.header.width}x${blocks.header.height}`
        : '',
      ...segments.map(
        (segment) => `${segment.key}:${segment.svg.width}x${segment.svg.height}`
      )
    ].join('|');
  }

  // A primitive legend that draws nothing (an outline repeating its fill)
  // gets no frame.
  const visibleItems = $derived(
    candidateItems.filter(
      (item) => !item.primitive || (segmentsByItemId[item.id]?.length ?? 0) > 0
    )
  );

  $effect(() => {
    for (const [itemId, segments] of Object.entries(segmentsByItemId)) {
      setRenderedLegendSegments(
        itemId,
        segments.map(({ key, kind }) => ({ key, kind }))
      );
    }
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
  // A facet-cell legend is shrunk to fit its cell, unless it draws symbols at
  // map size (proportional circles, widths…): those must keep the map's scale.
  function getItemScale(item: LegendItem): number {
    if (!inline) {
      return frameScale;
    }
    const segments = segmentsByItemId[item.id] ?? [];
    return segments.some(isMapSizeLegendSegment) ? pageScale : frameScale;
  }
  const layoutTokens = $derived.by(() =>
    resolveLayoutSizingTokens(getFormatLayoutSizingContext(formatState))
  );
  const stackGap = $derived(
    roundToLayoutUnit(layoutTokens.legend.fontSize * 0.7, 2)
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
    const itemScale = getItemScale(item);
    const hasBackground = legendState.style.background.enabled;
    const shellPaddingInline = hasBackground
      ? layoutTokens.legend.paddingInline
      : 0;
    const shellPaddingBlock = hasBackground
      ? layoutTokens.legend.paddingBlock
      : 0;
    const position = getFramePosition(item);
    const transform =
      !inline &&
      !position &&
      legendState.position === LegendPosition.BOTTOM_CENTER
        ? `translateX(-50%) scale(${itemScale})`
        : `scale(${itemScale})`;
    const legendFontSize = clampFontSize(
      legendState.style.fontSize,
      layoutTokens.legend.fontSize
    );
    const styles: string[] = [
      `--legend-page-scale: ${itemScale}`,
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
      styles.push(
        `box-shadow: ${legendState.style.background.shadow ? layoutDropShadow(bgOpacity) : 'none'}`
      );
    } else {
      styles.push('background-color: transparent');
      styles.push('box-shadow: none');
    }

    if (position) {
      styles.push(`left: ${position.x * itemScale}px`);
      styles.push(`top: ${position.y * itemScale}px`);
    }

    return styles.join('; ');
  }

  let overlayElement = $state<HTMLDivElement | null>(null);
  let frameElements = $state<Record<string, HTMLDivElement | null>>({});
  let autoPositions = $state<Record<string, PageGridPoint>>({});
  let frameSizeRevision = $state(0);
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
    return formatState.gridEnabled ? PAGE_SNAP_STEP_PX : 1;
  }

  function getKeyboardFastMoveStep(): number {
    return formatState.gridEnabled ? PAGE_GRID_SIZE_PX * 5 : 10;
  }

  function getMapAreaSize(): PageGridSize {
    const { margins } = formatState;
    return {
      width: Math.max(0, formatState.width - margins.left - margins.right),
      height: Math.max(0, formatState.height - margins.top - margins.bottom)
    };
  }

  function getOverlaySize(): PageGridSize | null {
    if (!overlayElement) {
      return null;
    }

    // The page legend sits on the map area. Its DOM size follows a resize
    // observer, so it lags one layout behind a page format change.
    if (!inline) {
      return getMapAreaSize();
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

  function getMapAreaOffset(): PageGridPoint {
    return { x: formatState.margins.left, y: formatState.margins.top };
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

    if (inline) {
      return snapPointWithinBounds(
        position,
        getDragBounds(overlaySize, frameSize),
        snapEnabled
      );
    }

    return snapAreaPointWithinPage(
      position,
      frameSize,
      { width: formatState.width, height: formatState.height },
      getMapAreaOffset(),
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

  let handledPageResizeId = untrack(() => getLastPageResize()?.id ?? 0);

  // A page resize keeps the margins, so a dragged frame keeps its distance to
  // the nearest page edge.
  function remapDraggedFrames(pageResize: PageResize): void {
    const offset = getMapAreaOffset();

    for (const item of visibleItems) {
      const frameSize = getFrameSize(item.id);
      if (!item.dragPosition || !frameSize) {
        continue;
      }

      legendActions.updateLegendItem(item.id, {
        dragPosition: remapAreaPointToResizedPage(
          item.dragPosition,
          frameSize,
          pageResize.from,
          pageResize.to,
          offset
        )
      });
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

    const pageResize = getLastPageResize();
    if (pageResize && pageResize.id !== handledPageResizeId) {
      handledPageResizeId = pageResize.id;
      untrack(() => remapDraggedFrames(pageResize));
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

    const observer = new ResizeObserver(() => {
      resolveAutoPositions();
      frameSizeRevision += 1;
    });
    for (const element of observed) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  });

  // Labels placed automatically keep clear of the page legend.
  $effect(() => {
    if (inline) {
      return;
    }

    void frameSizeRevision;
    const items = legendState.visible ? visibleItems : [];
    const boxes = items.flatMap((item) => {
      const position = getFramePosition(item);
      const size = getFrameSize(item.id);
      return position && size && size.width > 0 && size.height > 0
        ? [
            [
              position.x,
              position.y,
              position.x + size.width,
              position.y + size.height
            ] as [number, number, number, number]
          ]
        : [];
    });
    pageItemObstaclesStore.setBoxes('legend', boxes);
  });

  const legendDragController = createDraggablePageItemController({
    getPageFrame: () => ({
      width: formatState.width,
      height: formatState.height,
      margins: formatState.margins,
      offset: { x: formatState.margins.left, y: formatState.margins.top }
    }),
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

  // The side handles set the width the legend is drawn to, in legend units:
  // a wider frame lets a long title stay on one line. The renderer never goes
  // narrower than the content, so dragging in stops at it.
  let frameResize: {
    itemId: string;
    edge: 'w' | 'e';
    startClientX: number;
    startRenderedWidth: number;
    unitsPerScreenPx: number;
    screenPxPerPageUnit: number;
    startPosition: PageGridPoint | null;
  } | null = null;

  function handleFrameResizePointerDown(
    event: PointerEvent,
    item: LegendItem,
    edge: 'w' | 'e'
  ): void {
    const element = frameElements[item.id];
    const svg = element?.querySelector('svg');
    if (!isLegendDraggable || !element || !svg) return;
    event.preventDefault();
    event.stopPropagation();

    const svgRect = svg.getBoundingClientRect();
    const svgUnits = Number(svg.getAttribute('width'));
    if (!(svgRect.width > 0) || !(svgUnits > 0)) return;
    frameResize = {
      itemId: item.id,
      edge,
      startClientX: event.clientX,
      startRenderedWidth: svgRect.width,
      unitsPerScreenPx: svgUnits / svgRect.width,
      screenPxPerPageUnit:
        element.getBoundingClientRect().width /
        Math.max(element.offsetWidth, 1),
      startPosition: getFramePosition(item) ?? getMeasuredFramePosition(item.id)
    };
    window.addEventListener(EVENT.POINTERMOVE, handleFrameResizeMove);
    window.addEventListener(EVENT.POINTERUP, handleFrameResizeUp);
  }

  function handleFrameResizeMove(event: PointerEvent): void {
    if (!frameResize) return;
    const { itemId, edge, startClientX, startRenderedWidth, startPosition } =
      frameResize;
    const delta = event.clientX - startClientX;
    const renderedWidth = Math.max(
      1,
      startRenderedWidth + (edge === 'e' ? delta : -delta)
    );
    legendActions.updateLegendItemLayout(itemId, {
      width: Math.round(renderedWidth * frameResize.unitsPerScreenPx)
    });
    // The west edge follows the pointer: the frame moves by what it grew.
    if (edge === 'w' && startPosition) {
      legendActions.updateLegendItem(itemId, {
        dragPosition: {
          x:
            startPosition.x -
            (renderedWidth - startRenderedWidth) /
              frameResize.screenPxPerPageUnit,
          y: startPosition.y
        }
      });
    }
  }

  function handleFrameResizeUp(): void {
    frameResize = null;
    window.removeEventListener(EVENT.POINTERMOVE, handleFrameResizeMove);
    window.removeEventListener(EVENT.POINTERUP, handleFrameResizeUp);
  }

  function resetFrameWidth(event: MouseEvent, item: LegendItem): void {
    event.preventDefault();
    event.stopPropagation();
    legendActions.updateLegendItemLayout(item.id, { width: undefined });
  }

  function handleFrameClick(
    event: MouseEvent | KeyboardEvent,
    item: LegendItem
  ): void {
    event.stopPropagation();
    legendActions.markAsOpened();
    requestLegendItemFocus(item.id);
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

    globalActions.centerPageBy(delta.x, delta.y);
  }

  function resetFrameCentering(): void {
    if (!centeredItemId) {
      return;
    }

    centeredItemId = null;
    globalActions.restorePagePan();
  }

  function handleFrameFocusClick(event: MouseEvent, item: LegendItem): void {
    if (suppressedClickItemId === item.id) {
      event.preventDefault();
      event.stopPropagation();
      clearSuppressedLegendClick();
      return;
    }

    handleFrameClick(event, item);
    centeredItemId = item.id;

    const currentTarget = event.currentTarget;
    if (currentTarget instanceof HTMLElement) {
      currentTarget.focus({ preventScroll: true });
    }

    void tick().then(() => {
      centerFrameInViewport(currentTarget);
    });
  }

  // While the tool is open, focus moves into its panel: the page stays
  // centred until the tool closes.
  function handleFrameBlur(): void {
    if (isLegendActive) {
      return;
    }

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
    handleFrameClick(event, item);
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

    // Delete hides the legend, as its switch in the legend tool does.
    if (event.key === KEY.DELETE || event.key === KEY.BACKSPACE) {
      event.preventDefault();
      event.stopPropagation();
      if (centeredItemId === item.id) {
        resetFrameCentering();
      }
      legendActions.updateLegendItem(item.id, { visible: false });
      return;
    }

    if (event.key !== KEY.ENTER && event.key !== KEY.SPACE) {
      return;
    }

    event.preventDefault();
    handleFrameClick(event, item);
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

  $effect(() => {
    if (inline) return;
    setSelectedLegendItem(centeredItemId);
  });

  // Opening a legend in the tool centres the page on its frame.
  $effect(() => {
    const itemId = getPendingLegendItemCentering();
    if (inline || !itemId) return;

    untrack(() => {
      clearLegendItemCentering();
      const frame = frameElements[itemId];
      if (!frame || hidden) return;
      centeredItemId = itemId;
      void tick().then(() => {
        centerFrameInViewport(frame);
      });
    });
  });

  onDestroy(() => {
    if (!inline) {
      pageItemObstaclesStore.setBoxes('legend', []);
      setSelectedLegendItem(null);
    }
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
      {@const legendSegments = segmentsByItemId[item.id] ?? []}
      {@const sideBlocks = sideBlocksByItemId[item.id]}
      <div
        bind:this={frameElements[item.id]}
        class="legend-container {getFrameAnchorClass(item)}"
        class:draggable={isLegendDraggable}
        class:dragging={draggingItemId === item.id}
        data-legend-item-id={item.id}
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
        <div
          class="legend-item"
          class:legend-item--side={sideBlocks !== undefined}
          use:alignSideTitle={{
            align: sideBlocks?.align ?? 'start',
            key: getSideTitleAlignKey(item, legendSegments, sideBlocks)
          }}
        >
          {#if legendSegments.length > 0}
            <!-- Chrome keeps SVG text metrics from the last painted ancestor scale; a fresh SVG root re-measures its labels. -->
            {#key getItemScale(item)}
              {#if sideBlocks?.header}
                <div class="legend-side-head">
                  <LegendSvg
                    markup={sideBlocks.header.markup}
                    width={sideBlocks.header.width}
                    height={sideBlocks.header.height}
                    class="legend-svg--side-title"
                    textColor={textHex}
                  />
                </div>
              {/if}
              <div class="legend-entries">
                {#each legendSegments as segment (segment.key)}
                  <LegendSvg
                    activeEntry={getActiveEntry(item, segment)}
                    markup={segment.svg.markup}
                    width={segment.svg.width}
                    height={segment.svg.height}
                    class={segment.className}
                    textColor={textHex}
                  />
                {/each}
              </div>
              {#if sideBlocks?.note}
                <div class="legend-side-note">
                  <LegendSvg
                    markup={sideBlocks.note.markup}
                    width={sideBlocks.note.width}
                    height={sideBlocks.note.height}
                    class="legend-svg--side-note"
                    textColor={textHex}
                  />
                </div>
              {/if}
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
        {#if isLegendDraggable && !inline && legendSegments.length > 0}
          {#each ['w', 'e'] as const as edge (edge)}
            <div
              class="legend-resize-edge legend-resize-{edge}"
              role="separator"
              aria-orientation="vertical"
              aria-label={m.legend_resize_handle()}
              title={m.legend_resize_handle()}
              onpointerdown={(event: PointerEvent) =>
                handleFrameResizePointerDown(event, item, edge)}
              ondblclick={(event: MouseEvent) => resetFrameWidth(event, item)}
            ></div>
          {/each}
        {/if}
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
    padding: 8px;
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

  .legend-resize-edge {
    position: absolute;
    top: 0;
    bottom: 0;
    width: calc(8px / var(--legend-page-scale));
    cursor: ew-resize;
    touch-action: none;
    opacity: 0;
  }

  .legend-resize-w {
    left: calc(-4px / var(--legend-page-scale));
  }

  .legend-resize-e {
    right: calc(-4px / var(--legend-page-scale));
  }

  .legend-resize-edge::after {
    position: absolute;
    top: 50%;
    left: 50%;
    width: calc(8px / var(--legend-page-scale));
    height: calc(8px / var(--legend-page-scale));
    box-sizing: border-box;
    background: white;
    border: calc(2px / var(--legend-page-scale)) solid
      var(--cds-interactive-01, #0072c3);
    border-radius: 2px;
    content: '';
    transform: translate(-50%, -50%);
  }

  .legend-overlay:not(.inline) .legend-container:hover .legend-resize-edge {
    opacity: 1;
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

  .legend-item--side {
    display: grid;
    grid-template-columns: auto auto;
    justify-content: start;
  }

  .legend-side-head {
    grid-column: 1;
    grid-row: 1;
    align-self: start;
  }

  .legend-item--side .legend-entries {
    grid-column: 2;
    grid-row: 1;
  }

  .legend-side-note {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .legend-title {
    margin: 0 0 4px 0;
    font-size: 1em;
    font-weight: 600;
    color: inherit;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: pre-line;
  }

  .legend-subtitle {
    margin: 0 0 4px 0;
    color: inherit;
    font-size: 0.9em;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: pre-line;
  }

  .legend-note {
    margin: 0;
    color: inherit;
    font-size: 0.85em;
    font-style: italic;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: pre-line;
  }

  :global(.legend-svg) {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 0;
    overflow: visible;
  }
</style>
