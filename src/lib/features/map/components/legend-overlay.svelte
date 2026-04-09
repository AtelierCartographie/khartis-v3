<script module lang="ts">
  import { motif } from '@ateliercartographie/motif.js';
  import { PATTERN_TYPE_MAP } from '../layers/pattern-texture';
  import type { PatternParams } from '$lib/features/commons/store/visualization.store.svelte';

  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- module-level cache, no reactivity needed
  const patternTileCache = new Map<string, string>();

  function getPatternTileUrl(
    patternId: string,
    patternColor = '#000000',
    backgroundColor = '#ffffff',
    patternParams?: PatternParams
  ): string | null {
    const cacheKey = JSON.stringify({
      patternId,
      patternColor,
      backgroundColor,
      angle: patternParams?.angle,
      size: patternParams?.size,
      scale: patternParams?.scale
    });
    if (patternTileCache.has(cacheKey)) return patternTileCache.get(cacheKey)!;
    const config = PATTERN_TYPE_MAP[patternId as keyof typeof PATTERN_TYPE_MAP];
    if (!config) return null;
    const scale = Math.max(4, patternParams?.scale ?? 8);
    const size = Math.max(1, patternParams?.size ?? 4);
    const tile = motif({
      type: config.type,
      angle: patternParams?.angle ?? config.angle,
      fill: patternColor,
      background: backgroundColor,
      size: Math.round((size / scale) * 100),
      scale: scale / 10,
      patchSize: true
    }).tile();
    const url = tile.toDataURL();
    patternTileCache.set(cacheKey, url);
    return url;
  }
</script>

