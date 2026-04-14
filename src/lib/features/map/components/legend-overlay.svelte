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
    visualizationStore,
    type VisualizationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { hexToRgb, hslToHex } from '$lib/features/commons/utils/color-utils';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import {
    getLegendState,
    legendActions
  } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
  import { ShapeType } from '$lib/features/main-toolbar/constants';
  import * as m from '$lib/paraglide/messages';
  import { SvelteMap } from 'svelte/reactivity';
  import { onDestroy } from 'svelte';
  import { activateStylingToolFromMap } from '../utils/styling-tool-activation.utils';
  import {
    getLineWidthLegendScale,
    getPointSizeLegendScale,
    getDensityLegendScale,
    hasCategoricalColorLegend,
    hasClassedColorLegend,
    resolveLegendColorSwatchPrimitive,
    resolveMissingDataLegendPrimitive,
    resolveMissingDataPointShape,
    type LineWidthLegendScale,
    type PointSizeLegendScale
  } from '../utils/legend.utils';

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

  function getCategoryLabels(viz: VisualizationConfig | undefined): string[] {
    return viz?.classification?.labels ?? [];
  }

  function normalizeLegendValue(
    value: number,
    minValue: number,
    maxValue: number,
    minDisplay: number,
    maxDisplay: number
  ): number {
    if (maxValue <= minValue) {
      return (minDisplay + maxDisplay) / 2;
    }

    return (
      minDisplay +
      ((value - minValue) / (maxValue - minValue)) * (maxDisplay - minDisplay)
    );
  }

  function getPointLegendDisplaySize(
    scale: PointSizeLegendScale,
    size: number
  ): number {
    const sizes = scale.steps.map((step) => step.size);
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);

    return normalizeLegendValue(size, minSize, maxSize, 5, 22);
  }

  function getLineLegendDisplayWidth(
    scale: LineWidthLegendScale,
    width: number
  ): number {
    const widths = scale.steps.map((step) => step.size);
    const minWidth = Math.min(...widths);
    const maxWidth = Math.max(...widths);

    return normalizeLegendValue(width, minWidth, maxWidth, 2, 10);
  }

  function getPointSymbolStyle(shape: ShapeType, size: number): string {
    const diameter = Math.max(10, Math.round(size * 2));
    const styles = [
      `width: ${diameter}px`,
      `height: ${diameter}px`,
      'display: inline-block',
      'box-sizing: border-box'
    ];

    return styles.join('; ');
  }

  function getShapeClipStyles(shape: ShapeType, strokeColor: string): string {
    const border = `border: 1px solid ${strokeColor}`;
    switch (shape) {
      case ShapeType.CIRCLE:
        return `border-radius: 999px; ${border}`;
      case ShapeType.SQUARE:
        return `border-radius: 2px; ${border}`;
      case ShapeType.BAR:
        return 'clip-path: polygon(42% 0, 58% 0, 58% 100%, 42% 100%)';
      case ShapeType.SPIKE:
        return 'clip-path: polygon(50% 0, 65% 100%, 35% 100%)';
      case ShapeType.CROSS:
        return 'clip-path: polygon(35% 0, 65% 0, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0 65%, 0 35%, 35% 35%)';
      case ShapeType.DIAMOND:
        return 'clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%)';
      case ShapeType.TRIANGLE:
        return 'clip-path: polygon(50% 0, 0 100%, 100% 100%)';
      case ShapeType.STAR:
        return 'clip-path: polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
      case ShapeType.RECTANGLE:
        return `border-radius: 2px; clip-path: inset(35% 5% 35% 5% round 2px); ${border}`;
      default:
        return `border-radius: 2px; ${border}`;
    }
  }

  function getPointLegendSymbolStyle(
    scale: PointSizeLegendScale,
    size: number
  ): string {
    const styles = [
      getPointSymbolStyle(scale.shape, getPointLegendDisplaySize(scale, size)),
      `background-color: ${scale.fillColor}`,
      `opacity: ${scale.fillOpacity}`,
      'box-sizing: border-box'
    ];

    styles.push(getShapeClipStyles(scale.shape, scale.strokeColor));
    return styles.join('; ');
  }

  function getPointColorSwatchStyle(
    shape: ShapeType,
    color: string,
    size = 8
  ): string {
    const styles = [
      getPointSymbolStyle(shape, size),
      `background-color: ${color}`,
      'opacity: 1'
    ];

    styles.push(getShapeClipStyles(shape, 'rgba(0, 0, 0, 0.15)'));
    return styles.join('; ');
  }

  function getLineSwatchStyle(
    color: string,
    width: number,
    opacity: number,
    dashed = false
  ): string {
    const resolvedWidth = Math.max(2, Math.round(width));
    const styles = [
      `width: 28px`,
      `height: ${resolvedWidth}px`,
      `background-color: ${color}`,
      `opacity: ${opacity}`,
      'display: inline-block',
      'border-radius: 999px',
      'box-sizing: border-box'
    ];

    if (dashed) {
      styles.push(
        'background-image: repeating-linear-gradient(90deg, transparent 0 4px, rgba(255, 255, 255, 0.95) 4px 7px)'
      );
    }

    return styles.join('; ');
  }

  function getMissingDataAreaSwatchStyle(
    viz: VisualizationConfig,
    color: string
  ): string {
    if (viz.missingData?.pattern) {
      return getPatternSwatchStyle('cross', color, undefined);
    }

    return `background-color: ${color};`;
  }

  function getColumnStatistics(
    viz: VisualizationConfig | undefined,
    columnName: string | undefined
  ) {
    if (!viz?.datasetId || !columnName) {
      return null;
    }

    return datasetsStore.getColumnStatistics(viz.datasetId, columnName);
  }

  function getLegendStepLabel(
    step:
      | NonNullable<PointSizeLegendScale['steps']>[number]
      | NonNullable<LineWidthLegendScale['steps']>[number],
    breaks: number[] | undefined,
    colorCount = 0
  ): string {
    if (step.kind === 'continuous') {
      return formatBreakValue(step.value);
    }

    return breaks ? getColorScaleLabel(breaks, colorCount, step.index) : '';
  }

  function getLegendClassCount(viz: VisualizationConfig | undefined): number {
    if (!viz?.classification) {
      return 0;
    }

    return (
      viz.classification.numClasses ??
      viz.classification.labels?.length ??
      viz.classification.colors?.length ??
      (viz.classification.breaks?.length
        ? viz.classification.breaks.length + 1
        : 0)
    );
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

  const positionClass = $derived.by(() => {
    if (legendState.dragPosition) {
      return '';
    }
    return getPositionClass(legendState.position);
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
      data-workspace-pan-ignore="true"
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
        {@const colorLegendPrimitive = resolveLegendColorSwatchPrimitive(viz)}
        {@const sizeStats = getColumnStatistics(viz, viz?.mapping.sizeColumn)}
        {@const pointSizeScale = getPointSizeLegendScale(viz, sizeStats)}
        {@const densityScale = getDensityLegendScale(viz)}
        {@const lineWidthScale = getLineWidthLegendScale(viz, sizeStats)}
        {@const classCount = getLegendClassCount(viz)}
        <div class="legend-item">
          {#if item.title}
            <h4 class="legend-title">{item.title}</h4>
          {/if}
          {#if item.subtitle}
            <p class="legend-subtitle">{item.subtitle}</p>
          {/if}
          {#if densityScale}
            <div class="legend-density-row">
              <span
                class="legend-density-dot"
                style={`background-color: ${densityScale.fillColor}; width: ${Math.max(4, Math.round(densityScale.dotSize * 4))}px; height: ${Math.max(4, Math.round(densityScale.dotSize * 4))}px;`}
              ></span>
              <span class="legend-scale-label">
                {m.density_ratio_label({ ratio: String(densityScale.ratio) })}
              </span>
            </div>
          {/if}
          {#if viz && hasClassedColorLegend(viz)}
            {@const colors = viz.classification?.colors ?? []}
            {@const breaks = viz.classification?.breaks ?? []}
            {@const hasPatternScale =
              colorLegendPrimitive === 'area' &&
              Boolean(viz.classification?.patternId)}
            <div class="legend-color-scale">
              {#each colors as color, i (i)}
                <div class="legend-scale-row">
                  {#if colorLegendPrimitive === 'point'}
                    <span
                      class="legend-point-swatch"
                      style={getPointColorSwatchStyle(
                        viz.symbols?.type ?? ShapeType.CIRCLE,
                        color
                      )}
                    ></span>
                  {:else if colorLegendPrimitive === 'line'}
                    <span
                      class="legend-line-swatch"
                      style={getLineSwatchStyle(
                        color,
                        Math.max(3, Math.min(6, viz.style.lineWidth ?? 4)),
                        viz.style.lineOpacity ?? 1,
                        viz.style.lineDashed ?? false
                      )}
                    ></span>
                  {:else}
                    <span
                      class="legend-color-swatch"
                      class:patterned={hasPatternScale}
                      style={getPatternSwatchStyle(
                        viz.classification?.patternId,
                        color,
                        viz.classification?.patternParams
                      )}
                    >
                    </span>
                  {/if}
                  <span class="legend-scale-label">
                    {getColorScaleLabel(breaks, colors.length, i)}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
          {#if viz && hasCategoricalColorLegend(viz)}
            {@const colors = viz.classification?.colors ?? []}
            {@const catLabels = getCategoryLabels(viz)}
            {@const displayCount =
              catLabels.length > 0 ? catLabels.length : colors.length}
            <div class="legend-color-scale">
              {#each colors.slice(0, displayCount) as color, i (i)}
                <div class="legend-scale-row">
                  {#if colorLegendPrimitive === 'point'}
                    <span
                      class="legend-point-swatch"
                      style={getPointColorSwatchStyle(
                        viz.symbols?.type ?? ShapeType.CIRCLE,
                        color
                      )}
                    ></span>
                  {:else if colorLegendPrimitive === 'line'}
                    <span
                      class="legend-line-swatch"
                      style={getLineSwatchStyle(
                        color,
                        Math.max(3, Math.min(6, viz.style.lineWidth ?? 4)),
                        viz.style.lineOpacity ?? 1,
                        viz.style.lineDashed ?? false
                      )}
                    ></span>
                  {:else}
                    <span
                      class="legend-color-swatch"
                      style="background-color: {color};"
                    ></span>
                  {/if}
                  <span class="legend-scale-label">{catLabels[i] ?? ''}</span>
                </div>
              {/each}
            </div>
          {/if}
          {#if pointSizeScale}
            <div class="legend-proportional-scale">
              {#each pointSizeScale.steps as step, index (index)}
                <div class="legend-proportional-scale-row">
                  <span
                    class="legend-proportional-symbol"
                    style={getPointLegendSymbolStyle(pointSizeScale, step.size)}
                  ></span>
                  <span class="legend-scale-label">
                    {getLegendStepLabel(
                      step,
                      viz?.classification?.breaks,
                      classCount
                    )}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
          {#if lineWidthScale}
            <div class="legend-proportional-scale">
              {#each lineWidthScale.steps as step, index (index)}
                <div class="legend-proportional-scale-row">
                  <span
                    class="legend-line-swatch"
                    style={getLineSwatchStyle(
                      lineWidthScale.color,
                      getLineLegendDisplayWidth(lineWidthScale, step.size),
                      lineWidthScale.opacity,
                      lineWidthScale.dashed
                    )}
                  ></span>
                  <span class="legend-scale-label">
                    {getLegendStepLabel(
                      step,
                      viz?.classification?.breaks,
                      classCount
                    )}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
          {#if viz?.missingData?.show}
            {@const missingDataPrimitive =
              resolveMissingDataLegendPrimitive(viz)}
            {@const missingDataShape = resolveMissingDataPointShape(
              viz?.missingData?.shape
            )}
            <div class="legend-color-scale">
              <div class="legend-scale-row">
                {#if missingDataPrimitive === 'point'}
                  <span
                    class="legend-point-swatch"
                    style={getPointColorSwatchStyle(
                      missingDataShape,
                      viz.missingData.color,
                      Math.max(6, Math.min(10, viz.missingData.size ?? 6))
                    )}
                  ></span>
                {:else}
                  <span
                    class="legend-color-swatch"
                    class:patterned={Boolean(viz.missingData.pattern)}
                    style={getMissingDataAreaSwatchStyle(
                      viz,
                      viz.missingData.color
                    )}
                  ></span>
                {/if}
                <span class="legend-scale-label">{m.missing_data_text()}</span>
              </div>
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
    padding: 8px 12px;
    border-radius: 3px;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.14);
    max-width: 220px;
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
    top: 12px;
    left: 12px;
  }

  .legend-container.top-right {
    top: 12px;
    right: 12px;
  }

  .legend-container.bottom-left {
    bottom: 12px;
    left: 12px;
  }

  .legend-container.bottom-right {
    bottom: 12px;
    right: 12px;
  }

  .legend-container.bottom-center {
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
  }

  .legend-item {
    margin-bottom: 8px;
  }

  .legend-item:last-child {
    margin-bottom: 0;
  }

  .legend-title {
    margin: 0 0 3px 0;
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
    gap: 1px;
    margin: 4px 0;
  }

  .legend-scale-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .legend-color-swatch {
    position: relative;
    display: inline-block;
    width: 1.1em;
    height: 1.1em;
    min-width: 1.1em;
    border: 1px solid rgba(0, 0, 0, 0.15);
  }

  .legend-color-swatch.patterned {
    width: 1.4em;
    min-width: 1.4em;
  }

  .legend-point-swatch,
  .legend-line-swatch {
    display: inline-block;
    flex-shrink: 0;
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
