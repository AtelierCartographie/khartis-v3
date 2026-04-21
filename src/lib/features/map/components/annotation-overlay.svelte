<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    getShapeDefaultDimensions,
    isShapeAspectRatioLocked,
    SHAPE_TYPE
  } from '$lib/features/commons/constants';
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
  import { getFormatState } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
  import { activateStylingToolFromMap } from '../utils/styling-tool-activation.utils';
  import {
    computeDrawingBounds,
    smoothDrawingPath
  } from '../utils/annotation-drawing.utils';
  import type {
    Annotation,
    AnnotationStyle
  } from '$lib/features/step-toolbar/tools/annotations/annotations.types';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';

  let {
    interactive = true,
    hidden = false
  }: { interactive?: boolean; hidden?: boolean } = $props();

  const DRAWING_POINT_STEP_PX = 6;
  const DRAWING_CLOSE_THRESHOLD_PX = 18;
  const MIN_SHAPE_SIZE = 24;
  const SHAPE_VIEWBOX_PADDING = 8;

  type AnnotationInteractionScope = 'map' | 'page';

  let overlayElement = $state<HTMLDivElement | null>(null);
  let mapLayerElement = $state<HTMLDivElement | null>(null);
  let dragState = $state<{
    id: string;
    scope: AnnotationInteractionScope;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
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
  let drawingPointerId = $state<number | null>(null);
  let drawingCloseToStart = $state(false);

  const annotationsState = $derived(getAnnotationsState());
  const formatState = $derived(getFormatState());
  const pageMargins = $derived(formatState.margins);
  const mapLayerStyle = $derived.by(() => {
    const width = Math.max(
      1,
      formatState.width - pageMargins.left - pageMargins.right
    );
    const height = Math.max(
      1,
      formatState.height - pageMargins.top - pageMargins.bottom
    );

    return [
      `left: ${pageMargins.left}px`,
      `top: ${pageMargins.top}px`,
      `width: ${width}px`,
      `height: ${height}px`
    ].join('; ');
  });
  const isDrawingMode = $derived(annotationsState.isDrawingMode);
  const drawingPoints = $derived(annotationsState.drawingInProgress);
  const currentDrawingStyle = $derived(
    getVectorStyle(annotationsState.defaultStyle)
  );
  const drawingPreviewPoints = $derived.by(() => {
    if (
      annotationsState.drawingModeType !== DrawingType.ZONE ||
      !drawingCloseToStart ||
      drawingPoints.length < 3
    ) {
      return drawingPoints;
    }

    return [...drawingPoints.slice(0, -1), drawingPoints[0]];
  });
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

  function getPageScale(): number {
    return Math.max(globalState.zoom.pageZoomScale, 0.1);
  }

  function getShapeDefaultSize(shapeType: string): {
    width: number;
    height: number;
  } {
    return getShapeDefaultDimensions(shapeType);
  }

  function getShapeViewBox(shapeType: string): string {
    const { width, height } = getShapeDefaultSize(shapeType);

    return `${-SHAPE_VIEWBOX_PADDING} ${-SHAPE_VIEWBOX_PADDING} ${width + SHAPE_VIEWBOX_PADDING * 2} ${height + SHAPE_VIEWBOX_PADDING * 2}`;
  }

  function getDrawingPointThreshold(): number {
    return DRAWING_POINT_STEP_PX / getPageScale();
  }

  function getDrawingCloseThreshold(): number {
    return DRAWING_CLOSE_THRESHOLD_PX / getPageScale();
  }

  function getDistance(
    a: { x: number; y: number },
    b: { x: number; y: number }
  ): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function getMinimumDrawingPoints(type: DrawingType): number {
    return type === DrawingType.ZONE ? 3 : 2;
  }

  function appendDrawingSample(
    points: { x: number; y: number }[],
    point: { x: number; y: number }
  ): { x: number; y: number }[] {
    if (points.length === 0) {
      return [point];
    }

    const previousPoint = points[points.length - 1];
    if (getDistance(previousPoint, point) < getDrawingPointThreshold()) {
      return points;
    }

    return [...points, point];
  }

  function isNearDrawingStart(point: { x: number; y: number }): boolean {
    if (
      annotationsState.drawingModeType !== DrawingType.ZONE ||
      drawingPoints.length < 3
    ) {
      return false;
    }

    return getDistance(drawingPoints[0], point) <= getDrawingCloseThreshold();
  }

  function isNearDrawingStartForPoints(
    points: { x: number; y: number }[],
    point: { x: number; y: number }
  ): boolean {
    if (
      annotationsState.drawingModeType !== DrawingType.ZONE ||
      points.length < 3
    ) {
      return false;
    }

    return getDistance(points[0], point) <= getDrawingCloseThreshold();
  }

  function isPageElement(item: Annotation): boolean {
    return item.role != null;
  }

  function getInteractionLayer(
    scope: AnnotationInteractionScope
  ): HTMLDivElement | null {
    return scope === 'page' ? overlayElement : mapLayerElement;
  }

  function getRenderedPosition(item: Annotation): { x: number; y: number } {
    if (isPageElement(item)) {
      return item.position;
    }

    return {
      x: item.position.x + pageMargins.left,
      y: item.position.y + pageMargins.top
    };
  }

  function getAnnotationPositionStyle(item: Annotation): string {
    const { x, y } = getRenderedPosition(item);
    return `left: ${x}px; top: ${y}px;`;
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
    if (!dragState) {
      return;
    }

    const layer = getInteractionLayer(dragState.scope);
    if (!layer) {
      return;
    }

    const scale = getPageScale();
    const rect = layer.getBoundingClientRect();
    const maxX = Math.max(0, rect.width / scale - dragState.width);
    const maxY = Math.max(0, rect.height / scale - dragState.height);

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

    const scope = isPageElement(item) ? 'page' : 'map';
    const layer = getInteractionLayer(scope);
    if (!layer) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    annotationsActions.selectAnnotation(item.id);

    const scale = getPageScale();
    const rect = layer.getBoundingClientRect();
    const currentTarget = event.currentTarget;
    const targetRect =
      currentTarget instanceof HTMLElement
        ? currentTarget.getBoundingClientRect()
        : null;
    dragState = {
      id: item.id,
      scope,
      offsetX: (event.clientX - rect.left) / scale - item.position.x,
      offsetY: (event.clientY - rect.top) / scale - item.position.y,
      width: targetRect ? targetRect.width / scale : 0,
      height: targetRect ? targetRect.height / scale : 0
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
    const viewportElement =
      overlayElement?.closest('.workspace-viewport') ??
      overlayElement?.closest('.main-content');
    if (!viewportElement) return;

    const rect = viewportElement.getBoundingClientRect();
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

  function resolveResizedShapeBounds(
    item: Annotation,
    handle: string,
    dx: number,
    dy: number,
    startBounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  ): { x: number; y: number; width: number; height: number } {
    const shapeType = String(item.content ?? '');
    const preserveAspectRatio = isShapeAspectRatioLocked(shapeType);
    const startRight = startBounds.x + startBounds.width;
    const startBottom = startBounds.y + startBounds.height;
    const startCenterX = startBounds.x + startBounds.width / 2;
    const startCenterY = startBounds.y + startBounds.height / 2;

    let nextX = startBounds.x;
    let nextY = startBounds.y;
    let nextWidth = startBounds.width;
    let nextHeight = startBounds.height;

    switch (handle) {
      case 'nw':
        nextWidth = Math.max(MIN_SHAPE_SIZE, startBounds.width - dx);
        nextHeight = Math.max(MIN_SHAPE_SIZE, startBounds.height - dy);
        nextX = startRight - nextWidth;
        nextY = startBottom - nextHeight;
        break;
      case 'n':
        nextHeight = Math.max(MIN_SHAPE_SIZE, startBounds.height - dy);
        nextY = startBottom - nextHeight;
        break;
      case 'ne':
        nextWidth = Math.max(MIN_SHAPE_SIZE, startBounds.width + dx);
        nextHeight = Math.max(MIN_SHAPE_SIZE, startBounds.height - dy);
        nextY = startBottom - nextHeight;
        break;
      case 'e':
        nextWidth = Math.max(MIN_SHAPE_SIZE, startBounds.width + dx);
        break;
      case 'se':
        nextWidth = Math.max(MIN_SHAPE_SIZE, startBounds.width + dx);
        nextHeight = Math.max(MIN_SHAPE_SIZE, startBounds.height + dy);
        break;
      case 's':
        nextHeight = Math.max(MIN_SHAPE_SIZE, startBounds.height + dy);
        break;
      case 'sw':
        nextWidth = Math.max(MIN_SHAPE_SIZE, startBounds.width - dx);
        nextHeight = Math.max(MIN_SHAPE_SIZE, startBounds.height + dy);
        nextX = startRight - nextWidth;
        break;
      case 'w':
        nextWidth = Math.max(MIN_SHAPE_SIZE, startBounds.width - dx);
        nextX = startRight - nextWidth;
        break;
    }

    if (!preserveAspectRatio) {
      return {
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight
      };
    }

    const aspectRatio = startBounds.width / Math.max(startBounds.height, 1);
    const horizontalHandle = handle === 'e' || handle === 'w';
    const verticalHandle = handle === 'n' || handle === 's';
    const widthRatio = nextWidth / startBounds.width;
    const heightRatio = nextHeight / startBounds.height;
    const scale = Math.max(
      MIN_SHAPE_SIZE / Math.max(startBounds.width, startBounds.height),
      horizontalHandle
        ? widthRatio
        : verticalHandle
          ? heightRatio
          : Math.max(widthRatio, heightRatio)
    );

    nextWidth = Math.max(MIN_SHAPE_SIZE, startBounds.width * scale);
    nextHeight = Math.max(
      MIN_SHAPE_SIZE,
      nextWidth / Math.max(aspectRatio, 0.01)
    );

    if (verticalHandle) {
      nextWidth = Math.max(
        MIN_SHAPE_SIZE,
        startBounds.height * scale * aspectRatio
      );
      nextHeight = Math.max(MIN_SHAPE_SIZE, startBounds.height * scale);
    }

    switch (handle) {
      case 'e':
        nextX = startBounds.x;
        nextY = startCenterY - nextHeight / 2;
        break;
      case 'w':
        nextX = startRight - nextWidth;
        nextY = startCenterY - nextHeight / 2;
        break;
      case 'n':
        nextX = startCenterX - nextWidth / 2;
        nextY = startBottom - nextHeight;
        break;
      case 's':
        nextX = startCenterX - nextWidth / 2;
        nextY = startBounds.y;
        break;
      case 'nw':
        nextX = startRight - nextWidth;
        nextY = startBottom - nextHeight;
        break;
      case 'ne':
        nextX = startBounds.x;
        nextY = startBottom - nextHeight;
        break;
      case 'se':
        nextX = startBounds.x;
        nextY = startBounds.y;
        break;
      case 'sw':
        nextX = startRight - nextWidth;
        nextY = startBounds.y;
        break;
    }

    return {
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight
    };
  }

  function handleResizePointerMove(event: PointerEvent): void {
    if (!resizeState) return;

    const scale = getPageScale();
    const dx = (event.clientX - resizeState.startPointerX) / scale;
    const dy = (event.clientY - resizeState.startPointerY) / scale;

    const item = annotationsState.items.find((i) => i.id === resizeState!.id);
    if (!item) return;

    const resizedBounds = resolveResizedShapeBounds(
      item,
      resizeState.handle,
      dx,
      dy,
      {
        x: resizeState.startAnnotationX,
        y: resizeState.startAnnotationY,
        width: resizeState.startW,
        height: resizeState.startH
      }
    );

    annotationsActions.updateAnnotation(resizeState.id, {
      position: { x: resizedBounds.x, y: resizedBounds.y },
      style: {
        ...(item.style ?? {}),
        shapeWidth: Math.round(resizedBounds.width),
        shapeHeight: Math.round(resizedBounds.height)
      }
    });
  }

  function handleRotatePointerDown(
    event: PointerEvent,
    item: Annotation
  ): void {
    event.preventDefault();
    event.stopPropagation();

    if (!mapLayerElement) return;

    const scale = getPageScale();
    const rect = mapLayerElement.getBoundingClientRect();
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

  function getOverlayPoint(
    event:
      | Pick<MouseEvent, 'clientX' | 'clientY'>
      | Pick<PointerEvent, 'clientX' | 'clientY'>
  ): { x: number; y: number } | null {
    if (!mapLayerElement) return null;
    const scale = getPageScale();
    const rect = mapLayerElement.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale
    };
  }

  function resetDrawingPointerState(): void {
    drawingPointerId = null;
    drawingCloseToStart = false;
  }

  function getReleasedDrawingPoints(
    point: { x: number; y: number } | null
  ): { x: number; y: number }[] {
    if (!point) {
      return drawingPoints;
    }

    return appendDrawingSample(drawingPoints, point);
  }

  function getZoneAutoClosedPoints(
    points: { x: number; y: number }[]
  ): { x: number; y: number }[] {
    let endIndex = points.length;

    while (
      endIndex > 1 &&
      isNearDrawingStartForPoints(points, points[endIndex - 1])
    ) {
      endIndex -= 1;
    }

    return points.slice(0, endIndex);
  }

  function handleDrawingPointerDown(event: PointerEvent): void {
    if (!isDrawingMode) {
      return;
    }

    const point = getOverlayPoint(event);
    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const nextPoints = appendDrawingSample(drawingPoints, point);
    annotationsActions.setDrawingInProgress(nextPoints);
    drawingCloseToStart = isNearDrawingStart(point);
    drawingPointerId = event.pointerId;

    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handleDrawingPointerMove(event: PointerEvent): void {
    if (drawingPointerId !== event.pointerId) {
      return;
    }

    const point = getOverlayPoint(event);
    if (!point) {
      return;
    }

    event.preventDefault();

    const nextPoints = appendDrawingSample(drawingPoints, point);
    if (nextPoints !== drawingPoints) {
      annotationsActions.setDrawingInProgress(nextPoints);
    }

    drawingCloseToStart = isNearDrawingStart(point);
  }

  function handleDrawingPointerUp(event: PointerEvent): void {
    if (drawingPointerId !== event.pointerId) {
      return;
    }

    const point = getOverlayPoint(event);
    const nextPoints = getReleasedDrawingPoints(point);
    const minimumPointCount = getMinimumDrawingPoints(
      annotationsState.drawingModeType
    );
    const shouldAutoCloseZone =
      annotationsState.drawingModeType === DrawingType.ZONE &&
      !!point &&
      isNearDrawingStart(point);
    const zoneAutoClosedPoints = shouldAutoCloseZone
      ? getZoneAutoClosedPoints(nextPoints)
      : nextPoints;
    const finalPointCount = zoneAutoClosedPoints.length;

    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (annotationsState.drawingModeType === DrawingType.LINE) {
      annotationsActions.setDrawingInProgress(nextPoints);
      if (finalPointCount >= minimumPointCount) {
        annotationsActions.finalizeDrawingMode();
      }
      resetDrawingPointerState();
      return;
    }

    annotationsActions.setDrawingInProgress(zoneAutoClosedPoints);

    if (shouldAutoCloseZone && finalPointCount >= minimumPointCount) {
      annotationsActions.finalizeDrawingMode();
    }

    resetDrawingPointerState();
  }

  $effect(() => {
    if (!isDrawingMode) {
      resetDrawingPointerState();
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

  function getVectorStyle(style: AnnotationStyle | undefined): {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeDasharray?: string;
    opacity: number;
  } {
    const resolvedStyle = style ?? {};
    return {
      fill: getColorValue(resolvedStyle.fillColor, 'none'),
      stroke: getColorValue(resolvedStyle.strokeColor, '#000000'),
      strokeWidth: resolvedStyle.strokeWidth ?? 2,
      strokeDasharray:
        resolvedStyle.strokeStyle === 'dashed'
          ? '5,5'
          : resolvedStyle.strokeStyle === 'dotted'
            ? '2,2'
            : undefined,
      opacity: toOpacityUnit(resolvedStyle.opacity)
    };
  }

  function renderShape(
    item: Annotation,
    shapeType: string
  ): { type: string; path?: string; cx?: number; cy?: number; r?: number } {
    const { width, height } = getShapeDefaultSize(shapeType);
    const centerX = width / 2;
    const centerY = height / 2;

    switch (shapeType) {
      case SHAPE_TYPE.ARROW: {
        const curvature = item.style?.curvature ?? 50;
        const shaftEnd = width * 0.7;
        const headTop = centerY - height * 0.28;
        const headBottom = centerY + height * 0.28;
        const curveOffset = ((curvature - 50) / 50) * height * 0.35;
        const controlY = centerY - curveOffset;
        const shaft =
          Math.abs(curvature - 50) < 2
            ? `M 0,${centerY} L ${shaftEnd},${centerY}`
            : `M 0,${centerY} Q ${width * 0.35},${controlY} ${shaftEnd},${centerY}`;
        const head = `M ${shaftEnd},${headTop} L ${width},${centerY} L ${shaftEnd},${headBottom} Z`;

        return { type: SHAPE_TYPE.ARROW, path: `${shaft} ${head}` };
      }
      case SHAPE_TYPE.LINE:
        return {
          type: 'path',
          path: `M 0,${centerY} L ${width},${centerY}`
        };
      case SHAPE_TYPE.RECTANGLE:
        return {
          type: 'path',
          path: `M 0,0 L ${width},0 L ${width},${height} L 0,${height} Z`
        };
      case SHAPE_TYPE.CIRCLE:
        return {
          type: SHAPE_TYPE.CIRCLE,
          cx: centerX,
          cy: centerY,
          r: Math.min(width, height) / 2
        };
      case SHAPE_TYPE.TRIANGLE:
        return {
          type: 'path',
          path: `M ${centerX},0 L ${width},${height} L 0,${height} Z`
        };
      case SHAPE_TYPE.STAR:
        return {
          type: 'path',
          path: createStarPath(
            centerX,
            centerY,
            5,
            Math.min(width, height) / 2,
            Math.min(width, height) / 4
          )
        };
      default:
        return {
          type: SHAPE_TYPE.CIRCLE,
          cx: centerX,
          cy: centerY,
          r: Math.min(width, height) / 2
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
  class:hidden={hidden}
  class:non-interactive={!interactive}
  bind:this={overlayElement}
>
  <div
    class="annotation-map-layer"
    bind:this={mapLayerElement}
    style={mapLayerStyle}
  >
    {#if isDrawingMode}
      {@const previewSmoothness = annotationsState.defaultStyle.smoothness ?? 0}
      {@const previewIsClosed =
        annotationsState.drawingModeType === DrawingType.ZONE}
      {@const previewBounds = computeDrawingBounds(
        drawingPreviewPoints,
        currentDrawingStyle.strokeWidth,
        previewSmoothness,
        previewIsClosed
      )}
      <div
        class="drawing-capture"
        role="presentation"
        data-workspace-pan-ignore="true"
        onpointerdown={handleDrawingPointerDown}
        onpointermove={handleDrawingPointerMove}
        onpointerup={handleDrawingPointerUp}
        onpointercancel={handleDrawingPointerUp}
      >
        {#if drawingPoints.length > 0}
          <svg
            class="drawing-preview"
            width={previewBounds.width}
            height={previewBounds.height}
            viewBox={previewBounds.viewBox}
          >
            {#if drawingPreviewPoints.length >= 2}
              <path
                d={smoothDrawingPath(
                  drawingPreviewPoints,
                  previewSmoothness,
                  previewIsClosed
                )}
                fill={previewIsClosed ? currentDrawingStyle.fill : 'none'}
                stroke={currentDrawingStyle.stroke}
                stroke-width={currentDrawingStyle.strokeWidth}
                stroke-dasharray={currentDrawingStyle.strokeDasharray}
                stroke-linejoin="round"
                stroke-linecap="round"
                opacity={currentDrawingStyle.opacity}
              />
            {/if}
            {#each drawingPoints as point, i (i)}
              <circle
                cx={point.x}
                cy={point.y}
                r={i === 0 ? 5 : 3}
                fill={i === 0 ? currentDrawingStyle.stroke : 'white'}
                stroke={currentDrawingStyle.stroke}
                stroke-width="2"
              />
            {/each}
            {#if previewIsClosed && drawingPoints.length >= 3}
              {@const startPoint = drawingPoints[0]}
              <circle
                class:drawing-close-target-active={drawingCloseToStart}
                cx={startPoint.x}
                cy={startPoint.y}
                r={drawingCloseToStart ? 10 : 7}
                fill="none"
                stroke={currentDrawingStyle.stroke}
                stroke-width="2"
                stroke-dasharray="4,3"
                opacity="0.7"
              />
            {/if}
          </svg>
        {/if}
      </div>
    {/if}
  </div>

  {#each visibleItems as item (item.id)}
    <div
      class="annotation-item"
      class:editable={isAnnotationEditing}
      class:selected={isAnnotationEditing &&
        selectedId === item.id &&
        item.type !== AnnotationKind.SHAPE}
      class:dragging={dragState?.id === item.id}
      data-annotation-role={item.role}
      data-workspace-pan-ignore="true"
      style={getAnnotationPositionStyle(item)}
      role="button"
      tabindex="0"
      aria-disabled="false"
      aria-label={item.type === AnnotationKind.TEXT &&
      typeof item.content === 'string' &&
      item.content.trim()
        ? item.content.trim()
        : m.annotationImageAlt()}
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
        {@const shapeStyle = getVectorStyle(item.style)}
        {@const defaultSize = getShapeDefaultSize(shapeType)}
        {@const shapeW = item.style?.shapeWidth ?? defaultSize.width}
        {@const shapeH = item.style?.shapeHeight ?? defaultSize.height}
        {@const rotation = item.style?.rotation ?? 0}
        {@const isShapeSelected = isAnnotationEditing && selectedId === item.id}
        <div
          class="shape-frame"
          class:shape-selected={isShapeSelected}
          style="width: {shapeW}px; height: {shapeH}px;"
        >
          <div class="shape-content" style="transform: rotate({rotation}deg);">
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
          </div>
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
        {@const drawingStyle = getVectorStyle(item.style)}
        {@const points = Array.isArray(item.content) ? item.content : []}
        {#if points.length > 0}
          {@const isClosed = item.style?.drawingType === DrawingType.ZONE}
          {@const smoothness = item.style?.smoothness ?? 0}
          {@const drawingBounds = computeDrawingBounds(
            points,
            drawingStyle.strokeWidth,
            smoothness,
            isClosed
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

  .annotation-overlay.hidden {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  :global(.is-exporting-map) .annotation-overlay.hidden {
    opacity: 1;
    visibility: visible;
  }

  .annotation-map-layer {
    position: absolute;
    pointer-events: none;
  }

  .drawing-capture {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    pointer-events: auto;
    touch-action: none;
    z-index: 5;
  }

  .drawing-preview {
    position: absolute;
    top: 0;
    left: 0;
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

  .annotation-item:hover:not(:has(.shape-frame)) {
    outline: 1px dashed #726e6e;
  }

  .annotation-item:hover .shape-frame {
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

  .annotation-item[data-annotation-role] .annotation-text {
    width: 100%;
    max-width: none;
    padding: 0;
    border-radius: 0;
    line-height: 1.35;
  }

  .annotation-item[data-annotation-role='title'],
  .annotation-item[data-annotation-role='subtitle'] {
    width: 320px;
  }

  .annotation-item[data-annotation-role='source'],
  .annotation-item[data-annotation-role='basemap_source'],
  .annotation-item[data-annotation-role='signature'],
  .annotation-item[data-annotation-role='credit'],
  .annotation-item[data-annotation-role='note'] {
    width: 220px;
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

  .shape-frame {
    position: relative;
  }

  .shape-frame.shape-selected {
    outline: 1px dashed var(--cds-interactive-01, #0072c3);
  }

  .shape-content {
    position: absolute;
    inset: 0;
    transform-origin: center;
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

  .drawing-close-target-active {
    filter: drop-shadow(0 0 4px rgba(0, 114, 195, 0.45));
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
