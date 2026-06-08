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
  } from '$lib/features/commons/stores/global.svelte';
  import { StylingTools } from '$lib/features/commons/types/global';
  import {
    AnnotationKind,
    DrawingType
  } from '$lib/features/commons/constants/ui.constants';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import {
    clampFontSize,
    resolveFontFamilyStack
  } from '$lib/features/step-toolbar/fonts.constants';
  import { onDestroy, tick } from 'svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from '$lib/features/step-toolbar/tools/annotations';
  import { getFormatState } from '$lib/features/step-toolbar/tools/format';
  import { activateStylingToolFromMap } from '../utils/styling-tool-activation.utils';
  import {
    getElementCenteringDelta,
    getFocusViewportElement
  } from '../utils/focus-viewport.utils';
  import {
    computeDrawingBounds,
    smoothDrawingPath
  } from '../utils/annotation-drawing.utils';
  import {
    buildVectorLinePath,
    computeVectorPathBounds,
    getArrowHeadGeometry,
    getSegmentTensionHandle,
    insertControlOffsetAt,
    removeControlOffsetForPoint,
    type VectorPoint
  } from '../utils/annotation-vector.utils';
  import { setStylingToolPopoverDragging } from '../utils/tool-popover-drag-visibility.utils';
  import type {
    Annotation,
    AnnotationDataAnchor,
    AnnotationPlacementPreview,
    AnnotationStyle,
    PageElementRole
  } from '$lib/features/step-toolbar/tools/annotations';
  import { resolveAnnotationCoordinateSpace } from '$lib/features/step-toolbar/tools/annotations';
  import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
  import {
    canAnchorToMap,
    dataToScreenPx,
    screenPxToData
  } from '../utils/map-anchor-projection.utils';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';

  let {
    interactive = true,
    hidden = false
  }: { interactive?: boolean; hidden?: boolean } = $props();

  const DRAWING_POINT_STEP_PX = 6;
  const DRAWING_CLOSE_THRESHOLD_PX = 18;
  const SHAPE_PLACEMENT_DRAG_THRESHOLD_PX = 4;
  const FOCUS_RESET_DEBOUNCE_MS = 200;
  const ANNOTATION_DRAG_THRESHOLD_PX = 3;
  const DRAG_CLICK_SUPPRESSION_MS = 120;
  const MIN_SHAPE_SIZE = 24;
  const SHAPE_VIEWBOX_PADDING = 8;
  const DEFAULT_VECTOR_LINE_LENGTH = 120;

  function isVectorShapeContent(content: unknown): boolean {
    return content === SHAPE_TYPE.ARROW || content === SHAPE_TYPE.LINE;
  }

  function hasArrowHead(content: unknown): boolean {
    return content === SHAPE_TYPE.ARROW;
  }

  function getVectorPoints(item: Annotation): VectorPoint[] {
    const points = item.style?.points;
    return Array.isArray(points) && points.length >= 2 ? points : [];
  }

  function isVectorShapeItem(item: Annotation): boolean {
    return (
      item.type === AnnotationKind.SHAPE &&
      isVectorShapeContent(item.content) &&
      getVectorPoints(item).length >= 2
    );
  }

  function normalizeToOrigin(points: VectorPoint[]): {
    points: VectorPoint[];
    minX: number;
    minY: number;
  } {
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    return {
      points: points.map((point) => ({ x: point.x - minX, y: point.y - minY })),
      minX,
      minY
    };
  }

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
    startClientX: number;
    startClientY: number;
    didDrag: boolean;
    role?: PageElementRole;
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
  let placementDragState = $state<{
    pointerId: number;
    startPoint: { x: number; y: number };
    currentPoint: { x: number; y: number };
    didDrag: boolean;
  } | null>(null);
  let anchorDragState = $state<{
    id: string;
    pointIndex: number;
    startPoints: { x: number; y: number }[];
    startPosition: { x: number; y: number };
    startClientX: number;
    startClientY: number;
  } | null>(null);
  let tensionDragState = $state<{
    id: string;
    segmentIndex: number;
    startOffset: number;
    startClientX: number;
    startClientY: number;
    normalX: number;
    normalY: number;
  } | null>(null);
  let drawingPointerId = $state<number | null>(null);
  let drawingCloseToStart = $state(false);
  let mapViewRevision = $state(0);
  let centeredAnnotationId = $state<string | null>(null);
  let focusResetTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let suppressedClickAnnotationId: string | null = null;
  let suppressedClickTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const annotationsState = $derived(getAnnotationsState());
  const formatState = $derived(getFormatState());
  const pageMargins = $derived(formatState.margins);
  const pageScale = $derived(Math.max(globalState.zoom.pageZoomScale, 0.1));
  const mapLayerStyle = $derived.by(() => {
    const scale = pageScale;
    const width = Math.max(
      1,
      formatState.width - pageMargins.left - pageMargins.right
    );
    const height = Math.max(
      1,
      formatState.height - pageMargins.top - pageMargins.bottom
    );

    return [
      `left: ${pageMargins.left * scale}px`,
      `top: ${pageMargins.top * scale}px`,
      `width: ${width * scale}px`,
      `height: ${height * scale}px`
    ].join('; ');
  });
  const creationMode = $derived(annotationsState.creationMode);
  const isPlacementMode = $derived(creationMode === 'placing');
  const isDrawingMode = $derived(creationMode === 'drawing');
  const isCreationActive = $derived(creationMode !== 'idle');
  const pendingType = $derived(annotationsState.pendingType);
  const pendingPreview = $derived(annotationsState.previewGeometry);
  const drawingPoints = $derived(annotationsState.drawingInProgress);
  const currentDrawingStyle = $derived(
    getVectorStyle(
      annotationsState.pendingStyle ?? annotationsState.defaultStyle
    )
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

  // Keep map-anchored annotations reactive to MapLibre interactions. The deck
  // orthographic engine drives reactivity through `mapInstanceStore.deckViewState`
  // (read below), but MapLibre mutates its viewport imperatively, so mirror the
  // `mapViewRevision` bump pattern from geo-indications-overlay.
  $effect(() => {
    const map = mapInstanceStore.map;
    if (!map) {
      return;
    }

    const refresh = () => {
      mapViewRevision += 1;
    };

    map.on('move', refresh);
    map.on('zoom', refresh);
    map.on('resize', refresh);

    return () => {
      map.off('move', refresh);
      map.off('zoom', refresh);
      map.off('resize', refresh);
    };
  });

  function getAnnotationAnchor(item: Annotation): AnnotationDataAnchor | null {
    if (getAnnotationScope(item) !== 'map') {
      return null;
    }
    const anchor = item.anchor;
    if (
      !anchor ||
      !Number.isFinite(anchor.lon) ||
      !Number.isFinite(anchor.lat)
    ) {
      return null;
    }
    return anchor;
  }

  // Resolve the on-screen (map-area-local, logical px) position of every
  // data-anchored annotation. Recomputed whenever the map viewState changes so
  // the marks track the basemap; legacy `'map'` annotations (no anchor) and page
  // annotations are absent from this map and keep the pixel-page path.
  const anchoredScreenPositions = $derived.by(() => {
    // Establish reactive dependencies on both engines' viewport.
    void mapViewRevision;
    void mapInstanceStore.deckViewState;

    const positions: Record<string, { x: number; y: number }> = {};
    for (const item of visibleItems) {
      const anchor = getAnnotationAnchor(item);
      if (!anchor) {
        continue;
      }
      const screen = dataToScreenPx(anchor);
      if (screen) {
        positions[item.id] = screen;
      }
    }
    return positions;
  });

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function getPageScale(): number {
    return pageScale;
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

  function getDefaultPlacementSize(
    type: AnnotationKind,
    content: unknown,
    style: AnnotationStyle | undefined
  ): { width: number; height: number } {
    if (type === AnnotationKind.TEXT) {
      return { width: 220, height: 64 };
    }

    if (type === AnnotationKind.IMAGE) {
      const size = Math.max(40, Number(style?.size ?? 200));
      return { width: size, height: size };
    }

    if (type === AnnotationKind.SHAPE) {
      const dimensions = getShapeDefaultSize(
        String(content ?? SHAPE_TYPE.RECTANGLE)
      );
      return {
        width: Math.max(MIN_SHAPE_SIZE, style?.shapeWidth ?? dimensions.width),
        height: Math.max(
          MIN_SHAPE_SIZE,
          style?.shapeHeight ?? dimensions.height
        )
      };
    }

    return { width: 132, height: 80 };
  }

  function clampPreviewPosition(
    position: { x: number; y: number },
    size: { width: number; height: number }
  ): { x: number; y: number } {
    return {
      x: clamp(position.x, 0, Math.max(0, formatState.width - size.width)),
      y: clamp(position.y, 0, Math.max(0, formatState.height - size.height))
    };
  }

  function createVectorLinePlacementPreview(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number }
  ): AnnotationPlacementPreview {
    const shapeType = String(
      annotationsState.pendingContent ?? SHAPE_TYPE.LINE
    );
    const normalized = normalizeToOrigin([startPoint, endPoint]);
    const strokeWidth =
      (annotationsState.pendingStyle ?? annotationsState.defaultStyle)
        .strokeWidth ?? 2;
    const bounds = computeVectorPathBounds(
      normalized.points,
      undefined,
      strokeWidth,
      hasArrowHead(shapeType)
    );
    const size = { width: bounds.width, height: bounds.height };
    const position = clampPreviewPosition(
      { x: normalized.minX, y: normalized.minY },
      size
    );

    return {
      coordinateSpace: 'page',
      type: AnnotationKind.SHAPE,
      position,
      size,
      content: shapeType,
      style: { points: normalized.points }
    };
  }

  function createCenteredPlacementPreview(
    type: AnnotationKind,
    point: { x: number; y: number }
  ): AnnotationPlacementPreview {
    if (
      type === AnnotationKind.SHAPE &&
      isVectorShapeContent(annotationsState.pendingContent)
    ) {
      const half = DEFAULT_VECTOR_LINE_LENGTH / 2;
      return createVectorLinePlacementPreview(
        { x: point.x - half, y: point.y },
        { x: point.x + half, y: point.y }
      );
    }

    const size = getDefaultPlacementSize(
      type,
      annotationsState.pendingContent,
      annotationsState.pendingStyle ?? annotationsState.defaultStyle
    );
    const position = clampPreviewPosition(
      {
        x: point.x - size.width / 2,
        y: point.y - size.height / 2
      },
      size
    );

    return {
      coordinateSpace: 'page',
      type,
      position,
      size,
      content: annotationsState.pendingContent
    };
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

  function getAnnotationScope(item: Annotation): AnnotationInteractionScope {
    return resolveAnnotationCoordinateSpace(item) === 'page' ? 'page' : 'map';
  }

  function getInteractionLayer(
    scope: AnnotationInteractionScope
  ): HTMLDivElement | null {
    return scope === 'page' ? overlayElement : mapLayerElement;
  }

  function getRenderedPosition(item: Annotation): { x: number; y: number } {
    if (getAnnotationScope(item) === 'page') {
      return item.position;
    }

    // Data-anchored: reproject the WGS84 anchor through the live map viewState so
    // the annotation stays glued to the basemap. Falls back to the stored
    // pixel-page position when the anchor cannot be projected (map not ready /
    // composite projection), preserving the legacy behavior.
    const anchored = item.anchor ? anchoredScreenPositions[item.id] : undefined;
    const localPosition = anchored ?? item.position;

    return {
      x: localPosition.x + pageMargins.left,
      y: localPosition.y + pageMargins.top
    };
  }

  function getVectorShapeBoundsOrigin(item: Annotation): {
    x: number;
    y: number;
  } {
    if (!isVectorShapeItem(item)) {
      return { x: 0, y: 0 };
    }

    const vectorStyle = getVectorStyle(item.style);
    const bounds = computeVectorPathBounds(
      getVectorPoints(item),
      item.style?.controlOffsets,
      vectorStyle.strokeWidth,
      hasArrowHead(item.content)
    );

    return { x: bounds.originX, y: bounds.originY };
  }

  function getAnnotationPositionStyle(item: Annotation): string {
    const { x, y } = getRenderedPosition(item);
    const boundsOrigin = getVectorShapeBoundsOrigin(item);
    const scale = getPageScale();
    return `left: ${(x + boundsOrigin.x) * scale}px; top: ${(y + boundsOrigin.y) * scale}px; transform: scale(${scale});`;
  }

  // Persist (or refresh) the WGS84 anchor of a map-scoped annotation from its
  // finalized map-area-local logical position, so it stays glued to the basemap.
  // Page-scoped, role and legacy non-projectable annotations are left untouched
  // (no anchor written), preserving the historical pixel-page behavior.
  function writeMapAnchor(
    item: Annotation,
    localPosition: { x: number; y: number }
  ): void {
    if (getAnnotationScope(item) !== 'map' || !canAnchorToMap()) {
      return;
    }

    const anchor = screenPxToData(localPosition.x, localPosition.y);
    if (anchor) {
      annotationsActions.updateAnnotation(item.id, { anchor });
    }
  }

  // Keep an already-anchored annotation's anchor in sync with its top-left when a
  // shape edit (resize, anchor-point drag) shifts `position`. Does NOT opt a
  // legacy (un-anchored) annotation into map anchoring — only an explicit body
  // drag does that — so shape editing never changes placement semantics.
  function refreshMapAnchorIfPresent(
    item: Annotation,
    localPosition: { x: number; y: number }
  ): void {
    if (!item.anchor) {
      return;
    }
    writeMapAnchor(item, localPosition);
  }

  // A shape created on the map by the store carries an EXPLICIT `coordinateSpace:
  // 'map'` and no anchor yet. Legacy `'map'` items (loaded from older projects)
  // leave `coordinateSpace` undefined, so this guard targets only fresh shapes and
  // never disturbs legacy ones, which keep their opt-in-on-first-drag behavior.
  function isUnanchoredFreshMapShape(item: Annotation): boolean {
    return (
      item.coordinateSpace === 'map' && !item.role && item.anchor === undefined
    );
  }

  // Finalize a freshly created `'map'` shape (rectangle/circle/triangle, vector
  // arrow/line, freehand drawing) the first time it renders. The store creates it
  // in `'map'` space with a map-area-local `position` but cannot reach the
  // projection helpers, so its anchor is written here, gluing it to the basemap.
  // When the active engine/reference cannot round-trip a data anchor (composite /
  // pre-projected CRS), the shape is downgraded back to `'page'` — re-adding the
  // page margins it was created without — so the on-screen placement is identical
  // and it keeps the historical page behavior. Either branch runs once: the item
  // then has an anchor or is `'page'`, so it leaves this effect's selection.
  function anchorOrDowngradeNewMapShape(item: Annotation): void {
    if (canAnchorToMap()) {
      writeMapAnchor(item, item.position);
      return;
    }

    annotationsActions.updateAnnotation(item.id, {
      coordinateSpace: 'page',
      position: {
        x: item.position.x + pageMargins.left,
        y: item.position.y + pageMargins.top
      }
    });
  }

  // Drive the one-time anchoring of newly created map shapes. Kept reactive to the
  // map viewport so a shape created before the map is ready still gets anchored
  // once the projection becomes available; already-anchored and page items are
  // skipped, so this never disturbs existing annotations or fights a live drag.
  $effect(() => {
    void mapViewRevision;
    void mapInstanceStore.deckViewState;

    if (dragState || resizeState || anchorDragState) {
      return;
    }

    for (const item of annotationsState.items) {
      if (isUnanchoredFreshMapShape(item)) {
        anchorOrDowngradeNewMapShape(item);
      }
    }
  });

  function getScaledPreviewStyle(
    position: { x: number; y: number },
    size: { width: number; height: number }
  ): string {
    const scale = getPageScale();
    return `left: ${position.x * scale}px; top: ${position.y * scale}px; width: ${size.width}px; height: ${size.height}px; transform: scale(${scale});`;
  }

  function getScaledDrawingPreviewStyle(bounds: {
    originX: number;
    originY: number;
  }): string {
    const scale = getPageScale();
    return `left: ${bounds.originX * scale}px; top: ${bounds.originY * scale}px; transform: scale(${scale});`;
  }

  function setAnnotationDragVisualState(active: boolean): void {
    setStylingToolPopoverDragging(active);
  }

  function clearSuppressedAnnotationClick(): void {
    if (suppressedClickTimeoutId) {
      clearTimeout(suppressedClickTimeoutId);
      suppressedClickTimeoutId = null;
    }

    suppressedClickAnnotationId = null;
  }

  function suppressNextAnnotationClick(id: string): void {
    clearSuppressedAnnotationClick();
    suppressedClickAnnotationId = id;
    suppressedClickTimeoutId = setTimeout(() => {
      suppressedClickTimeoutId = null;
      suppressedClickAnnotationId = null;
    }, DRAG_CLICK_SUPPRESSION_MS);
  }

  function stopDragging(): void {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    setAnnotationDragVisualState(false);
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

  function stopAnchorDragging(): void {
    window.removeEventListener(EVENT.POINTERMOVE, handleAnchorPointerMove);
    window.removeEventListener(EVENT.POINTERUP, handleAnchorPointerUp);
    anchorDragState = null;
  }

  function stopTensionDragging(): void {
    window.removeEventListener(EVENT.POINTERMOVE, handleTensionPointerMove);
    window.removeEventListener(EVENT.POINTERUP, handleTensionPointerUp);
    tensionDragState = null;
  }

  function getEditablePoints(item: Annotation): VectorPoint[] {
    if (item.type === AnnotationKind.DRAWING) {
      return Array.isArray(item.content) ? (item.content as VectorPoint[]) : [];
    }
    if (isVectorShapeItem(item)) {
      return getVectorPoints(item);
    }
    return [];
  }

  function applyEditablePoints(
    item: Annotation,
    points: VectorPoint[],
    controlOffsets?: number[]
  ): void {
    if (item.type === AnnotationKind.DRAWING) {
      annotationsActions.updateAnnotation(item.id, { content: points });
      return;
    }
    annotationsActions.updateAnnotation(item.id, {
      style: {
        ...(item.style ?? {}),
        points,
        ...(controlOffsets ? { controlOffsets } : {})
      }
    });
  }

  function handleTensionPointerDown(
    event: PointerEvent,
    item: Annotation,
    segmentIndex: number
  ): void {
    event.preventDefault();
    event.stopPropagation();
    const points = getVectorPoints(item);
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    if (!start || !end) return;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    tensionDragState = {
      id: item.id,
      segmentIndex,
      startOffset: item.style?.controlOffsets?.[segmentIndex] ?? 0,
      startClientX: event.clientX,
      startClientY: event.clientY,
      normalX: -dy / length,
      normalY: dx / length
    };
    window.addEventListener(EVENT.POINTERMOVE, handleTensionPointerMove);
    window.addEventListener(EVENT.POINTERUP, handleTensionPointerUp);
  }

  function handleTensionPointerMove(event: PointerEvent): void {
    if (!tensionDragState) return;
    const item = annotationsState.items.find(
      (i) => i.id === tensionDragState!.id
    );
    if (!item) return;
    const points = getVectorPoints(item);
    const segmentCount = points.length - 1;
    if (
      tensionDragState.segmentIndex < 0 ||
      tensionDragState.segmentIndex >= segmentCount
    ) {
      return;
    }
    const scale = Math.max(pageScale, 0.0001);
    const dx = (event.clientX - tensionDragState.startClientX) / scale;
    const dy = (event.clientY - tensionDragState.startClientY) / scale;
    const deltaPerpendicular =
      dx * tensionDragState.normalX + dy * tensionDragState.normalY;
    const nextOffset = tensionDragState.startOffset + 2 * deltaPerpendicular;
    const offsets = Array.from(
      { length: segmentCount },
      (_, index) => item.style?.controlOffsets?.[index] ?? 0
    );
    offsets[tensionDragState.segmentIndex] = Math.round(nextOffset * 100) / 100;
    annotationsActions.updateAnnotation(item.id, {
      style: { ...(item.style ?? {}), controlOffsets: offsets }
    });
  }

  function handleTensionPointerUp(): void {
    stopTensionDragging();
  }

  function handleAnchorPointerDown(
    event: PointerEvent,
    item: Annotation,
    pointIndex: number
  ): void {
    event.preventDefault();
    event.stopPropagation();
    const points = getEditablePoints(item);
    if (!points[pointIndex]) return;
    anchorDragState = {
      id: item.id,
      pointIndex,
      startPoints: points.map((point) => ({ x: point.x, y: point.y })),
      startPosition: { x: item.position.x, y: item.position.y },
      startClientX: event.clientX,
      startClientY: event.clientY
    };
    window.addEventListener(EVENT.POINTERMOVE, handleAnchorPointerMove);
    window.addEventListener(EVENT.POINTERUP, handleAnchorPointerUp);
  }

  function handleAnchorPointerMove(event: PointerEvent): void {
    if (!anchorDragState) return;
    const item = annotationsState.items.find(
      (i) => i.id === anchorDragState!.id
    );
    if (!item) return;
    const scale = Math.max(pageScale, 0.0001);
    const dx = (event.clientX - anchorDragState.startClientX) / scale;
    const dy = (event.clientY - anchorDragState.startClientY) / scale;
    const newPoints = anchorDragState.startPoints.map((point, index) =>
      index === anchorDragState!.pointIndex
        ? { x: point.x + dx, y: point.y + dy }
        : { x: point.x, y: point.y }
    );
    if (isVectorShapeItem(item)) {
      const normalized = normalizeToOrigin(newPoints);
      const nextPosition = {
        x: anchorDragState.startPosition.x + normalized.minX,
        y: anchorDragState.startPosition.y + normalized.minY
      };
      annotationsActions.updateAnnotation(item.id, {
        position: nextPosition,
        style: { ...(item.style ?? {}), points: normalized.points }
      });
      refreshMapAnchorIfPresent(item, nextPosition);
      return;
    }
    applyEditablePoints(item, newPoints);
  }

  function handleAnchorPointerUp(): void {
    stopAnchorDragging();
  }

  function handleAnchorDoubleClick(
    event: MouseEvent,
    item: Annotation,
    pointIndex: number
  ): void {
    event.preventDefault();
    event.stopPropagation();
    const points = getEditablePoints(item);
    const isClosed = item.style?.drawingType === DrawingType.ZONE;
    const minPoints = isClosed ? 3 : 2;
    if (points.length <= minPoints) return;
    const newPoints = points.filter((_, index) => index !== pointIndex);
    if (isVectorShapeItem(item)) {
      const newOffsets = removeControlOffsetForPoint(
        item.style?.controlOffsets,
        pointIndex,
        points.length - 1
      );
      applyEditablePoints(item, newPoints, newOffsets);
      return;
    }
    applyEditablePoints(item, newPoints);
  }

  function distanceToSegmentSq(
    point: { x: number; y: number },
    segStart: { x: number; y: number },
    segEnd: { x: number; y: number }
  ): { distSq: number; closest: { x: number; y: number }; t: number } {
    const dx = segEnd.x - segStart.x;
    const dy = segEnd.y - segStart.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq < 0.0001) {
      const ddx = point.x - segStart.x;
      const ddy = point.y - segStart.y;
      return {
        distSq: ddx * ddx + ddy * ddy,
        closest: { x: segStart.x, y: segStart.y },
        t: 0
      };
    }
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSq
      )
    );
    const closest = { x: segStart.x + t * dx, y: segStart.y + t * dy };
    const ddx = point.x - closest.x;
    const ddy = point.y - closest.y;
    return { distSq: ddx * ddx + ddy * ddy, closest, t };
  }

  function handleDrawingPathDoubleClick(
    event: MouseEvent,
    item: Annotation
  ): void {
    event.preventDefault();
    event.stopPropagation();
    const points = getEditablePoints(item);
    if (points.length < 2) return;
    const svgEl = event.currentTarget as SVGGraphicsElement;
    const ownerSvg =
      svgEl.ownerSVGElement ?? (svgEl as unknown as SVGSVGElement);
    const screenCtm = svgEl.getScreenCTM();
    if (!screenCtm) return;
    const inverseCtm = screenCtm.inverse();
    const svgPoint = ownerSvg.createSVGPoint();
    svgPoint.x = event.clientX;
    svgPoint.y = event.clientY;
    const local = svgPoint.matrixTransform(inverseCtm);
    const isClosed = item.style?.drawingType === DrawingType.ZONE;
    const segmentCount = isClosed ? points.length : points.length - 1;
    let bestIndex = 0;
    let bestDistSq = Number.POSITIVE_INFINITY;
    let bestClosest = { x: local.x, y: local.y };
    for (let index = 0; index < segmentCount; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      const { distSq, closest } = distanceToSegmentSq(
        { x: local.x, y: local.y },
        start,
        end
      );
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestIndex = index;
        bestClosest = closest;
      }
    }
    const newPoints = [
      ...points.slice(0, bestIndex + 1),
      { x: bestClosest.x, y: bestClosest.y },
      ...points.slice(bestIndex + 1)
    ];
    if (isVectorShapeItem(item)) {
      const newOffsets = insertControlOffsetAt(
        item.style?.controlOffsets,
        bestIndex,
        points.length - 1
      );
      applyEditablePoints(item, newPoints, newOffsets);
      return;
    }
    annotationsActions.updateAnnotation(item.id, { content: newPoints });
  }

  function handlePointerUp(): void {
    if (dragState?.didDrag) {
      suppressNextAnnotationClick(dragState.id);
    }

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
    const pointerDistance = Math.hypot(
      event.clientX - dragState.startClientX,
      event.clientY - dragState.startClientY
    );

    if (!dragState.didDrag && pointerDistance >= ANNOTATION_DRAG_THRESHOLD_PX) {
      dragState.didDrag = true;
    }

    const minX =
      dragState.scope === 'page' && dragState.role ? pageMargins.left : 0;
    const minY =
      dragState.scope === 'page' && dragState.role ? pageMargins.top : 0;
    const maxX =
      dragState.scope === 'page' && dragState.role
        ? Math.max(
            minX,
            formatState.width - pageMargins.right - dragState.width
          )
        : Math.max(0, rect.width / scale - dragState.width);
    const maxY =
      dragState.scope === 'page' && dragState.role
        ? Math.max(
            minY,
            formatState.height - pageMargins.bottom - dragState.height
          )
        : Math.max(0, rect.height / scale - dragState.height);

    let x = (event.clientX - rect.left) / scale - dragState.offsetX;
    let y = (event.clientY - rect.top) / scale - dragState.offsetY;

    x = clamp(x, minX, maxX);
    y = clamp(y, minY, maxY);

    annotationsActions.moveAnnotation(dragState.id, { x, y });

    if (dragState.scope === 'map') {
      const draggedItem = annotationsState.items.find(
        (i) => i.id === dragState!.id
      );
      if (draggedItem) {
        writeMapAnchor(draggedItem, { x, y });
      }
    }
  }

  function handleAnnotationPointerDown(
    event: PointerEvent,
    item: Annotation
  ): void {
    if (!isAnnotationEditing) {
      return;
    }

    const scope = getAnnotationScope(item);
    const layer = getInteractionLayer(scope);
    if (!layer) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    cancelFocusedAnnotationReset();
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
      height: targetRect ? targetRect.height / scale : 0,
      startClientX: event.clientX,
      startClientY: event.clientY,
      didDrag: false,
      role: item.role
    };
    setAnnotationDragVisualState(true);

    window.addEventListener(EVENT.POINTERMOVE, handlePointerMove);
    window.addEventListener(EVENT.POINTERUP, handlePointerUp);
  }

  function handleAnnotationClick(event: MouseEvent, itemId: string): void {
    event.stopPropagation();

    if (suppressedClickAnnotationId === itemId) {
      clearSuppressedAnnotationClick();
      annotationsActions.selectAnnotation(itemId);
      return;
    }

    centeredAnnotationId = itemId;
    cancelFocusedAnnotationReset();

    const currentTarget = event.currentTarget;
    if (currentTarget instanceof HTMLElement) {
      currentTarget.focus({ preventScroll: true });
    }

    void tick().then(() => {
      centerAnnotationInViewport(currentTarget);
    });
    annotationsActions.selectAnnotation(itemId);
  }

  function handleAnnotationDoubleClick(
    event: MouseEvent,
    itemId: string
  ): void {
    event.stopPropagation();
    activateStylingToolFromMap(StylingTools.Annotations);
    annotationsActions.setPageElementsVisibility(true);
    annotationsActions.selectAnnotation(itemId);
  }

  function centerAnnotationInViewport(target: EventTarget | null): void {
    const targetElement = target instanceof HTMLElement ? target : null;
    const delta = getElementCenteringDelta(
      getFocusViewportElement(overlayElement),
      targetElement
    );

    if (!delta) return;

    if (Math.abs(delta.x) < 0.5 && Math.abs(delta.y) < 0.5) {
      return;
    }

    globalActions.panPageBy(delta.x, delta.y);
  }

  function handleAnnotationKeyDown(event: KeyboardEvent, itemId: string): void {
    if (event.key === KEY.DELETE || event.key === KEY.BACKSPACE) {
      event.preventDefault();
      event.stopPropagation();

      if (centeredAnnotationId === itemId) {
        cancelFocusedAnnotationReset();
        resetCenteredAnnotationPan();
      }

      annotationsActions.removeAnnotation(itemId);
      return;
    }

    if (event.key === KEY.ENTER || event.key === KEY.SPACE) {
      event.preventDefault();
      if (!isAnnotationEditing) {
        activateStylingToolFromMap(StylingTools.Annotations);
        annotationsActions.setPageElementsVisibility(true);
      }
      centeredAnnotationId = itemId;
      cancelFocusedAnnotationReset();
      void tick().then(() => {
        centerAnnotationInViewport(event.currentTarget);
      });
      annotationsActions.selectAnnotation(itemId);
    }
  }

  function resetCenteredAnnotationPan(): void {
    if (!centeredAnnotationId) {
      return;
    }

    centeredAnnotationId = null;
    globalActions.resetPagePan();
  }

  function cancelFocusedAnnotationReset(): void {
    if (!focusResetTimeoutId) {
      return;
    }

    clearTimeout(focusResetTimeoutId);
    focusResetTimeoutId = null;
  }

  function scheduleCenteredAnnotationReset(itemId: string): void {
    cancelFocusedAnnotationReset();
    focusResetTimeoutId = setTimeout(() => {
      focusResetTimeoutId = null;

      if (centeredAnnotationId !== itemId) {
        return;
      }

      if (dragState || resizeState || rotateState) {
        scheduleCenteredAnnotationReset(itemId);
        return;
      }

      resetCenteredAnnotationPan();
    }, FOCUS_RESET_DEBOUNCE_MS);
  }
  function handleAnnotationBlur(_event: FocusEvent, itemId: string): void {
    if (centeredAnnotationId !== itemId) {
      return;
    }

    scheduleCenteredAnnotationReset(itemId);
  }

  function handleResizePointerDown(
    event: PointerEvent,
    item: Annotation,
    handle: string
  ): void {
    event.preventDefault();
    event.stopPropagation();
    cancelFocusedAnnotationReset();

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

    refreshMapAnchorIfPresent(item, {
      x: resizedBounds.x,
      y: resizedBounds.y
    });
  }

  function handleRotatePointerDown(
    event: PointerEvent,
    item: Annotation
  ): void {
    event.preventDefault();
    event.stopPropagation();
    cancelFocusedAnnotationReset();

    const scope = getAnnotationScope(item);
    const layer = getInteractionLayer(scope);
    if (!layer) return;

    const scale = getPageScale();
    const rect = layer.getBoundingClientRect();
    const shapeType = String(item.content ?? '');
    const defaultSize = getShapeDefaultSize(shapeType);
    const shapeW = item.style?.shapeWidth ?? defaultSize.width;
    const shapeH = item.style?.shapeHeight ?? defaultSize.height;

    const renderedPosition = getRenderedPosition(item);
    const localPosition =
      scope === 'page'
        ? renderedPosition
        : {
            x: renderedPosition.x - pageMargins.left,
            y: renderedPosition.y - pageMargins.top
          };
    const centerX = rect.left + (localPosition.x + shapeW / 2) * scale;
    const centerY = rect.top + (localPosition.y + shapeH / 2) * scale;

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

  function getPageCapturePoint(
    event:
      | Pick<MouseEvent, 'clientX' | 'clientY'>
      | Pick<PointerEvent, 'clientX' | 'clientY'>
  ): { x: number; y: number } | null {
    if (!overlayElement) return null;
    const scale = getPageScale();
    const rect = overlayElement.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale
    };
  }

  function resetDrawingPointerState(): void {
    drawingPointerId = null;
    drawingCloseToStart = false;
  }

  function resetPlacementPointerState(): void {
    placementDragState = null;
  }

  function shouldLockShapeAspectRatio(
    shapeType: string,
    shiftKey: boolean
  ): boolean {
    return shapeType === SHAPE_TYPE.RECTANGLE
      ? shiftKey
      : isShapeAspectRatioLocked(shapeType);
  }

  function snapLineEndpoint(
    startPoint: { x: number; y: number },
    currentPoint: { x: number; y: number }
  ): { x: number; y: number } {
    const dx = currentPoint.x - startPoint.x;
    const dy = currentPoint.y - startPoint.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const step = Math.PI / 4;
    const angle = Math.atan2(dy, dx);
    const snappedAngle = Math.round(angle / step) * step;

    return {
      x: startPoint.x + Math.cos(snappedAngle) * distance,
      y: startPoint.y + Math.sin(snappedAngle) * distance
    };
  }

  function buildShapePlacementPreview(
    startPoint: { x: number; y: number },
    currentPoint: { x: number; y: number },
    shiftKey: boolean
  ): AnnotationPlacementPreview {
    const shapeType = String(
      annotationsState.pendingContent ?? SHAPE_TYPE.RECTANGLE
    );

    if (shapeType === SHAPE_TYPE.LINE || shapeType === SHAPE_TYPE.ARROW) {
      const resolvedEnd = shiftKey
        ? snapLineEndpoint(startPoint, currentPoint)
        : currentPoint;
      return createVectorLinePlacementPreview(startPoint, resolvedEnd);
    }

    const lockAspectRatio = shouldLockShapeAspectRatio(shapeType, shiftKey);
    let width = Math.max(
      MIN_SHAPE_SIZE,
      Math.abs(currentPoint.x - startPoint.x)
    );
    let height = Math.max(
      MIN_SHAPE_SIZE,
      Math.abs(currentPoint.y - startPoint.y)
    );

    if (lockAspectRatio) {
      const size = Math.max(width, height);
      width = size;
      height = size;
    }

    const position = clampPreviewPosition(
      {
        x: currentPoint.x >= startPoint.x ? startPoint.x : startPoint.x - width,
        y: currentPoint.y >= startPoint.y ? startPoint.y : startPoint.y - height
      },
      { width, height }
    );

    return {
      coordinateSpace: 'page',
      type: AnnotationKind.SHAPE,
      position,
      size: { width, height },
      content: shapeType
    };
  }

  function handlePlacementPointerDown(event: PointerEvent): void {
    if (!isPlacementMode || !pendingType) {
      return;
    }

    const point = getPageCapturePoint(event);
    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (pendingType !== AnnotationKind.SHAPE) {
      const preview = createCenteredPlacementPreview(pendingType, point);
      annotationsActions.updatePlacement(preview);
      annotationsActions.commitPlacement(preview);
      return;
    }

    placementDragState = {
      pointerId: event.pointerId,
      startPoint: point,
      currentPoint: point,
      didDrag: false
    };
    annotationsActions.updatePlacement(
      createCenteredPlacementPreview(AnnotationKind.SHAPE, point)
    );

    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handlePlacementPointerMove(event: PointerEvent): void {
    if (!isPlacementMode || !pendingType) {
      return;
    }

    const point = getPageCapturePoint(event);
    if (!point) {
      return;
    }

    if (pendingType !== AnnotationKind.SHAPE) {
      annotationsActions.updatePlacement(
        createCenteredPlacementPreview(pendingType, point)
      );
      return;
    }

    if (placementDragState?.pointerId !== event.pointerId) {
      annotationsActions.updatePlacement(
        createCenteredPlacementPreview(AnnotationKind.SHAPE, point)
      );
      return;
    }

    event.preventDefault();

    const didDrag =
      getDistance(placementDragState.startPoint, point) >=
      SHAPE_PLACEMENT_DRAG_THRESHOLD_PX / getPageScale();

    placementDragState = {
      ...placementDragState,
      currentPoint: point,
      didDrag
    };

    annotationsActions.updatePlacement(
      didDrag
        ? buildShapePlacementPreview(
            placementDragState.startPoint,
            point,
            event.shiftKey
          )
        : createCenteredPlacementPreview(AnnotationKind.SHAPE, point)
    );
  }

  function handlePlacementPointerUp(event: PointerEvent): void {
    if (
      !isPlacementMode ||
      pendingType !== AnnotationKind.SHAPE ||
      placementDragState?.pointerId !== event.pointerId
    ) {
      return;
    }

    const point = getPageCapturePoint(event) ?? placementDragState.currentPoint;
    const preview = placementDragState.didDrag
      ? buildShapePlacementPreview(
          placementDragState.startPoint,
          point,
          event.shiftKey
        )
      : createCenteredPlacementPreview(AnnotationKind.SHAPE, point);

    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    annotationsActions.updatePlacement(preview);
    annotationsActions.commitPlacement(preview);
    resetPlacementPointerState();
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

    const point = getPageCapturePoint(event);
    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const nextPoints = appendDrawingSample(drawingPoints, point);
    annotationsActions.updateDrawing(nextPoints);
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

    const point = getPageCapturePoint(event);
    if (!point) {
      return;
    }

    event.preventDefault();

    const nextPoints = appendDrawingSample(drawingPoints, point);
    if (nextPoints !== drawingPoints) {
      annotationsActions.updateDrawing(nextPoints);
    }

    drawingCloseToStart = isNearDrawingStart(point);
  }

  function handleDrawingPointerUp(event: PointerEvent): void {
    if (drawingPointerId !== event.pointerId) {
      return;
    }

    const point = getPageCapturePoint(event);
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
      annotationsActions.updateDrawing(nextPoints);
      if (finalPointCount >= minimumPointCount) {
        annotationsActions.finishDrawing();
      }
      resetDrawingPointerState();
      return;
    }

    annotationsActions.updateDrawing(zoneAutoClosedPoints);

    if (shouldAutoCloseZone && finalPointCount >= minimumPointCount) {
      annotationsActions.finishDrawing();
    }

    resetDrawingPointerState();
  }

  function handleCapturePointerDown(event: PointerEvent): void {
    handlePlacementPointerDown(event);
    handleDrawingPointerDown(event);
  }

  function handleCapturePointerMove(event: PointerEvent): void {
    handlePlacementPointerMove(event);
    handleDrawingPointerMove(event);
  }

  function handleCapturePointerUp(event: PointerEvent): void {
    handlePlacementPointerUp(event);
    handleDrawingPointerUp(event);
  }

  $effect(() => {
    if (!isCreationActive) {
      resetPlacementPointerState();
      resetDrawingPointerState();
      return;
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isDrawingMode) {
          annotationsActions.cancelDrawing();
        } else {
          annotationsActions.cancelPlacement();
        }
      }

      if (
        e.key === KEY.ENTER &&
        isDrawingMode &&
        drawingPoints.length >=
          getMinimumDrawingPoints(annotationsState.drawingModeType)
      ) {
        e.preventDefault();
        annotationsActions.finishDrawing();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  $effect(() => {
    if (!centeredAnnotationId) {
      return;
    }

    if (!isAnnotationEditing || selectedId !== centeredAnnotationId) {
      resetCenteredAnnotationPan();
    }
  });

  onDestroy(() => {
    centeredAnnotationId = null;
    cancelFocusedAnnotationReset();
    clearSuppressedAnnotationClick();
    stopDragging();
    stopResizing();
    stopRotating();
    stopAnchorDragging();
    stopTensionDragging();
    resetPlacementPointerState();
    resetDrawingPointerState();
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

  function getTextStyleFromStyle(style: AnnotationStyle | undefined): string {
    const resolvedStyle = style ?? {};
    const styles: string[] = [];

    if (resolvedStyle.font) {
      styles.push(`font-family: ${resolveFontFamilyStack(resolvedStyle.font)}`);
    }
    if (resolvedStyle.fontSize) {
      styles.push(`font-size: ${clampFontSize(resolvedStyle.fontSize, 8)}px`);
    }
    if (resolvedStyle.bold) {
      styles.push('font-weight: bold');
    }
    if (resolvedStyle.italic) {
      styles.push('font-style: italic');
    }
    if (resolvedStyle.underlined) {
      styles.push('text-decoration: underline');
    }
    if (resolvedStyle.textAlign) {
      styles.push(`text-align: ${resolvedStyle.textAlign}`);
    }
    styles.push(`opacity: ${toOpacityUnit(resolvedStyle.opacity)}`);

    const color = getColorValue(resolvedStyle.color, '#000000');
    styles.push(`color: ${color}`);

    if (resolvedStyle.backgroundColor) {
      const bgColor = getColorValue(resolvedStyle.backgroundColor, '#ffffff');
      const bgOpacity =
        resolvedStyle.backgroundOpacity !== undefined
          ? Math.max(0, Math.min(100, resolvedStyle.backgroundOpacity)) / 100
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

  function getTextStyle(item: Annotation): string {
    return getTextStyleFromStyle(item.style);
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

  function getGuideVectorStyle(style: AnnotationStyle | null | undefined): {
    stroke: string;
    strokeWidth: number;
    strokeDasharray: string;
  } {
    const resolvedStyle = style ?? {};

    return {
      stroke: 'rgba(82, 82, 82, 0.9)',
      strokeWidth: Math.max((resolvedStyle.strokeWidth ?? 2) + 1, 3),
      strokeDasharray: '6,4'
    };
  }

  function buildPlacementPreviewAnnotation(
    preview: AnnotationPlacementPreview
  ): Annotation {
    return {
      id: 'annotation-preview',
      type: preview.type,
      content: preview.content ?? annotationsState.pendingContent,
      position: preview.position,
      coordinateSpace: 'page',
      positionMode: 'manual',
      style: {
        ...(annotationsState.pendingStyle ?? annotationsState.defaultStyle),
        ...(preview.style ?? {}),
        ...(preview.type === AnnotationKind.SHAPE
          ? {
              shapeWidth: preview.size.width,
              shapeHeight: preview.size.height
            }
          : {})
      }
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
  ></div>

  {#if isCreationActive}
    <div
      class="annotation-capture-layer"
      class:drawing-capture={isDrawingMode}
      class:placement-capture={isPlacementMode}
      role="presentation"
      data-workspace-pan-ignore="true"
      onpointerdown={handleCapturePointerDown}
      onpointermove={handleCapturePointerMove}
      onpointerup={handleCapturePointerUp}
      onpointercancel={handleCapturePointerUp}
    >
      {#if isPlacementMode && pendingPreview}
        {@const previewItem = buildPlacementPreviewAnnotation(pendingPreview)}
        {@const previewStyle = getVectorStyle(previewItem.style)}
        {@const guideStyle = getGuideVectorStyle(previewItem.style)}
        {@const previewRotation = previewItem.style?.rotation ?? 0}
        <div
          class="placement-preview"
          data-placement-type={pendingPreview.type}
          style={getScaledPreviewStyle(
            pendingPreview.position,
            pendingPreview.size
          )}
        >
          {#if pendingPreview.type === AnnotationKind.TEXT}
            <div
              class="annotation-text annotation-preview-text"
              style={getTextStyle(previewItem)}
            >
              {String(previewItem.content ?? '')}
            </div>
          {:else if pendingPreview.type === AnnotationKind.IMAGE}
            {@const imgSrc = String(previewItem.content ?? '')}
            {#if imgSrc}
              <img
                src={imgSrc}
                alt={m.annotationImageAlt()}
                class="annotation-image annotation-preview-image"
                style={`width: ${pendingPreview.size.width}px; height: ${pendingPreview.size.height}px; opacity: ${toOpacityUnit(previewItem.style?.opacity)};`}
              />
            {/if}
          {:else if pendingPreview.type === AnnotationKind.SHAPE}
            {#if isVectorShapeContent(previewItem.content) && (previewItem.style?.points?.length ?? 0) >= 2}
              {@const previewVectorPoints = previewItem.style?.points ?? []}
              {@const previewVectorOffsets = previewItem.style?.controlOffsets}
              {@const previewIsArrow = hasArrowHead(previewItem.content)}
              {@const previewVectorBounds = computeVectorPathBounds(
                previewVectorPoints,
                previewVectorOffsets,
                previewStyle.strokeWidth,
                previewIsArrow
              )}
              {@const previewVectorPath = buildVectorLinePath(
                previewVectorPoints,
                previewVectorOffsets
              )}
              {@const previewArrowHead = previewIsArrow
                ? getArrowHeadGeometry(
                    previewVectorPoints,
                    previewVectorOffsets,
                    previewStyle.strokeWidth
                  )
                : null}
              <svg
                width={previewVectorBounds.width}
                height={previewVectorBounds.height}
                viewBox={previewVectorBounds.viewBox}
                class="annotation-shape annotation-vector annotation-preview-shape"
                style={`opacity: ${previewStyle.opacity};`}
              >
                <path
                  d={previewVectorPath}
                  fill="none"
                  stroke={guideStyle.stroke}
                  stroke-width={guideStyle.strokeWidth}
                  stroke-dasharray={guideStyle.strokeDasharray}
                  stroke-linejoin="round"
                  stroke-linecap="round"
                />
                <path
                  d={previewVectorPath}
                  fill="none"
                  stroke={previewStyle.stroke}
                  stroke-width={previewStyle.strokeWidth}
                  stroke-dasharray={previewStyle.strokeDasharray}
                  stroke-linejoin="round"
                  stroke-linecap="round"
                />
                {#if previewArrowHead}
                  <path
                    d={previewArrowHead.path}
                    fill={previewStyle.stroke}
                    stroke={previewStyle.stroke}
                    stroke-width={previewStyle.strokeWidth}
                    stroke-linejoin="round"
                    stroke-linecap="round"
                  />
                {/if}
              </svg>
            {:else}
              {@const previewShapeType = String(
                previewItem.content ?? SHAPE_TYPE.CIRCLE
              )}
              {@const previewShapeData = renderShape(
                previewItem,
                previewShapeType
              )}
              <div
                class="shape-content"
                style={`width: ${pendingPreview.size.width}px; height: ${pendingPreview.size.height}px; transform: rotate(${previewRotation}deg);`}
              >
                <svg
                  width={pendingPreview.size.width}
                  height={pendingPreview.size.height}
                  viewBox={getShapeViewBox(previewShapeType)}
                  preserveAspectRatio={previewShapeType === SHAPE_TYPE.ARROW
                    ? 'xMidYMid meet'
                    : 'none'}
                  class="annotation-shape annotation-preview-shape"
                  style={`opacity: ${previewStyle.opacity};`}
                >
                  {#if previewShapeData.type === SHAPE_TYPE.CIRCLE}
                    <circle
                      cx={previewShapeData.cx}
                      cy={previewShapeData.cy}
                      r={previewShapeData.r}
                      fill="none"
                      stroke={guideStyle.stroke}
                      stroke-width={guideStyle.strokeWidth}
                      stroke-dasharray={guideStyle.strokeDasharray}
                      vector-effect="non-scaling-stroke"
                    />
                    <circle
                      cx={previewShapeData.cx}
                      cy={previewShapeData.cy}
                      r={previewShapeData.r}
                      fill={previewStyle.fill}
                      stroke={previewStyle.stroke}
                      stroke-width={previewStyle.strokeWidth}
                      stroke-dasharray={previewStyle.strokeDasharray}
                      vector-effect="non-scaling-stroke"
                    />
                  {:else}
                    <path
                      d={previewShapeData.path}
                      fill="none"
                      stroke={guideStyle.stroke}
                      stroke-width={guideStyle.strokeWidth}
                      stroke-dasharray={guideStyle.strokeDasharray}
                      stroke-linejoin="round"
                      stroke-linecap="round"
                      vector-effect="non-scaling-stroke"
                    />
                    <path
                      d={previewShapeData.path}
                      fill={previewShapeData.type === SHAPE_TYPE.ARROW
                        ? previewStyle.stroke
                        : previewStyle.fill}
                      stroke={previewStyle.stroke}
                      stroke-width={previewStyle.strokeWidth}
                      stroke-dasharray={previewStyle.strokeDasharray}
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      vector-effect="non-scaling-stroke"
                    />
                  {/if}
                </svg>
              </div>
            {/if}
          {/if}
        </div>
      {/if}

      {#if isDrawingMode}
        {@const previewSmoothness =
          annotationsState.pendingStyle?.smoothness ??
          annotationsState.defaultStyle.smoothness ??
          0}
        {@const previewIsClosed =
          annotationsState.drawingModeType === DrawingType.ZONE}
        {@const previewBounds = computeDrawingBounds(
          drawingPreviewPoints,
          currentDrawingStyle.strokeWidth,
          previewSmoothness,
          previewIsClosed
        )}
        {@const guideStyle = getGuideVectorStyle(annotationsState.pendingStyle)}
        {#if drawingPoints.length > 0}
          <svg
            class="drawing-preview"
            width={previewBounds.width}
            height={previewBounds.height}
            viewBox={previewBounds.viewBox}
            style={getScaledDrawingPreviewStyle(previewBounds)}
          >
            {#if drawingPreviewPoints.length >= 2}
              {@const previewPath = smoothDrawingPath(
                drawingPreviewPoints,
                previewSmoothness,
                previewIsClosed
              )}
              <path
                d={previewPath}
                fill="none"
                stroke={guideStyle.stroke}
                stroke-width={guideStyle.strokeWidth}
                stroke-dasharray={guideStyle.strokeDasharray}
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              <path
                d={previewPath}
                fill={previewIsClosed ? currentDrawingStyle.fill : 'none'}
                stroke={currentDrawingStyle.stroke}
                stroke-width={currentDrawingStyle.strokeWidth}
                stroke-dasharray={currentDrawingStyle.strokeDasharray}
                stroke-linejoin="round"
                stroke-linecap="round"
                opacity={currentDrawingStyle.opacity}
              />
            {/if}
            {#if previewIsClosed}
              {#each drawingPoints as point, i (i)}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={i === 0 ? 5 : 4}
                  fill="white"
                  stroke={currentDrawingStyle.stroke}
                  stroke-width="2"
                />
              {/each}
            {/if}
            {#if previewIsClosed && drawingPoints.length >= 3}
              {@const startPoint = drawingPoints[0]}
              <circle
                class:drawing-close-target-active={drawingCloseToStart}
                cx={startPoint.x}
                cy={startPoint.y}
                r={drawingCloseToStart ? 15 : 11}
                fill="none"
                stroke={drawingCloseToStart
                  ? 'var(--cds-interactive-01, #0f62fe)'
                  : 'rgba(82, 82, 82, 0.85)'}
                stroke-width="2"
                stroke-dasharray="6,4"
              />
            {/if}
          </svg>
        {/if}
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
        handleAnnotationDoubleClick(event, item.id)}
      onblur={(event: FocusEvent) => handleAnnotationBlur(event, item.id)}
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
        {#if isVectorShapeItem(item)}
          {@const vectorPoints = getVectorPoints(item)}
          {@const vectorOffsets = item.style?.controlOffsets}
          {@const vectorStyle = getVectorStyle(item.style)}
          {@const isArrow = hasArrowHead(item.content)}
          {@const vectorBounds = computeVectorPathBounds(
            vectorPoints,
            vectorOffsets,
            vectorStyle.strokeWidth,
            isArrow
          )}
          {@const vectorPath = buildVectorLinePath(vectorPoints, vectorOffsets)}
          {@const arrowHeadGeometry = isArrow
            ? getArrowHeadGeometry(
                vectorPoints,
                vectorOffsets,
                vectorStyle.strokeWidth
              )
            : null}
          {@const isVectorSelected =
            isAnnotationEditing && selectedId === item.id}
          <svg
            width={vectorBounds.width}
            height={vectorBounds.height}
            viewBox={vectorBounds.viewBox}
            class="annotation-shape annotation-vector"
            class:annotation-vector--editable={isVectorSelected}
            style="opacity: {vectorStyle.opacity};"
          >
            <path
              d={vectorPath}
              fill="none"
              stroke={vectorStyle.stroke}
              stroke-width={vectorStyle.strokeWidth}
              stroke-dasharray={vectorStyle.strokeDasharray}
              stroke-linejoin="round"
              stroke-linecap="round"
            />
            {#if arrowHeadGeometry}
              <path
                d={arrowHeadGeometry.path}
                fill={vectorStyle.stroke}
                stroke={vectorStyle.stroke}
                stroke-width={vectorStyle.strokeWidth}
                stroke-linejoin="round"
                stroke-linecap="round"
              />
            {/if}
            {#if isVectorSelected}
              <path
                class="drawing-hit-path"
                role="button"
                aria-label={m.annotations_drawing_add_anchor()}
                tabindex="-1"
                d={vectorPath}
                fill="none"
                stroke="transparent"
                stroke-width={Math.max(vectorStyle.strokeWidth + 10, 14)}
                ondblclick={(event: MouseEvent) =>
                  handleDrawingPathDoubleClick(event, item)}
              />
              {#each vectorPoints.slice(0, -1) as _segment, segmentIndex (segmentIndex)}
                {@const tensionHandle = getSegmentTensionHandle(
                  vectorPoints[segmentIndex],
                  vectorPoints[segmentIndex + 1],
                  vectorOffsets?.[segmentIndex] ?? 0
                )}
                <circle
                  class="tension-handle"
                  role="button"
                  aria-label={m.annotations_curve_handle()}
                  tabindex="-1"
                  cx={tensionHandle.x}
                  cy={tensionHandle.y}
                  r="4"
                  onpointerdown={(event: PointerEvent) =>
                    handleTensionPointerDown(event, item, segmentIndex)}
                />
              {/each}
              {#each vectorPoints as point, pointIndex (pointIndex)}
                <circle
                  class="drawing-anchor"
                  role="button"
                  aria-label={m.annotations_drawing_edit_anchor()}
                  tabindex="-1"
                  cx={point.x}
                  cy={point.y}
                  r="5"
                  fill="white"
                  stroke="var(--cds-interactive-01, #0f62fe)"
                  stroke-width="2"
                  onpointerdown={(event: PointerEvent) =>
                    handleAnchorPointerDown(event, item, pointIndex)}
                  ondblclick={(event: MouseEvent) =>
                    handleAnchorDoubleClick(event, item, pointIndex)}
                />
              {/each}
            {/if}
          </svg>
        {:else}
          {@const shapeType = String(item.content ?? SHAPE_TYPE.CIRCLE)}
          {@const shapeData = renderShape(item, shapeType)}
          {@const shapeStyle = getVectorStyle(item.style)}
          {@const defaultSize = getShapeDefaultSize(shapeType)}
          {@const shapeW = item.style?.shapeWidth ?? defaultSize.width}
          {@const shapeH = item.style?.shapeHeight ?? defaultSize.height}
          {@const rotation = item.style?.rotation ?? 0}
          {@const isShapeSelected =
            isAnnotationEditing && selectedId === item.id}
          <div
            class="shape-frame"
            class:shape-selected={isShapeSelected}
            style="width: {shapeW}px; height: {shapeH}px;"
          >
            <div
              class="shape-content"
              style="transform: rotate({rotation}deg);"
            >
              <svg
                width={shapeW}
                height={shapeH}
                viewBox={getShapeViewBox(shapeType)}
                preserveAspectRatio={shapeType === SHAPE_TYPE.ARROW
                  ? 'xMidYMid meet'
                  : 'none'}
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
                    vector-effect="non-scaling-stroke"
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
                    vector-effect="non-scaling-stroke"
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
        {/if}
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
          {@const isDrawingSelected =
            isAnnotationEditing && selectedId === item.id}
          <svg
            width={drawingBounds.width}
            height={drawingBounds.height}
            viewBox={drawingBounds.viewBox}
            class="annotation-drawing"
            class:annotation-drawing--editable={isDrawingSelected}
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
            {#if isDrawingSelected}
              <path
                class="drawing-hit-path"
                role="button"
                aria-label={m.annotations_drawing_add_anchor()}
                tabindex="-1"
                d={smoothDrawingPath(points, smoothness, isClosed)}
                fill="transparent"
                stroke="transparent"
                stroke-width={Math.max(drawingStyle.strokeWidth + 10, 14)}
                ondblclick={(event: MouseEvent) =>
                  handleDrawingPathDoubleClick(event, item)}
              />
              {#each points as point, pointIndex (pointIndex)}
                <circle
                  class="drawing-anchor"
                  role="button"
                  aria-label={m.annotations_drawing_edit_anchor()}
                  tabindex="-1"
                  cx={point.x}
                  cy={point.y}
                  r="5"
                  fill="white"
                  stroke="var(--cds-interactive-01, #0f62fe)"
                  stroke-width="2"
                  onpointerdown={(event: PointerEvent) =>
                    handleAnchorPointerDown(event, item, pointIndex)}
                  ondblclick={(event: MouseEvent) =>
                    handleAnchorDoubleClick(event, item, pointIndex)}
                />
              {/each}
            {/if}
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
    z-index: 1;
  }

  .annotation-capture-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    pointer-events: auto;
    touch-action: none;
    z-index: 8;
  }

  .annotation-overlay.non-interactive .annotation-capture-layer {
    pointer-events: none;
  }

  .drawing-preview,
  .placement-preview {
    position: absolute;
    overflow: visible;
    pointer-events: none;
    transform-origin: top left;
  }

  .placement-preview {
    display: flex;
    align-items: stretch;
    justify-content: stretch;
  }

  .annotation-item {
    position: absolute;
    pointer-events: auto;
    cursor: pointer;
    touch-action: none;
    outline: none;
    transform-origin: top left;
    z-index: 4;
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
    outline: 1px dashed var(--cds-border-strong-02, #6f6f6f);
    outline-offset: 0;
  }

  .annotation-item:hover .shape-frame {
    outline: 1px dashed var(--cds-border-strong-02, #6f6f6f);
    outline-offset: 0;
  }

  .annotation-item:focus-visible:not(:has(.shape-frame)) {
    outline: 1px dashed var(--cds-interactive-01, #0f62fe);
    outline-offset: 0;
    border-radius: 0;
  }

  .annotation-item:focus-visible .shape-frame {
    outline: 1px dashed var(--cds-interactive-01, #0f62fe);
    outline-offset: 0;
  }

  .annotation-item.selected {
    outline: 1px dashed var(--cds-interactive-01, #0f62fe);
    outline-offset: 0;
    box-shadow: none;
    border-radius: 0;
  }

  .annotation-item.dragging {
    cursor: grabbing;
  }

  .annotation-item[data-annotation-role] {
    min-height: 24px;
  }

  .annotation-item[data-annotation-role] .annotation-text {
    width: 100%;
    max-width: none;
    padding: 0;
    border-radius: 0;
    line-height: 24px;
  }

  .annotation-item[data-annotation-role='title'],
  .annotation-item[data-annotation-role='subtitle'] {
    width: max-content;
    max-width: 324px;
    min-width: 24px;
  }

  .annotation-item[data-annotation-role='source'],
  .annotation-item[data-annotation-role='basemap_source'],
  .annotation-item[data-annotation-role='signature'],
  .annotation-item[data-annotation-role='credit'],
  .annotation-item[data-annotation-role='note'] {
    width: 216px;
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

  .annotation-drawing--editable {
    overflow: visible;
  }

  .annotation-drawing .drawing-anchor {
    cursor: grab;
    pointer-events: all;
    touch-action: none;
  }

  .annotation-drawing .drawing-anchor:hover {
    fill: var(--cds-interactive-01, #0f62fe);
    stroke: var(--cds-background, #ffffff);
  }

  .annotation-drawing .drawing-hit-path {
    cursor: copy;
    pointer-events: stroke;
  }

  .annotation-vector {
    overflow: visible;
  }

  .annotation-vector .drawing-anchor,
  .annotation-vector .tension-handle {
    cursor: grab;
    pointer-events: all;
    touch-action: none;
  }

  .annotation-vector .drawing-anchor:hover {
    fill: var(--cds-interactive-01, #0f62fe);
    stroke: var(--cds-background, #ffffff);
  }

  .annotation-vector .tension-handle {
    fill: var(--cds-background, #ffffff);
    stroke: var(--cds-interactive-01, #0f62fe);
    stroke-width: 2;
    stroke-dasharray: 2 2;
  }

  .annotation-vector .tension-handle:hover {
    fill: var(--cds-interactive-01, #0f62fe);
  }

  .annotation-vector .drawing-hit-path {
    cursor: copy;
    pointer-events: stroke;
  }

  .annotation-image {
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    object-fit: contain;
  }

  .annotation-preview-text {
    width: 100%;
    max-width: none;
    min-height: 100%;
  }

  .annotation-preview-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .annotation-preview-shape {
    overflow: visible;
  }

  .shape-frame {
    position: relative;
  }

  .shape-frame.shape-selected {
    outline: 1px dashed var(--cds-interactive-01, #0072c3);
    outline-offset: 2px;
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
    opacity: 1;
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
