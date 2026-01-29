<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    AnnotationKind,
    DrawingType
  } from '$lib/features/commons/constants/ui.constants';
  import { TextAlign } from '$lib/features/commons/types/enums';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { getAnnotationsState } from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
  import type { Annotation } from '$lib/features/step-toolbar/tools/annotations/annotations.types';

  const annotationsState = $derived(getAnnotationsState());
  const visibleItems = $derived(
    annotationsState.items.filter((i) => i.visible !== false)
  );

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
    if (style.opacity !== undefined) {
      styles.push(`opacity: ${style.opacity / 100}`);
    }

    const color = getColorValue(style.color, '#000000');
    styles.push(`color: ${color}`);

    return styles.join('; ');
  }

  function getShapeStyle(item: Annotation): {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeDasharray?: string;
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
            : undefined
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
  <div class="annotation-overlay">
    {#each visibleItems as item (item.id)}
      <div
        class="annotation-item"
        style="left: {item.position.x}px; top: {item.position.y}px;"
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
          <svg width="50" height="50" class="annotation-shape">
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
            <svg class="annotation-drawing" style="overflow: visible;">
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
          {@const opacity = item.style?.opacity ?? 100}
          {#if imgSrc}
            <img
              src={imgSrc}
              alt={m.annotationImageAlt()}
              class="annotation-image"
              style="width: {size}px; height: auto; opacity: {opacity / 100};"
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
    cursor: move;
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
