<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { StylingTools } from '$lib/features/commons/types/global';
  import {
    AnnotationKind,
    DrawingType
  } from '$lib/features/commons/constants/ui.constants';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { onDestroy } from 'svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
  import { activateStylingToolFromMap } from '../utils/styling-tool-activation.utils';
  import type { Annotation } from '$lib/features/step-toolbar/tools/annotations/annotations.types';

  let overlayElement = $state<HTMLDivElement | null>(null);
  let dragState = $state<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const annotationsState = $derived(getAnnotationsState());
  const isAnnotationEditing = $derived(
    globalState.selectedTool === StylingTools.Annotations
  );
  const visibleItems = $derived(
    annotationsState.visible
      ? annotationsState.items.filter((item) => {
          if (item.visible === false) {
            return false;
          }

          if (
            item.role &&
            typeof item.content === 'string' &&
            item.content.trim().length === 0
          ) {
            return false;
          }

          return true;
        })
      : []
  );
  const selectedId = $derived(annotationsState.selectedId);

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function stopDragging(): void {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    dragState = null;
  }

  function handlePointerUp(): void {
    stopDragging();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!dragState || !overlayElement) {
      return;
    }

    const rect = overlayElement.getBoundingClientRect();
    const maxX = Math.max(0, rect.width - 10);
    const maxY = Math.max(0, rect.height - 10);

    let x = event.clientX - rect.left - dragState.offsetX;
    let y = event.clientY - rect.top - dragState.offsetY;

    x = clamp(x, 0, maxX);
    y = clamp(y, 0, maxY);

    annotationsActions.moveAnnotation(dragState.id, { x, y });
  }

  function handleAnnotationPointerDown(
    event: PointerEvent,
    item: Annotation
  ): void {
    if (!isAnnotationEditing) {
      return;
    }

    if (!overlayElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    annotationsActions.selectAnnotation(item.id);

    const rect = overlayElement.getBoundingClientRect();
    dragState = {
      id: item.id,
      offsetX: event.clientX - rect.left - item.position.x,
      offsetY: event.clientY - rect.top - item.position.y
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function handleAnnotationClick(event: MouseEvent, itemId: string): void {
    event.stopPropagation();

    if (!isAnnotationEditing) {
      activateStylingToolFromMap(StylingTools.Annotations);
      annotationsActions.setPageElementsVisibility(true);
    }

    annotationsActions.selectAnnotation(itemId);
  }

  function handleAnnotationKeyDown(event: KeyboardEvent, itemId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isAnnotationEditing) {
        activateStylingToolFromMap(StylingTools.Annotations);
        annotationsActions.setPageElementsVisibility(true);
      }
      annotationsActions.selectAnnotation(itemId);
    }
  }

  onDestroy(() => {
    stopDragging();
  });

  function getColorValue(
    color:
      | string
      | { hue: number; saturation: number; lightness: number }
      | undefined,
    fallback: string
  ): string {
    if (!color) return fallback;
    if (typeof color === 'string') return color;
    return hslToHex(color.hue, color.saturation, color.lightness);
  }

  function toOpacityUnit(opacity: number | undefined): number {
    if (opacity === undefined) {
      return 1;
    }

    const rawValue = Number(opacity);
    if (!Number.isFinite(rawValue)) {
      return 1;
    }

    const percentValue = rawValue <= 1 ? rawValue * 100 : rawValue;
    const clampedPercent = Math.max(0, Math.min(100, percentValue));
    return clampedPercent / 100;
  }

  function getTextStyle(item: Annotation): string {
    const style = item.style ?? {};
    const styles: string[] = [];

    if (style.font) {
      styles.push(`font-family: ${style.font}, sans-serif`);
    }
    if (style.fontSize) {
      styles.push(`font-size: ${style.fontSize}px`);
    }
    if (style.bold) {
      styles.push('font-weight: bold');
    }
    if (style.italic) {
      styles.push('font-style: italic');
    }
    if (style.underlined) {
      styles.push('text-decoration: underline');
    }
    if (style.textAlign) {
      styles.push(`text-align: ${style.textAlign}`);
    }
    styles.push(`opacity: ${toOpacityUnit(style.opacity)}`);

    const color = getColorValue(style.color, '#000000');
    styles.push(`color: ${color}`);

    return styles.join('; ');
  }

  function getShapeStyle(item: Annotation): {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeDasharray?: string;
    opacity: number;
  } {
    const style = item.style ?? {};
    return {
      fill: getColorValue(style.fillColor, 'none'),
      stroke: getColorValue(style.strokeColor, '#000000'),
      strokeWidth: style.strokeWidth ?? 2,
      strokeDasharray:
        style.strokeStyle === 'dashed'
          ? '5,5'
          : style.strokeStyle === 'dotted'
            ? '2,2'
            : undefined,
      opacity: toOpacityUnit(style.opacity)
    };
  }

  function renderShape(
    item: Annotation,
    shapeType: string
  ): { type: string; path?: string; cx?: number; cy?: number; r?: number } {
    const baseSize = 40;

    switch (shapeType) {
      case 'arrow':
        return {
          type: 'path',
          path: `M 0,${baseSize / 2} L ${baseSize * 0.7},${baseSize / 2} L ${baseSize * 0.7},${baseSize * 0.2} L ${baseSize},${baseSize / 2} L ${baseSize * 0.7},${baseSize * 0.8} L ${baseSize * 0.7},${baseSize / 2} Z`
        };
      case 'line':
        return {
          type: 'path',
          path: `M 0,${baseSize / 2} L ${baseSize},${baseSize / 2}`
        };
      case 'rectangle':
        return {
          type: 'rect',
          path: `M 0,0 L ${baseSize},0 L ${baseSize},${baseSize} L 0,${baseSize} Z`
        };
      case 'circle':
        return {
          type: 'circle',
          cx: baseSize / 2,
          cy: baseSize / 2,
          r: baseSize / 2
        };
      case 'triangle':
        return {
          type: 'path',
          path: `M ${baseSize / 2},0 L ${baseSize},${baseSize} L 0,${baseSize} Z`
        };
      case 'star':
        return {
          type: 'path',
          path: createStarPath(
            baseSize / 2,
            baseSize / 2,
            5,
            baseSize / 2,
            baseSize / 4
          )
        };
      default:
        return {
          type: 'circle',
          cx: baseSize / 2,
          cy: baseSize / 2,
          r: baseSize / 2
        };
    }
  }

  function createStarPath(
    cx: number,
    cy: number,
    spikes: number,
    outerRadius: number,
    innerRadius: number
  ): string {
    let path = '';
    const step = Math.PI / spikes;

    for (let i = 0; i < 2 * spikes; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = i * step - Math.PI / 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      path += i === 0 ? `M ${x},${y}` : ` L ${x},${y}`;
    }
    return path + ' Z';
  }
</script>

{#if visibleItems.length > 0}
  <div class="annotation-overlay" bind:this={overlayElement}>
    {#each visibleItems as item (item.id)}
      <div
        class="annotation-item"
        class:editable={isAnnotationEditing}
        class:selected={isAnnotationEditing && selectedId === item.id}
        class:dragging={dragState?.id === item.id}
        style="left: {item.position.x}px; top: {item.position.y}px;"
        role="button"
        tabindex="0"
        aria-disabled="false"
        aria-label={m.annotationImageAlt()}
        onclick={(event: MouseEvent) => handleAnnotationClick(event, item.id)}
        onpointerdown={(event: PointerEvent) =>
          handleAnnotationPointerDown(event, item)}
        onkeydown={(event: KeyboardEvent) =>
          handleAnnotationKeyDown(event, item.id)}
      >
        {#if item.type === AnnotationKind.TEXT}
          <div class="annotation-text" style={getTextStyle(item)}>
            {item.content || ''}
          </div>
        {:else if item.type === AnnotationKind.SHAPE}
          {@const shapeData = renderShape(
            item,
            String(item.content ?? 'circle')
          )}
          {@const shapeStyle = getShapeStyle(item)}
          <svg
            width="50"
            height="50"
            class="annotation-shape"
            style="opacity: {shapeStyle.opacity};"
          >
            {#if shapeData.type === 'circle'}
              <circle
                cx={shapeData.cx}
                cy={shapeData.cy}
                r={shapeData.r}
                fill={shapeStyle.fill}
                stroke={shapeStyle.stroke}
                stroke-width={shapeStyle.strokeWidth}
                stroke-dasharray={shapeStyle.strokeDasharray}
              />
            {:else if shapeData.type === 'rect'}
              <path
                d={shapeData.path}
                fill={shapeStyle.fill}
                stroke={shapeStyle.stroke}
                stroke-width={shapeStyle.strokeWidth}
                stroke-dasharray={shapeStyle.strokeDasharray}
              />
            {:else}
              <path
                d={shapeData.path}
                fill={shapeStyle.fill}
                stroke={shapeStyle.stroke}
                stroke-width={shapeStyle.strokeWidth}
                stroke-dasharray={shapeStyle.strokeDasharray}
              />
            {/if}
          </svg>
        {:else if item.type === AnnotationKind.DRAWING}
          {@const drawingStyle = getShapeStyle(item)}
          {@const points = Array.isArray(item.content) ? item.content : []}
          {#if points.length > 0}
            <svg
              class="annotation-drawing"
              style="overflow: visible; opacity: {drawingStyle.opacity};"
            >
              <path
                d={points
                  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                  .join(' ')}
                fill={item.style?.drawingType === DrawingType.ZONE
                  ? drawingStyle.fill
                  : 'none'}
                stroke={drawingStyle.stroke}
                stroke-width={drawingStyle.strokeWidth}
                stroke-dasharray={drawingStyle.strokeDasharray}
                stroke-linejoin="round"
                stroke-linecap="round"
              />
            </svg>
          {/if}
        {:else if item.type === AnnotationKind.IMAGE}
          {@const imgSrc = String(item.content ?? '')}
          {@const size = item.style?.size ?? 100}
          {@const opacity = toOpacityUnit(item.style?.opacity)}
          {#if imgSrc}
            <img
              src={imgSrc}
              alt={m.annotationImageAlt()}
              class="annotation-image"
              style="width: {size}px; height: auto; opacity: {opacity};"
            />
          {/if}
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .annotation-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 15;
  }

  .annotation-item {
    position: absolute;
    pointer-events: auto;
    cursor: pointer;
    touch-action: none;
    outline: none;
  }

  .annotation-item.editable {
    pointer-events: auto;
    cursor: move;
  }

  .annotation-item.selected {
    box-shadow: 0 0 0 2px var(--cds-interactive-01);
    border-radius: 4px;
  }

  .annotation-item.dragging {
    cursor: grabbing;
  }

  .annotation-text {
    background: rgba(255, 255, 255, 0.9);
    padding: 8px 12px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    max-width: 300px;
    word-wrap: break-word;
    white-space: pre-wrap;
  }

  .annotation-shape,
  .annotation-drawing {
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15));
  }

  .annotation-image {
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    object-fit: contain;
  }
</style>