<script lang="ts">
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import {
    StylingTools,
    ToolbarStep
  } from '$lib/features/commons/types/global';
  import { LegendPosition } from '$lib/features/commons/constants/ui.constants';
  import {
    ScaleType,
    visualizationStore,
    type VisualizationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { hexToRgb, hslToHex } from '$lib/features/commons/utils/color-utils';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import {
    getLegendState,
    legendActions
  } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
  import { FillMode, ShapeType } from '$lib/features/main-toolbar/constants';
  import * as m from '$lib/paraglide/messages';
  import { SvelteMap } from 'svelte/reactivity';
  import { onDestroy } from 'svelte';
  import { activateStylingToolFromMap } from '../utils/styling-tool-activation.utils';
  import {
    getSizeForValue,
    shouldApplyProportionalSymbols
  } from '../utils/data-styling.utils';

  const LEGEND_EDGE_OFFSET = 16;
  const LEGEND_POSITION_FALLBACKS: LegendPosition[] = [
    LegendPosition.BOTTOM_LEFT,
    LegendPosition.BOTTOM_CENTER,
    LegendPosition.BOTTOM_RIGHT,
    LegendPosition.TOP_LEFT,
    LegendPosition.TOP_RIGHT
  ];

  type RelativeRect = {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };

  type ProportionalLegendScale = {
    minValue: number;
    maxValue: number;
    minSize: number;
    maxSize: number;
    midValue?: number;
    midSize?: number;
    fillColor: string;
    strokeColor: string;
    fillOpacity: number;
    shape: ShapeType;
  };

  function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'bigint') {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? numericValue : null;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? numericValue : null;
    }

    return null;
  }

  function resolveStyleColor(
    color: string | string[] | undefined,
    fallback: string
  ): string {
    if (Array.isArray(color)) {
      return typeof color[0] === 'string' ? color[0] : fallback;
    }

    return typeof color === 'string' ? color : fallback;
  }

  function getPatternOverlayColor(fillColor: string | undefined): string {
    if (!fillColor?.startsWith('#') || fillColor.length !== 7) {
      return '#000000';
    }

    const [r, g, b] = hexToRgb(fillColor);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

    return luminance < 0.45 ? '#ffffff' : '#000000';
  }

  function getPatternSwatchStyle(
    patternId: string | undefined,
    fillColor: string,
    patternParams: NonNullable<
      VisualizationConfig['classification']
    >['patternParams']
  ): string {
    if (!patternId) {
      return `background-color: ${fillColor};`;
    }

    const patternTileUrl = getPatternTileUrl(
      patternId,
      getPatternOverlayColor(fillColor),
      fillColor,
      patternParams
    );

    if (!patternTileUrl) {
      return `background-color: ${fillColor};`;
    }

    return `background-color: ${fillColor}; background-image: url(${patternTileUrl}); background-repeat: repeat; background-position: center;`;
  }

  function hasColorScale(viz: VisualizationConfig | undefined): boolean {
    if (
      !viz?.classification?.colors?.length ||
      !viz?.classification?.breaks?.length
    ) {
      return false;
    }
    return viz.modes?.fill === FillMode.CLASSES;
  }

  function hasCategoricalScale(viz: VisualizationConfig | undefined): boolean {
    if (!viz?.classification?.colors?.length) return false;
    return viz.modes?.fill === FillMode.CATEGORIES;
  }

  function getCategoryLabels(viz: VisualizationConfig | undefined): string[] {
    return viz?.classification?.labels ?? [];
  }

  function getProportionalLegendScale(
    viz: VisualizationConfig | undefined
  ): ProportionalLegendScale | null {
    if (!viz || !shouldApplyProportionalSymbols(viz) || !viz.datasetId) {
      return null;
    }

    const sizeColumn = viz.mapping.sizeColumn;
    if (!sizeColumn) {
      return null;
    }

    const stats = datasetsStore.getColumnStatistics(viz.datasetId, sizeColumn);
    const minValue = stats && 'min' in stats ? toFiniteNumber(stats.min) : null;
    const maxValue = stats && 'max' in stats ? toFiniteNumber(stats.max) : null;

    if (minValue === null || maxValue === null) {
      return null;
    }

    const minSize = Math.max(1, viz.symbols?.minSize ?? 1);
    const maxSize = Math.max(minSize, viz.symbols?.maxSize ?? minSize);
    const scale = viz.symbols?.sizeScale ?? ScaleType.LINEAR;
    const resolvedMinSize = getSizeForValue(
      minValue,
      minValue,
      maxValue,
      minSize,
      maxSize,
      scale
    );
    const resolvedMaxSize = getSizeForValue(
      maxValue,
      minValue,
      maxValue,
      minSize,
      maxSize,
      scale
    );
    const hasRange = minValue !== maxValue;
    const midValue = hasRange
      ? minValue + (maxValue - minValue) / 2
      : undefined;
    const resolvedMidSize =
      midValue === undefined
        ? undefined
        : getSizeForValue(
            midValue,
            minValue,
            maxValue,
            minSize,
            maxSize,
            scale
          );

    return {
      minValue,
      maxValue,
      minSize: resolvedMinSize,
      maxSize: resolvedMaxSize,
      midValue,
      midSize: resolvedMidSize,
      fillColor: resolveStyleColor(viz.style.fillColor, '#4589ff'),
      strokeColor: resolveStyleColor(viz.style.strokeColor, '#525252'),
      fillOpacity: Math.max(
        0.2,
        Math.min(1, (viz.style.fillOpacity ?? 100) / 100)
      ),
      shape: viz.symbols?.type ?? ShapeType.POINT
    };
  }

  function getProportionalSymbolStyle(
    scale: ProportionalLegendScale,
    size: number
  ): string {
    const diameter = Math.max(10, Math.round(size * 2));
    const styles = [
      `width: ${diameter}px`,
      `height: ${diameter}px`,
      `background-color: ${scale.fillColor}`,
      `opacity: ${scale.fillOpacity}`,
      'box-sizing: border-box'
    ];

    if (scale.shape === ShapeType.POINT) {
      styles.push('border-radius: 999px');
      styles.push(`border: 1px solid ${scale.strokeColor}`);
    } else if (scale.shape === ShapeType.TRIANGLE) {
      styles.push('clip-path: polygon(50% 0, 0 100%, 100% 100%)');
    } else {
      styles.push('border-radius: 2px');
      styles.push(`border: 1px solid ${scale.strokeColor}`);
    }

    return styles.join('; ');
  }

  function formatBreakValue(value: number): string {
    if (Number.isInteger(value)) return value.toLocaleString();
    if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
    return value.toFixed(1);
  }

  function getColorScaleLabel(
    breaks: number[],
    colorCount: number,
    index: number
  ): string {
    if (breaks.length === 0) {
      return '';
    }

    if (colorCount === breaks.length + 1) {
      const firstBreak = breaks[0];
      if (index === 0) {
        return firstBreak !== undefined
          ? `< ${formatBreakValue(firstBreak)}`
          : '';
      }

      if (index < breaks.length) {
        const lowerBreak = breaks[index - 1];
        const upperBreak = breaks[index];
        return lowerBreak !== undefined && upperBreak !== undefined
          ? `${formatBreakValue(lowerBreak)} – ${formatBreakValue(upperBreak)}`
          : '';
      }

      const lastBreak = breaks[breaks.length - 1];
      return lastBreak !== undefined ? `≥ ${formatBreakValue(lastBreak)}` : '';
    }

    if (colorCount === breaks.length) {
      if (index < breaks.length - 1) {
        const lowerBreak = breaks[index];
        const upperBreak = breaks[index + 1];
        return lowerBreak !== undefined && upperBreak !== undefined
          ? `${formatBreakValue(lowerBreak)} – ${formatBreakValue(upperBreak)}`
          : '';
      }

      const lastBreak = breaks[breaks.length - 1];
      return lastBreak !== undefined ? `≥ ${formatBreakValue(lastBreak)}` : '';
    }

    const fallbackBreak =
      index < breaks.length ? breaks[index] : breaks[breaks.length - 1];
    return fallbackBreak !== undefined ? formatBreakValue(fallbackBreak) : '';
  }

  const legendState = $derived(getLegendState());
  const visibleItems = $derived(legendState.items.filter((i) => i.visible));

  // Build a reactive map from variableId → visualization for color scale rendering
  const vizByItemId = $derived.by(() => {
    void visualizationStore.version;
    const map = new SvelteMap<string, VisualizationConfig>();
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
  const isInDataStep = $derived(globalState.selectedStep === ToolbarStep.Data);
  const isLegendActive = $derived(
    globalState.selectedStep === ToolbarStep.Styling &&
      globalState.selectedTool === StylingTools.Legend
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

  function getCandidatePositions(
    preferredPosition: LegendPosition
  ): LegendPosition[] {
    return [
      preferredPosition,
      ...LEGEND_POSITION_FALLBACKS.filter(
        (position) => position !== preferredPosition
      )
    ];
  }

  function rectsOverlap(a: RelativeRect, b: RelativeRect): boolean {
    return !(
      a.right <= b.left ||
      a.left >= b.right ||
      a.bottom <= b.top ||
      a.top >= b.bottom
    );
  }

  function getLegendCandidateRect(
    position: LegendPosition,
    overlayOffsetX: number,
    overlayOffsetY: number,
    overlayWidth: number,
    overlayHeight: number,
    legendWidth: number,
    legendHeight: number
  ): RelativeRect {
    const maxLeft = Math.max(LEGEND_EDGE_OFFSET, overlayWidth - legendWidth);
    const maxTop = Math.max(LEGEND_EDGE_OFFSET, overlayHeight - legendHeight);

    let left = LEGEND_EDGE_OFFSET;
    let top = LEGEND_EDGE_OFFSET;

    switch (position) {
      case LegendPosition.TOP_RIGHT:
        left = Math.max(
          LEGEND_EDGE_OFFSET,
          overlayWidth - legendWidth - LEGEND_EDGE_OFFSET
        );
        break;
      case LegendPosition.BOTTOM_LEFT:
        top = Math.max(
          LEGEND_EDGE_OFFSET,
          overlayHeight - legendHeight - LEGEND_EDGE_OFFSET
        );
        break;
      case LegendPosition.BOTTOM_RIGHT:
        left = Math.max(
          LEGEND_EDGE_OFFSET,
          overlayWidth - legendWidth - LEGEND_EDGE_OFFSET
        );
        top = Math.max(
          LEGEND_EDGE_OFFSET,
          overlayHeight - legendHeight - LEGEND_EDGE_OFFSET
        );
        break;
      case LegendPosition.BOTTOM_CENTER:
        left = clamp(
          (overlayWidth - legendWidth) / 2,
          LEGEND_EDGE_OFFSET,
          maxLeft
        );
        top = Math.max(
          LEGEND_EDGE_OFFSET,
          overlayHeight - legendHeight - LEGEND_EDGE_OFFSET
        );
        break;
      case LegendPosition.TOP_LEFT:
      default:
        break;
    }

    left = clamp(left, LEGEND_EDGE_OFFSET, maxLeft);
    top = clamp(top, LEGEND_EDGE_OFFSET, maxTop);

    return {
      left: overlayOffsetX + left,
      top: overlayOffsetY + top,
      right: overlayOffsetX + left + legendWidth,
      bottom: overlayOffsetY + top + legendHeight
    };
  }

  let autoPosition = $state<LegendPosition | null>(null);

  const positionClass = $derived.by(() => {
    if (legendState.dragPosition) {
      return '';
    }
    return getPositionClass(autoPosition ?? legendState.position);
  });

  const containerStyle = $derived.by(() => {
    const styles: string[] = [
      `font-family: ${legendState.style.fontFamily}, sans-serif`,
      `font-size: ${legendState.style.fontSize}px`,
      `color: ${textHex}`
    ];

    if (legendState.style.background.enabled) {
      styles.push(`background-color: ${bgHsl}`);
      styles.push('box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15)');
    } else {
      styles.push('background-color: transparent');
      styles.push('box-shadow: none');
    }

    if (legendState.dragPosition) {
      styles.push(`left: ${legendState.dragPosition.x}px`);
      styles.push(`top: ${legendState.dragPosition.y}px`);
    }

    return styles.join('; ');
  });

  let overlayElement = $state<HTMLDivElement | null>(null);
  let legendElement = $state<HTMLDivElement | null>(null);
  let isDragging = $state(false);
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function stopDragging(): void {
    isDragging = false;
    window.removeEventListener(EVENT.POINTERMOVE, handlePointerMove);
    window.removeEventListener(EVENT.POINTERUP, handlePointerUp);
  }

  function handlePointerUp(): void {
    stopDragging();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!isDragging || !overlayElement) {
      return;
    }

    const scale = globalState.zoom.pageZoomLevel / 100;
    const rect = overlayElement.getBoundingClientRect();
    const maxX = Math.max(0, rect.width / scale - 10);
    const maxY = Math.max(0, rect.height / scale - 10);

    const x = clamp((event.clientX - rect.left) / scale - dragOffsetX, 0, maxX);
    const y = clamp((event.clientY - rect.top) / scale - dragOffsetY, 0, maxY);

    legendActions.setDragPosition({ x, y });
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

    const scale = globalState.zoom.pageZoomLevel / 100;
    const overlayRect = overlayElement.getBoundingClientRect();
    const legendRect = legendElement.getBoundingClientRect();

    const currentX = (legendRect.left - overlayRect.left) / scale;
    const currentY = (legendRect.top - overlayRect.top) / scale;

    if (!legendState.dragPosition) {
      legendActions.setDragPosition({ x: currentX, y: currentY });
    }

    dragOffsetX =
      (event.clientX - overlayRect.left) / scale -
      (legendState.dragPosition?.x ?? currentX);
    dragOffsetY =
      (event.clientY - overlayRect.top) / scale -
      (legendState.dragPosition?.y ?? currentY);

    isDragging = true;
    window.addEventListener(EVENT.POINTERMOVE, handlePointerMove);
    window.addEventListener(EVENT.POINTERUP, handlePointerUp);
  }

  function handleLegendClick(event: MouseEvent | KeyboardEvent): void {
    event.stopPropagation();
    legendActions.markAsOpened();
    activateStylingToolFromMap(StylingTools.Legend);
  }

  function handleLegendKeyDown(event: KeyboardEvent): void {
    if (event.key !== KEY.ENTER && event.key !== KEY.SPACE) {
      return;
    }

    event.preventDefault();
    handleLegendClick(event);
  }

  $effect(() => {
    void visibleItems.length;
    void legendState.position;
    void legendState.dragPosition;
    void legendState.style.fontFamily;
    void legendState.style.fontSize;
    void legendState.style.background.enabled;
    void legendState.style.background.opacity;
    void globalState.zoom.pageZoomLevel;

    if (legendState.dragPosition || !overlayElement || !legendElement) {
      autoPosition = null;
      return;
    }

    const pageContainer = overlayElement.closest('.page-container');
    if (!(pageContainer instanceof HTMLElement)) {
      autoPosition = legendState.position;
      return;
    }

    const pageRect = pageContainer.getBoundingClientRect();
    const overlayRect = overlayElement.getBoundingClientRect();
    const legendRect = legendElement.getBoundingClientRect();
    const overlayOffsetX = overlayRect.left - pageRect.left;
    const overlayOffsetY = overlayRect.top - pageRect.top;
    const pageElementRects = Array.from(
      pageContainer.querySelectorAll<HTMLElement>('[data-annotation-role]')
    ).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left - pageRect.left,
        top: rect.top - pageRect.top,
        right: rect.right - pageRect.left,
        bottom: rect.bottom - pageRect.top
      };
    });

    if (pageElementRects.length === 0) {
      autoPosition = legendState.position;
      return;
    }

    const resolvedPosition =
      getCandidatePositions(legendState.position).find((position) => {
        const candidateRect = getLegendCandidateRect(
          position,
          overlayOffsetX,
          overlayOffsetY,
          overlayRect.width,
          overlayRect.height,
          legendRect.width,
          legendRect.height
        );

        return !pageElementRects.some((rect) =>
          rectsOverlap(candidateRect, rect)
        );
      }) ?? legendState.position;

    autoPosition = resolvedPosition;
  });

  onDestroy(() => {
    stopDragging();
  });
