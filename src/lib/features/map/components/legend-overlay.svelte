<script lang="ts">
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
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import {
    getLegendState,
    legendActions
  } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
  import type { LegendItem } from '$lib/features/step-toolbar/tools/legend/legend.types';
  import { FillMode } from '$lib/features/main-toolbar/constants';
  import * as m from '$lib/paraglide/messages';
  import { onDestroy } from 'svelte';
  import { activateStylingToolFromMap } from '../utils/styling-tool-activation.utils';

  function getVisualizationForItem(
    item: LegendItem
  ): VisualizationConfig | undefined {
    if (!item.variableId) return undefined;
    return visualizationStore.visualizations.find(
      (v) => v.id === item.variableId
    );
  }

  function hasColorScale(viz: VisualizationConfig | undefined): boolean {
    if (!viz?.classification?.colors?.length || !viz?.classification?.breaks?.length) {
      return false;
    }
    const fillMode = viz.modes?.fill;
    return fillMode === FillMode.CLASSES || fillMode === FillMode.CATEGORIES;
  }

  function formatBreakValue(value: number): string {
    if (Number.isInteger(value)) return String(value);
    if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
    return value.toFixed(1);
  }

  const legendState = $derived(getLegendState());
  const visibleItems = $derived(legendState.items.filter((i) => i.visible));

  // Build a reactive map from variableId → visualization for color scale rendering
  const vizByItemId = $derived.by(() => {
    void visualizationStore.version;
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

  const positionClass = $derived.by(() => {
    if (legendState.dragPosition) {
      return '';
    }
    switch (legendState.position) {
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

    const rect = overlayElement.getBoundingClientRect();
    const maxX = Math.max(0, rect.width - 10);
    const maxY = Math.max(0, rect.height - 10);

    const x = clamp(event.clientX - rect.left - dragOffsetX, 0, maxX);
    const y = clamp(event.clientY - rect.top - dragOffsetY, 0, maxY);

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

    const overlayRect = overlayElement.getBoundingClientRect();
    const legendRect = legendElement.getBoundingClientRect();

    const currentX = legendRect.left - overlayRect.left;
    const currentY = legendRect.top - overlayRect.top;

    if (!legendState.dragPosition) {
      legendActions.setDragPosition({ x: currentX, y: currentY });
    }

    dragOffsetX =
      event.clientX -
      overlayRect.left -
      (legendState.dragPosition?.x ?? currentX);
    dragOffsetY =
      event.clientY -
      overlayRect.top -
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
            <div class="legend-color-scale">
              {#each colors as color, i}
                <div class="legend-scale-row">
                  <span
                    class="legend-color-swatch"
                    style="background-color: {color};"
                  ></span>
                  <span class="legend-scale-label">
                    {#if i < breaks.length - 1}
                      {formatBreakValue(breaks[i])} – {formatBreakValue(breaks[i + 1])}
                    {:else if breaks.length > 0}
                      ≥ {formatBreakValue(breaks[breaks.length - 1])}
                    {/if}
                  </span>
                </div>
              {/each}
              {#if viz?.missingData?.show}
                <div class="legend-scale-row">
                  <span
                    class="legend-color-swatch"
                    style="background-color: {viz.missingData.color};"
                  ></span>
                  <span class="legend-scale-label">{m.missing_data_text()}</span>
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
    display: inline-block;
    width: 16px;
    height: 16px;
    min-width: 16px;
    border: 1px solid rgba(0, 0, 0, 0.15);
  }

  .legend-scale-label {
    font-size: 0.8em;
    line-height: 1.2;
    white-space: nowrap;
  }
</style>
