<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { SHAPE_TYPE } from '$lib/features/commons/constants';
  import {
    globalState,
    globalActions
  } from '$lib/features/commons/store/global.svelte';
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
  import {
    computeDrawingBounds,
    smoothDrawingPath
  } from '../utils/annotation-drawing.utils';
  import type { Annotation } from '$lib/features/step-toolbar/tools/annotations/annotations.types';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';

  let { interactive = true }: { interactive?: boolean } = $props();

  const DEFAULT_SHAPE_SIZE = 80;

  // Per-shape default sizes: arrows and lines are wide not square
  const SHAPE_DEFAULT_SIZES: Partial<
    Record<string, { width: number; height: number }>
  > = {
    [SHAPE_TYPE.ARROW]: { width: 120, height: 60 },
    [SHAPE_TYPE.LINE]: { width: 120, height: 30 }
  };

  // Per-shape tight viewBoxes so the shape fills its container
  const SHAPE_VIEW_BOXES: Partial<Record<string, string>> = {
    [SHAPE_TYPE.ARROW]: '-5 1 50 38', // tight around arrow bounding box + stroke overflow
    [SHAPE_TYPE.LINE]: '-5 15 50 14' // tight around horizontal line at y=20
  };
  const DEFAULT_VIEW_BOX = '-5 -5 50 50';

  function getShapeDefaultSize(shapeType: string): {
    width: number;
    height: number;
  } {
    return (
      SHAPE_DEFAULT_SIZES[shapeType] ?? {
        width: DEFAULT_SHAPE_SIZE,
        height: DEFAULT_SHAPE_SIZE
      }
    );
  }

  function getShapeViewBox(shapeType: string): string {
    return SHAPE_VIEW_BOXES[shapeType] ?? DEFAULT_VIEW_BOX;
  }

  let overlayElement = $state<HTMLDivElement | null>(null);
  let dragState = $state<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  let resizeState = $state<{
    id: string;
    handle: string;
    startAnnotationX: number;
    startAnnotationY: number;
    startW: number;
    startH: number;
    startPointerX: number;
    startPointerY: number;
  } | null>(null);
  let rotateState = $state<{
    id: string;
    centerScreenX: number;
    centerScreenY: number;
    startRotation: number;
    startAngle: number;
  } | null>(null);
  let hoverPoint = $state<{ x: number; y: number } | null>(null);

  const annotationsState = $derived(getAnnotationsState());
  const isDrawingMode = $derived(annotationsState.isDrawingMode);
  const drawingPoints = $derived(annotationsState.drawingInProgress);
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

  function stopResizing(): void {
    window.removeEventListener(EVENT.POINTERMOVE, handleResizePointerMove);
    window.removeEventListener(EVENT.POINTERUP, handleResizePointerUp);
    resizeState = null;
  }

  function stopRotating(): void {
    window.removeEventListener(EVENT.POINTERMOVE, handleRotatePointerMove);
    window.removeEventListener(EVENT.POINTERUP, handleRotatePointerUp);
    rotateState = null;
  }

  function handlePointerUp(): void {
    stopDragging();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!dragState || !overlayElement) {
      return;
    }

    const scale = globalState.zoom.pageZoomLevel / 100;
    const rect = overlayElement.getBoundingClientRect();
    const maxX = Math.max(0, rect.width / scale - 10);
    const maxY = Math.max(0, rect.height / scale - 10);

    let x = (event.clientX - rect.left) / scale - dragState.offsetX;
    let y = (event.clientY - rect.top) / scale - dragState.offsetY;

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

    const scale = globalState.zoom.pageZoomLevel / 100;
    const rect = overlayElement.getBoundingClientRect();
    dragState = {
      id: item.id,
      offsetX: (event.clientX - rect.left) / scale - item.position.x,
      offsetY: (event.clientY - rect.top) / scale - item.position.y
    };

    window.addEventListener(EVENT.POINTERMOVE, handlePointerMove);
    window.addEventListener(EVENT.POINTERUP, handlePointerUp);
  }

  function handleAnnotationClick(event: MouseEvent, itemId: string): void {
    event.stopPropagation();

    if (!isAnnotationEditing) {
      activateStylingToolFromMap(StylingTools.Annotations);
      annotationsActions.setPageElementsVisibility(true);
    }

    annotationsActions.selectAnnotation(itemId);
  }

  function handleAnnotationDblClick(event: MouseEvent, itemId: string): void {
    event.stopPropagation();
    activateStylingToolFromMap(StylingTools.Annotations);
    annotationsActions.setPageElementsVisibility(true);
    annotationsActions.selectAnnotation(itemId);

    centerPageOnClick(event);
  }

  function centerPageOnClick(event: MouseEvent): void {
    const mainContent = overlayElement?.closest('.main-content');
    if (!mainContent) return;

    const rect = mainContent.getBoundingClientRect();
    const contentCenterX = rect.left + rect.width / 2;
    const contentCenterY = rect.top + rect.height / 2;

    globalActions.panPageBy(
      contentCenterX - event.clientX,
      contentCenterY - event.clientY
    );
  }

  function handleAnnotationKeyDown(event: KeyboardEvent, itemId: string): void {
    if (event.key === KEY.ENTER || event.key === KEY.SPACE) {
      event.preventDefault();
      if (!isAnnotationEditing) {
        activateStylingToolFromMap(StylingTools.Annotations);
        annotationsActions.setPageElementsVisibility(true);
      }
      annotationsActions.selectAnnotation(itemId);
    }
  }

  function handleResizePointerDown(
    event: PointerEvent,
    item: Annotation,
    handle: string
  ): void {
    event.preventDefault();
    event.stopPropagation();

    const shapeType = String(item.content ?? '');
    const defaultSize = getShapeDefaultSize(shapeType);
    resizeState = {
      id: item.id,
      handle,
      startAnnotationX: item.position.x,
      startAnnotationY: item.position.y,
      startW: item.style?.shapeWidth ?? defaultSize.width,
      startH: item.style?.shapeHeight ?? defaultSize.height,
      startPointerX: event.clientX,
      startPointerY: event.clientY
    };

    window.addEventListener(EVENT.POINTERMOVE, handleResizePointerMove);
    window.addEventListener(EVENT.POINTERUP, handleResizePointerUp);
  }

  function handleResizePointerUp(): void {
    stopResizing();
  }

  function handleResizePointerMove(event: PointerEvent): void {
    if (!resizeState) return;

    const scale = globalState.zoom.pageZoomLevel / 100;
    const dx = (event.clientX - resizeState.startPointerX) / scale;
    const dy = (event.clientY - resizeState.startPointerY) / scale;

    const MIN_SIZE = 20;
    let newX = resizeState.startAnnotationX;
    let newY = resizeState.startAnnotationY;
    let newW = resizeState.startW;
    let newH = resizeState.startH;

    switch (resizeState.handle) {
      case 'nw':
        newW = Math.max(MIN_SIZE, resizeState.startW - dx);
        newH = Math.max(MIN_SIZE, resizeState.startH - dy);
        newX = resizeState.startAnnotationX + (resizeState.startW - newW);
        newY = resizeState.startAnnotationY + (resizeState.startH - newH);
        break;
      case 'n':
        newH = Math.max(MIN_SIZE, resizeState.startH - dy);
        newY = resizeState.startAnnotationY + (resizeState.startH - newH);
        break;
      case 'ne':
        newW = Math.max(MIN_SIZE, resizeState.startW + dx);
        newH = Math.max(MIN_SIZE, resizeState.startH - dy);
        newY = resizeState.startAnnotationY + (resizeState.startH - newH);
        break;
      case 'e':
        newW = Math.max(MIN_SIZE, resizeState.startW + dx);
        break;
      case 'se':
        newW = Math.max(MIN_SIZE, resizeState.startW + dx);
        newH = Math.max(MIN_SIZE, resizeState.startH + dy);
        break;
      case 's':
        newH = Math.max(MIN_SIZE, resizeState.startH + dy);
        break;
      case 'sw':
        newW = Math.max(MIN_SIZE, resizeState.startW - dx);
        newH = Math.max(MIN_SIZE, resizeState.startH + dy);
        newX = resizeState.startAnnotationX + (resizeState.startW - newW);
        break;
      case 'w':
        newW = Math.max(MIN_SIZE, resizeState.startW - dx);
        newX = resizeState.startAnnotationX + (resizeState.startW - newW);
        break;
    }

    const item = annotationsState.items.find((i) => i.id === resizeState!.id);
    if (!item) return;

    annotationsActions.updateAnnotation(resizeState.id, {
      position: { x: newX, y: newY },
      style: {
        ...(item.style ?? {}),
        shapeWidth: Math.round(newW),
        shapeHeight: Math.round(newH)
      }
    });
  }

  function handleRotatePointerDown(
    event: PointerEvent,
    item: Annotation
  ): void {
    event.preventDefault();
    event.stopPropagation();

    if (!overlayElement) return;

    const scale = globalState.zoom.pageZoomLevel / 100;
    const rect = overlayElement.getBoundingClientRect();
    const shapeType = String(item.content ?? '');
    const defaultSize = getShapeDefaultSize(shapeType);
    const shapeW = item.style?.shapeWidth ?? defaultSize.width;
    const shapeH = item.style?.shapeHeight ?? defaultSize.height;

    // Center of shape in screen coords (accounting for zoom transform)
    const centerX = rect.left + (item.position.x + shapeW / 2) * scale;
    const centerY = rect.top + (item.position.y + shapeH / 2) * scale;

    const startAngle =
      Math.atan2(event.clientY - centerY, event.clientX - centerX) *
      (180 / Math.PI);

    rotateState = {
      id: item.id,
      centerScreenX: centerX,
      centerScreenY: centerY,
      startRotation: item.style?.rotation ?? 0,
      startAngle
    };

    window.addEventListener(EVENT.POINTERMOVE, handleRotatePointerMove);
    window.addEventListener(EVENT.POINTERUP, handleRotatePointerUp);
  }

  function handleRotatePointerUp(): void {
    stopRotating();
  }

  function handleRotatePointerMove(event: PointerEvent): void {
    if (!rotateState) return;

    const currentAngle =
      Math.atan2(
        event.clientY - rotateState.centerScreenY,
        event.clientX - rotateState.centerScreenX
      ) *
      (180 / Math.PI);

    const deltaAngle = currentAngle - rotateState.startAngle;
    const newRotation =
      (((rotateState.startRotation + deltaAngle) % 360) + 360) % 360;

    const item = annotationsState.items.find((i) => i.id === rotateState!.id);
    if (!item) return;

    annotationsActions.updateAnnotation(rotateState.id, {
      style: { ...(item.style ?? {}), rotation: Math.round(newRotation) }
    });
  }

  function getOverlayPoint(event: MouseEvent): { x: number; y: number } | null {
    if (!overlayElement) return null;
    const scale = globalState.zoom.pageZoomLevel / 100;
    const rect = overlayElement.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale
    };
  }

  // Distinguish single click from first click of double-click:
  // ondblclick fires after two onclick events — on dblclick we undo the
  // duplicate point added by the second onclick and finalize.
  function handleDrawingClick(event: MouseEvent): void {
    event.stopPropagation();
    const point = getOverlayPoint(event);
    if (point) annotationsActions.addDrawingPoint(point);
  }

  function handleDrawingDblClick(event: MouseEvent): void {
    event.stopPropagation();
    // The second onclick already added a duplicate at this position — remove it.
    annotationsActions.removeLastDrawingPoint();
    annotationsActions.finalizeDrawingMode();
    hoverPoint = null;
  }

  function handleDrawingMouseMove(event: MouseEvent): void {
    hoverPoint = getOverlayPoint(event);
  }

  $effect(() => {
    if (!isDrawingMode) {
      hoverPoint = null;
      return;
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        annotationsActions.cancelDrawingMode();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    stopDragging();
    stopResizing();
    stopRotating();
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

    if (style.backgroundColor) {
      const bgColor = getColorValue(style.backgroundColor, '#ffffff');
      const bgOpacity =
        style.backgroundOpacity !== undefined
          ? Math.max(0, Math.min(100, style.backgroundOpacity)) / 100
          : 0.9;
      styles.push(
        `background: color-mix(in srgb, ${bgColor} ${bgOpacity * 100}%, transparent)`
      );
    } else {
      styles.push('background: transparent');
      styles.push('box-shadow: none');
    }

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
    const size = 40;

    switch (shapeType) {
      case SHAPE_TYPE.ARROW: {
        const curvature = item.style?.curvature ?? 50;
        const cy = size / 2;
        const shaftEnd = size * 0.65;
        const headTop = cy - size * 0.28;
        const headBottom = cy + size * 0.28;
        const curveOffset = ((curvature - 50) / 50) * size * 0.35;
        const controlY = cy - curveOffset;

        // Two sub-paths: open shaft line + closed arrowhead polygon.
        // fill applies only to the closed arrowhead; the shaft is stroke-only.
        const shaft =
          Math.abs(curvature - 50) < 2
            ? `M 0,${cy} L ${shaftEnd},${cy}`
            : `M 0,${cy} Q ${shaftEnd / 2},${controlY} ${shaftEnd},${cy}`;
        const head = `M ${shaftEnd},${headTop} L ${size},${cy} L ${shaftEnd},${headBottom} Z`;

        return { type: SHAPE_TYPE.ARROW, path: `${shaft} ${head}` };
      }
      case SHAPE_TYPE.LINE:
        return {
          type: 'path',
          path: `M 0,${size / 2} L ${size},${size / 2}`
        };
      case SHAPE_TYPE.RECTANGLE:
        return {
          type: 'path',
          path: `M 0,0 L ${size},0 L ${size},${size} L 0,${size} Z`
        };
      case SHAPE_TYPE.CIRCLE:
        return {
          type: SHAPE_TYPE.CIRCLE,
          cx: size / 2,
          cy: size / 2,
          r: size / 2
        };
      case SHAPE_TYPE.TRIANGLE:
        return {
          type: 'path',
          path: `M ${size / 2},0 L ${size},${size} L 0,${size} Z`
        };
      case SHAPE_TYPE.STAR:
        return {
          type: 'path',
          path: createStarPath(size / 2, size / 2, 5, size / 2, size / 4)
        };
      default:
        return {
          type: SHAPE_TYPE.CIRCLE,
          cx: size / 2,
          cy: size / 2,
          r: size / 2
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

<div
  class="annotation-overlay"
  class:drawing-mode={isDrawingMode}
  class:non-interactive={!interactive}
  bind:this={overlayElement}
>
  {#if isDrawingMode}
    <div
      class="drawing-capture"
      role="presentation"
      onclick={handleDrawingClick}
      ondblclick={handleDrawingDblClick}
      onmousemove={handleDrawingMouseMove}
      onmouseleave={() => (hoverPoint = null)}
    >
      {#if drawingPoints.length > 0}
        <svg class="drawing-preview" width="100%" height="100%">
          {#if drawingPoints.length >= 2}
            <polyline
              points={drawingPoints.map((p) => `${p.x},${p.y}`).join(' ')}
              fill={annotationsState.drawingModeType === DrawingType.ZONE
                ? 'rgba(0,114,195,0.08)'
                : 'none'}
              stroke="var(--cds-interactive-01, #0072c3)"
              stroke-width="2"
              stroke-dasharray="5,3"
              stroke-linejoin="round"
            />
          {/if}
          {#if hoverPoint && drawingPoints.length >= 1}
            {@const last = drawingPoints[drawingPoints.length - 1]}
            <line
              x1={last.x}
              y1={last.y}
              x2={hoverPoint.x}
              y2={hoverPoint.y}
              stroke="var(--cds-interactive-01, #0072c3)"
              stroke-width="1"
              stroke-dasharray="3,3"
              opacity="0.6"
            />
          {/if}
          {#each drawingPoints as point, i (i)}
            <circle
              cx={point.x}
              cy={point.y}
              r={i === 0 ? 5 : 3}
              fill={i === 0 ? 'var(--cds-interactive-01, #0072c3)' : 'white'}
              stroke="var(--cds-interactive-01, #0072c3)"
              stroke-width="2"
            />
          {/each}
        </svg>
      {/if}
    </div>
  {/if}

  {#each visibleItems as item (item.id)}
    <div
      class="annotation-item"
      class:editable={isAnnotationEditing}
      class:selected={isAnnotationEditing &&
        selectedId === item.id &&
        item.type !== AnnotationKind.SHAPE}
      class:dragging={dragState?.id === item.id}
      style="left: {item.position.x}px; top: {item.position.y}px;"
      role="button"
      tabindex="0"
      aria-disabled="false"
      aria-label={m.annotationImageAlt()}
      onclick={(event: MouseEvent) => handleAnnotationClick(event, item.id)}
      ondblclick={(event: MouseEvent) =>
        handleAnnotationDblClick(event, item.id)}
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
        {@const shapeType = String(item.content ?? SHAPE_TYPE.CIRCLE)}
        {@const shapeData = renderShape(item, shapeType)}
        {@const shapeStyle = getShapeStyle(item)}
        {@const defaultSize = getShapeDefaultSize(shapeType)}
        {@const shapeW = item.style?.shapeWidth ?? defaultSize.width}
        {@const shapeH = item.style?.shapeHeight ?? defaultSize.height}
        {@const rotation = item.style?.rotation ?? 0}
        {@const isShapeSelected = isAnnotationEditing && selectedId === item.id}
        <div
          class="shape-container"
          class:shape-selected={isShapeSelected}
          style="width: {shapeW}px; height: {shapeH}px; transform: rotate({rotation}deg);"
        >
          <svg
            width={shapeW}
            height={shapeH}
            viewBox={getShapeViewBox(shapeType)}
            class="annotation-shape"
            style="opacity: {shapeStyle.opacity};"
          >
            {#if shapeData.type === SHAPE_TYPE.CIRCLE}
              <circle
                cx={shapeData.cx}
                cy={shapeData.cy}
                r={shapeData.r}
                fill={shapeStyle.fill}
                stroke={shapeStyle.stroke}
                stroke-width={shapeStyle.strokeWidth}
                stroke-dasharray={shapeStyle.strokeDasharray}
              />
            {:else if shapeData.type === SHAPE_TYPE.ARROW}
              <!-- Arrow: fill the closed arrowhead polygon with the stroke color -->
              <path
                d={shapeData.path}
                fill={shapeStyle.stroke}
                stroke={shapeStyle.stroke}
                stroke-width={shapeStyle.strokeWidth}
                stroke-dasharray={shapeStyle.strokeDasharray}
                stroke-linejoin="round"
                stroke-linecap="round"
              />
            {:else}
              <path
                d={shapeData.path}
                fill={shapeStyle.fill}
                stroke={shapeStyle.stroke}
                stroke-width={shapeStyle.strokeWidth}
                stroke-dasharray={shapeStyle.strokeDasharray}
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            {/if}
          </svg>
          {#if isShapeSelected}
            <div class="shape-handles" role="presentation">
              <div
                class="resize-handle resize-nw"
                role="presentation"
                onpointerdown={(e: PointerEvent) =>
                  handleResizePointerDown(e, item, 'nw')}
              ></div>
              <div
                class="resize-handle resize-n"
                role="presentation"
                onpointerdown={(e: PointerEvent) =>
                  handleResizePointerDown(e, item, 'n')}
              ></div>
              <div
                class="resize-handle resize-ne"
                role="presentation"
                onpointerdown={(e: PointerEvent) =>
                  handleResizePointerDown(e, item, 'ne')}
              ></div>
              <div
                class="resize-handle resize-e"
                role="presentation"
                onpointerdown={(e: PointerEvent) =>
                  handleResizePointerDown(e, item, 'e')}
              ></div>
              <div
                class="resize-handle resize-se"
                role="presentation"
                onpointerdown={(e: PointerEvent) =>
                  handleResizePointerDown(e, item, 'se')}
              ></div>
              <div
                class="resize-handle resize-s"
                role="presentation"
                onpointerdown={(e: PointerEvent) =>
                  handleResizePointerDown(e, item, 's')}
              ></div>
              <div
                class="resize-handle resize-sw"
                role="presentation"
                onpointerdown={(e: PointerEvent) =>
                  handleResizePointerDown(e, item, 'sw')}
              ></div>
              <div
                class="resize-handle resize-w"
                role="presentation"
                onpointerdown={(e: PointerEvent) =>
                  handleResizePointerDown(e, item, 'w')}
              ></div>
              <div
                class="rotate-handle"
                role="presentation"
                onpointerdown={(e: PointerEvent) =>
                  handleRotatePointerDown(e, item)}
              ></div>
            </div>
          {/if}
        </div>
      {:else if item.type === AnnotationKind.DRAWING}
        {@const drawingStyle = getShapeStyle(item)}
        {@const points = Array.isArray(item.content) ? item.content : []}
        {#if points.length > 0}
          {@const isClosed = item.style?.drawingType === DrawingType.ZONE}
          {@const smoothness = item.style?.smoothness ?? 0}
          {@const drawingBounds = computeDrawingBounds(
            points,
            drawingStyle.strokeWidth
          )}
          <svg
            width={drawingBounds.width}
            height={drawingBounds.height}
            viewBox={drawingBounds.viewBox}
            class="annotation-drawing"
            style="opacity: {drawingStyle.opacity};"
          >
            <path
              d={smoothDrawingPath(points, smoothness, isClosed)}
              fill={isClosed ? drawingStyle.fill : 'none'}
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
        {@const size = item.style?.size ?? 200}
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

<style>
  .annotation-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: var(--z-content-raised);
  }

  .drawing-capture {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    pointer-events: auto;
    z-index: 5;
  }

  .drawing-preview {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .annotation-item {
    position: absolute;
    pointer-events: auto;
    cursor: pointer;
    touch-action: none;
    outline: none;
  }

  .annotation-overlay.non-interactive .annotation-item {
    pointer-events: none;
    cursor: default;
  }

  .annotation-item.editable {
    pointer-events: auto;
    cursor: move;
  }

  .annotation-item:hover:not(:has(.shape-container)) {
    outline: 1px dashed #726e6e;
  }

  .annotation-item:hover .shape-container {
    outline: 1px dashed #726e6e;
  }

  .annotation-item.selected {
    outline: 1px dashed #726e6e;
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

  .shape-container {
    position: relative;
    transform-origin: center;
  }

  .shape-container.shape-selected {
    outline: 1px dashed var(--cds-interactive-01, #0072c3);
  }

  .shape-handles {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }

  .resize-handle {
    position: absolute;
    width: 8px;
    height: 8px;
    background: white;
    border: 2px solid var(--cds-interactive-01, #0072c3);
    border-radius: 2px;
    pointer-events: auto;
    transform: translate(-50%, -50%);
    z-index: 1;
  }

  .resize-nw {
    left: 0%;
    top: 0%;
    cursor: nw-resize;
  }
  .resize-n {
    left: 50%;
    top: 0%;
    cursor: n-resize;
  }
  .resize-ne {
    left: 100%;
    top: 0%;
    cursor: ne-resize;
  }
  .resize-e {
    left: 100%;
    top: 50%;
    cursor: e-resize;
  }
  .resize-se {
    left: 100%;
    top: 100%;
    cursor: se-resize;
  }
  .resize-s {
    left: 50%;
    top: 100%;
    cursor: s-resize;
  }
  .resize-sw {
    left: 0%;
    top: 100%;
    cursor: sw-resize;
  }
  .resize-w {
    left: 0%;
    top: 50%;
    cursor: w-resize;
  }

  .rotate-handle {
    position: absolute;
    left: 50%;
    top: -24px;
    width: 10px;
    height: 10px;
    background: white;
    border: 2px solid var(--cds-interactive-01, #0072c3);
    border-radius: 50%;
    pointer-events: auto;
    transform: translate(-50%, 0);
    cursor: grab;
    z-index: 1;
  }

  .rotate-handle:active {
    cursor: grabbing;
  }
</style>