</script>

{#if legendState.visible && visibleItems.length > 0 && !isInDataStep}
  <div class="legend-overlay" bind:this={overlayElement}>
    <div
      bind:this={legendElement}
      class="legend-container {positionClass}"
      class:draggable={isLegendActive}
      class:dragging={isDragging}
      style={containerStyle}
      role="button"
      tabindex="0"
      aria-label={m.tool_legend()}
      onclick={handleLegendClick}
      onkeydown={handleLegendKeyDown}
      onpointerdown={handleLegendPointerDown}
    >
      {#each visibleItems as item (item.id)}
        {@const viz = vizByItemId.get(item.id)}
        {@const proportionalScale = getProportionalLegendScale(viz)}
        <div class="legend-item">
          {#if item.title}
            <h4 class="legend-title">{item.title}</h4>
          {/if}
          {#if item.subtitle}
            <p class="legend-subtitle">{item.subtitle}</p>
          {/if}
          {#if hasColorScale(viz)}
            {@const colors = viz!.classification!.colors!}
            {@const breaks = viz!.classification!.breaks!}
            {@const hasPatternScale = Boolean(viz!.classification?.patternId)}
            <div class="legend-color-scale">
              {#each colors as color, i (i)}
                <div class="legend-scale-row">
                  <span
                    class="legend-color-swatch"
                    class:patterned={hasPatternScale}
                    style={getPatternSwatchStyle(
                      viz!.classification?.patternId,
                      color,
                      viz!.classification?.patternParams
                    )}
                  >
                  </span>
                  <span class="legend-scale-label">
                    {getColorScaleLabel(breaks, colors.length, i)}
                  </span>
                </div>
              {/each}
              {#if viz?.missingData?.show}
                <div class="legend-scale-row">
                  <span
                    class="legend-color-swatch"
                    style="background-color: {viz.missingData.color};"
                  ></span>
                  <span class="legend-scale-label">{m.missing_data_text()}</span
                  >
                </div>
              {/if}
            </div>
          {/if}
          {#if hasCategoricalScale(viz)}
            {@const colors = viz!.classification!.colors!}
            {@const catLabels = getCategoryLabels(viz)}
            {@const displayCount =
              catLabels.length > 0 ? catLabels.length : colors.length}
            <div class="legend-color-scale">
              {#each colors.slice(0, displayCount) as color, i (i)}
                <div class="legend-scale-row">
                  <span
                    class="legend-color-swatch"
                    style="background-color: {color};"
                  ></span>
                  <span class="legend-scale-label">{catLabels[i] ?? ''}</span>
                </div>
              {/each}
              {#if viz?.missingData?.show}
                <div class="legend-scale-row">
                  <span
                    class="legend-color-swatch"
                    style="background-color: {viz.missingData.color};"
                  ></span>
                  <span class="legend-scale-label">{m.missing_data_text()}</span
                  >
                </div>
              {/if}
            </div>
          {/if}
          {#if proportionalScale}
            <div class="legend-proportional-scale">
              <div class="legend-proportional-scale-row">
                <span
                  class="legend-proportional-symbol"
                  style={getProportionalSymbolStyle(
                    proportionalScale,
                    proportionalScale.maxSize
                  )}
                ></span>
                <span class="legend-scale-label">
                  {formatBreakValue(proportionalScale.maxValue)}
                </span>
              </div>
              {#if proportionalScale.midValue !== undefined && proportionalScale.midSize !== undefined}
                <div class="legend-proportional-scale-row">
                  <span
                    class="legend-proportional-symbol"
                    style={getProportionalSymbolStyle(
                      proportionalScale,
                      proportionalScale.midSize
                    )}
                  ></span>
                  <span class="legend-scale-label">
                    {formatBreakValue(proportionalScale.midValue)}
                  </span>
                </div>
              {/if}
              {#if proportionalScale.minValue !== proportionalScale.maxValue}
                <div class="legend-proportional-scale-row">
                  <span
                    class="legend-proportional-symbol"
                    style={getProportionalSymbolStyle(
                      proportionalScale,
                      proportionalScale.minSize
                    )}
                  ></span>
                  <span class="legend-scale-label">
                    {formatBreakValue(proportionalScale.minValue)}
                  </span>
                </div>
              {/if}
            </div>
          {/if}
          {#if item.note}
            <p class="legend-note">{item.note}</p>
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

  .legend-container {
    position: absolute;
    background: rgba(255, 255, 255, 0.95);
    padding: 12px 16px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    max-width: 280px;
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
    background-color: #f4f4f4 !important;
  }

  .legend-container.top-left {
    top: 16px;
    left: 16px;
  }

  .legend-container.top-right {
    top: 16px;
    right: 16px;
  }

  .legend-container.bottom-left {
    bottom: 16px;
    left: 16px;
  }

  .legend-container.bottom-right {
    bottom: 16px;
    right: 16px;
  }

  .legend-container.bottom-center {
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
  }

  .legend-item {
    margin-bottom: 12px;
  }

  .legend-item:last-child {
    margin-bottom: 0;
  }

  .legend-title {
    margin: 0 0 4px 0;
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

  .legend-color-scale {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 6px 0;
  }

  .legend-scale-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-color-swatch {
    position: relative;
    display: inline-block;
    width: 16px;
    height: 16px;
    min-width: 16px;
    border: 1px solid rgba(0, 0, 0, 0.15);
  }

  .legend-color-swatch.patterned {
    width: 20px;
    min-width: 20px;
  }

  .legend-scale-label {
    font-size: 0.8em;
    line-height: 1.2;
    white-space: nowrap;
  }

  .legend-proportional-scale {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0.5rem 0;
  }

  .legend-proportional-scale-row {
    display: flex;
    align-items: flex-end;
    gap: 0.625rem;
    min-height: 1.5rem;
  }

  .legend-proportional-symbol {
    display: inline-block;
    flex-shrink: 0;
  }
</style>
