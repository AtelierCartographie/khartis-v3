<script lang="ts">
  import {
    DistanceUnit,
    LegendPosition,
    OrientationIndicatorStyle,
    ScaleForm
  } from '$lib/features/commons/constants/ui.constants';
  import { StylingTools } from '$lib/features/commons/types/global';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/stores/global.svelte';
  import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
  import { projectionStore } from '../stores/projection.store.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { PRINT_STANDARD_TOKENS } from '$lib/features/commons/utils/layout-sizing.utils';
  import {
    clampFontSize,
    resolveFontFamilyStack
  } from '$lib/features/step-toolbar/fonts.constants';
  import { EVENT, KEY } from '$lib/features/commons/constants/dom.constants';
  import {
    getDragBounds,
    snapPointWithinBounds
  } from '$lib/features/commons/utils/page-grid.utils';
  import {
    geoIndicationsActions,
    geoIndicationsState
  } from '$lib/features/step-toolbar/tools/geo-indications';
  import { getFormatState } from '$lib/features/step-toolbar/tools/format';
  import {
    clampScaleDistance,
    formatScaleDistance,
    getScaleDistanceLimit,
    getCurrentScaleDistanceContext,
    getScaleMetersPerPixel,
    getSuggestedScaleDistance,
    getInsetMapGeographicBounds,
    INSET_MAP_SIZE_LIMITS,
    isInsetMapAvailableForBounds,
    SCALE_MAX_WIDTH_PX,
    toDistanceMeters
  } from '$lib/features/step-toolbar/tools/geo-indications';
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import * as d3geo from 'd3-geo';
  import type { GeoPermissibleObjects, GeoProjection } from 'd3-geo';
  import type {
    Feature,
    FeatureCollection,
    GeoJsonProperties,
    MultiPolygon,
    Polygon
  } from 'geojson';
  import { activateStylingToolFromMap } from '../utils/styling-tool-activation.utils';
  import {
    getElementCenteringDelta,
    getFocusViewportElement
  } from '../utils/focus-viewport.utils';
  import { setStylingToolPopoverDragging } from '../utils/tool-popover-drag-visibility.utils';
  import { resolveStaticAssetUrl } from '$lib/features/commons/utils/static-asset-url';
  import { getLegendState } from '$lib/features/step-toolbar/tools/legend';
  import * as m from '$lib/paraglide/messages';
  import { GEOJSON_TYPE } from '$lib/features/commons/constants';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { readGeoParquetViaDuckDB } from '../services/read-geojson-arrow.service';
  import { arrowTableToGeoJSON, extractGeometryInfo } from '../io';
  import {
    getDefaultInsetStyle,
    getDefaultOrientationStyle,
    getDefaultScaleStyle
  } from '../utils/geo-indications-default-placement.utils';

  let {
    interactive = true,
    hidden = false
  }: { interactive?: boolean; hidden?: boolean } = $props();

  const MM_TO_PAGE_PX = 72 / 25.4;
  const SCALE_PADDING = 6;
  const SCALE_SEGMENT_COUNT = 4;
  const SCALE_SEGMENTS = Array.from(
    { length: SCALE_SEGMENT_COUNT },
    (_, index) => index
  );
  const INSET_MAP_DATA_PATH =
    '/basemaps/geometry/monde-countries-2024-low.parquet';
  const INSET_MAP_PADDING = 4;
  const INSET_MAP_WORLD_SPAN_EPSILON = 359.5;
  const INSET_ZOOM_BASE = 0.6;
  const INSET_ZOOM_FACTOR = 1.2;
  const INSET_ZOOM_DEFAULT = 50;
  const INSET_EXTENT_POINT_RADIUS = 4;
  const INSET_EXTENT_MIN_SIZE = 8;
  const INSET_POINT_BOUNDS_EPSILON = 0.000001;
  const INSET_WINDOW_STROKE_MIN = 1.2;
  const INSET_WINDOW_STROKE_MAX = 3;
  const INSET_LAND_STROKE_MIN = 0.35;
  const INSET_LAND_STROKE_MAX = 0.8;
  const ORIENTATION_MIN_SIZE_PX = 14;
  const ORIENTATION_MAX_SIZE_PX = 84;

  type WorldFeatureCollection = FeatureCollection<
    Polygon | MultiPolygon,
    GeoJsonProperties
  >;
  type InsetViewportFeature = Feature<
    Polygon | MultiPolygon,
    GeoJsonProperties
  >;
  type MapBounds = {
    north: number;
    south: number;
    east: number;
    west: number;
    longitudeSpan: number;
  };
  type InsetDimensions = { width: number; height: number };
  type InsetViewportPoint = { x: number; y: number; radius: number };
  type InsetRenderState = {
    spherePath: string;
    graticulePath: string;
    landPaths: string[];
    viewportPath: string | null;
    viewportPoint: InsetViewportPoint | null;
    landStrokeWidth: number;
    windowStrokeWidth: number;
  };

  const WORLD_SPHERE: GeoPermissibleObjects = { type: 'Sphere' };
  const INSET_GRATICULE = d3geo.geoGraticule().step([20, 20])();
  const EMPTY_GEOJSON_PROPERTIES: GeoJsonProperties = {};
  const componentId = $props.id();
  const insetClipId = `inset-geo-${componentId}`;

  let worldFeatures = $state<WorldFeatureCollection | null>(null);
  let mapViewRevision = $state(0);

  onMount(() => {
    let cancelled = false;

    const loadWorldFeatures = async (): Promise<void> => {
      try {
        await duckDBOrchestrator.waitForInitialization();
        const response = await fetch(
          resolveStaticAssetUrl(INSET_MAP_DATA_PATH)
        );
        if (!response.ok) {
          return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const arrowTable = await readGeoParquetViaDuckDB(
          arrayBuffer,
          'inset_world_countries'
        );
        const geoInfo = extractGeometryInfo(arrowTable);
        if (!geoInfo) {
          return;
        }
        const geojson = arrowTableToGeoJSON(arrowTable, geoInfo.geoColumn);
        if (!cancelled && geojson) {
          worldFeatures = toWorldFeatureCollection(geojson);
        }
      } catch (error) {
        if (!cancelled) {
          logger.error(
            'Failed to load inset world basemap',
            LogCategory.MAP,
            error
          );
          worldFeatures = null;
        }
      }
    };

    void loadWorldFeatures();

    return () => {
      cancelled = true;
    };
  });

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

  const scaleColor = $derived(
    hslToHex(
      geoIndicationsState.scale.color.hue,
      geoIndicationsState.scale.color.saturation,
      geoIndicationsState.scale.color.lightness
    )
  );
  const scaleFontFamily = $derived(
    resolveFontFamilyStack(geoIndicationsState.scale.fontFamily)
  );
  const scaleFontSize = $derived(
    clampFontSize(
      geoIndicationsState.scale.fontSize,
      PRINT_STANDARD_TOKENS.geoIndications.scaleFontSize
    )
  );
  const orientationFontFamily = $derived(scaleFontFamily);

  const orientationColor = $derived(
    hslToHex(
      geoIndicationsState.orientation.color.hue,
      geoIndicationsState.orientation.color.saturation,
      geoIndicationsState.orientation.color.lightness
    )
  );
  const formatState = $derived(getFormatState());
  const legendState = $derived(getLegendState());

  function toFiniteNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return fallback;
  }

  function toWorldFeatureCollection(
    payload: unknown
  ): WorldFeatureCollection | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const maybeCollection = payload as {
      type?: unknown;
      features?: unknown;
    };

    if (
      maybeCollection.type !== GEOJSON_TYPE.FEATURE_COLLECTION ||
      !Array.isArray(maybeCollection.features)
    ) {
      return null;
    }

    return payload as WorldFeatureCollection;
  }

  function normalizeLongitude(longitude: number): number {
    const normalized = ((((longitude + 180) % 360) + 360) % 360) - 180;
    return normalized === -180 && longitude > 0 ? 180 : normalized;
  }

  function getCurrentMapBounds(): MapBounds | null {
    const mapBounds = mapInstanceStore.getMapBounds();
    const bounds = getInsetMapGeographicBounds(mapBounds, {
      isProjectedCoordinates: projectionStore.isProjectedCoordinates,
      projection: projectionStore.renderProjection
    });
    if (!bounds) {
      return null;
    }

    const rawNorth = toFiniteNumber(bounds.north, 90);
    const rawSouth = toFiniteNumber(bounds.south, -90);
    const north = clamp(rawNorth, -90, 90);
    const south = clamp(rawSouth, -90, 90);
    const rawEast = toFiniteNumber(bounds.east, 180);
    const rawWest = toFiniteNumber(bounds.west, -180);

    if (north <= south) {
      const centerLatitude = clamp((rawNorth + rawSouth) / 2, -90, 90);
      const centerLongitude = normalizeLongitude((rawEast + rawWest) / 2);
      return {
        north: clamp(centerLatitude + INSET_POINT_BOUNDS_EPSILON, -90, 90),
        south: clamp(centerLatitude - INSET_POINT_BOUNDS_EPSILON, -90, 90),
        east: normalizeLongitude(centerLongitude + INSET_POINT_BOUNDS_EPSILON),
        west: normalizeLongitude(centerLongitude - INSET_POINT_BOUNDS_EPSILON),
        longitudeSpan: INSET_POINT_BOUNDS_EPSILON * 2
      };
    }

    const longitudeSpan = Math.abs(rawEast - rawWest);
    if (!Number.isFinite(longitudeSpan)) {
      return null;
    }

    if (longitudeSpan >= INSET_MAP_WORLD_SPAN_EPSILON) {
      return {
        north,
        south,
        east: 180,
        west: -180,
        longitudeSpan: 360
      };
    }

    return {
      north,
      south,
      east: normalizeLongitude(rawEast),
      west: normalizeLongitude(rawWest),
      longitudeSpan
    };
  }

  function buildViewportFeature(bounds: MapBounds): InsetViewportFeature {
    if (bounds.east >= bounds.west) {
      return {
        type: GEOJSON_TYPE.FEATURE,
        properties: EMPTY_GEOJSON_PROPERTIES,
        geometry: {
          type: GEOJSON_TYPE.POLYGON,
          coordinates: [
            [
              [bounds.west, bounds.north],
              [bounds.east, bounds.north],
              [bounds.east, bounds.south],
              [bounds.west, bounds.south],
              [bounds.west, bounds.north]
            ]
          ]
        }
      };
    }

    return {
      type: GEOJSON_TYPE.FEATURE,
      properties: EMPTY_GEOJSON_PROPERTIES,
      geometry: {
        type: GEOJSON_TYPE.MULTI_POLYGON,
        coordinates: [
          [
            [
              [bounds.west, bounds.north],
              [180, bounds.north],
              [180, bounds.south],
              [bounds.west, bounds.south],
              [bounds.west, bounds.north]
            ]
          ],
          [
            [
              [-180, bounds.north],
              [bounds.east, bounds.north],
              [bounds.east, bounds.south],
              [-180, bounds.south],
              [-180, bounds.north]
            ]
          ]
        ]
      }
    };
  }

  function getBoundsCenter(bounds: MapBounds): [number, number] {
    const halfLongitudeSpan = bounds.longitudeSpan / 2;
    const longitude =
      bounds.east >= bounds.west
        ? (bounds.west + bounds.east) / 2
        : normalizeLongitude(bounds.west + halfLongitudeSpan);

    return [normalizeLongitude(longitude), (bounds.north + bounds.south) / 2];
  }

  function getProjectedPoint(
    projection: GeoProjection,
    bounds: MapBounds
  ): InsetViewportPoint | null {
    const projected = projection(getBoundsCenter(bounds));
    if (!projected) {
      return null;
    }

    const [x, y] = projected;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    return {
      x,
      y,
      radius: INSET_EXTENT_POINT_RADIUS
    };
  }

  function getInsetZoomScale(): number {
    const zoom = INSET_ZOOM_DEFAULT;
    const normalized = clamp(zoom / 100, 0, 1);
    return INSET_ZOOM_BASE + normalized * INSET_ZOOM_FACTOR;
  }

  function createInsetProjection(
    dimensions: InsetDimensions,
    bounds: MapBounds | null
  ): GeoProjection {
    const [rotationLng, rotationLat] = bounds
      ? getBoundsCenter(bounds)
      : [0, 0];
    const extent: [[number, number], [number, number]] = [
      [INSET_MAP_PADDING, INSET_MAP_PADDING],
      [
        dimensions.width - INSET_MAP_PADDING,
        dimensions.height - INSET_MAP_PADDING
      ]
    ];

    const projection = d3geo
      .geoOrthographic()
      .rotate([-rotationLng, -rotationLat])
      .clipAngle(90);

    projection.fitExtent(extent, WORLD_SPHERE);
    projection.scale(projection.scale() * getInsetZoomScale());

    return projection;
  }

  const isScaleAvailable = $derived(
    !basemapStyleStore.requiresMapLibre && !osmBasemapStore.isActive
  );

  const scaleDistanceLimit = $derived.by(() => {
    const _revision = mapViewRevision;
    const _zoomLevel = mapInstanceStore.zoomLevel;
    void _revision;
    void _zoomLevel;

    return getScaleDistanceLimit(
      geoIndicationsState.scale.units,
      getCurrentScaleDistanceContext()
    );
  });

  const effectiveScaleDistance = $derived.by(() => {
    const _revision = mapViewRevision;
    const _zoomLevel = mapInstanceStore.zoomLevel;
    void _revision;
    void _zoomLevel;

    const distance = toFiniteNumber(geoIndicationsState.scale.distance, 0);
    if (distance > 0) {
      return clampScaleDistance(
        distance,
        geoIndicationsState.scale.units,
        distance,
        getCurrentScaleDistanceContext()
      );
    }

    return (
      getSuggestedScaleDistance(
        geoIndicationsState.scale.units,
        getCurrentScaleDistanceContext()
      ) ?? 1
    );
  });

  $effect(() => {
    const _revision = mapViewRevision;
    void _revision;

    if (!geoIndicationsState.scale.enabled || !isScaleAvailable) {
      return;
    }

    const currentDistance = toFiniteNumber(
      geoIndicationsState.scale.distance,
      0
    );
    // Re-suggest whenever the value was auto-tuned (initial, or every time
    // projection/zoom/center moves) until the user manually overrides it.
    if (currentDistance <= 0 || geoIndicationsState.scale.autoTuned) {
      const suggested = getSuggestedScaleDistance(
        geoIndicationsState.scale.units,
        getCurrentScaleDistanceContext()
      );
      // Wait for a valid measurement before persisting an initial value —
      // otherwise the transitional state right after a basemap load would
      // bake a bogus value into the project state.
      if (suggested === null) {
        return;
      }
      if (suggested === currentDistance) {
        return;
      }
      geoIndicationsActions.setSuggestedScaleDistance(suggested);
      return;
    }

    const clampedDistance = clampScaleDistance(
      currentDistance,
      geoIndicationsState.scale.units,
      currentDistance,
      getCurrentScaleDistanceContext()
    );
    if (clampedDistance === currentDistance) {
      return;
    }

    geoIndicationsActions.setSuggestedScaleDistance(clampedDistance);
  });

  const scaleWidth = $derived.by(() => {
    const _revision = mapViewRevision;
    const _zoomLevel = mapInstanceStore.zoomLevel;
    void _revision;
    void _zoomLevel;

    const distanceMeters = toDistanceMeters(
      effectiveScaleDistance,
      geoIndicationsState.scale.units
    );
    const metersPerPixel = getScaleMetersPerPixel(
      getCurrentScaleDistanceContext(),
      false
    );
    if (metersPerPixel !== null && metersPerPixel > 0) {
      return clamp(distanceMeters / metersPerPixel, 8, SCALE_MAX_WIDTH_PX);
    }

    return clamp(
      (effectiveScaleDistance / scaleDistanceLimit) * SCALE_MAX_WIDTH_PX,
      8,
      SCALE_MAX_WIDTH_PX
    );
  });

  const scaleLabel = $derived.by(() => {
    const units = geoIndicationsState.scale.units;
    const unitLabel =
      units === DistanceUnit.KILOMETERS ? m.scale_unit_km() : m.scale_unit_mi();
    return `${formatScaleDistance(effectiveScaleDistance)} ${unitLabel}`;
  });
  const scaleRenderedWidth = $derived(Math.max(8, Math.round(scaleWidth)));
  const scaleSegmentWidth = $derived.by(() =>
    Math.max(2, Math.round(scaleRenderedWidth / SCALE_SEGMENT_COUNT))
  );
  const scaleBarWidth = $derived(scaleSegmentWidth * SCALE_SEGMENT_COUNT);
  const scaleSvgWidth = $derived(scaleBarWidth + SCALE_PADDING * 2);
  const scaleLabelX = $derived(scaleBarWidth / 2 + SCALE_PADDING);

  const orientationSize = $derived.by(() => {
    const rawSize = toFiniteNumber(geoIndicationsState.orientation.size, 10);
    const sizeInPx = rawSize * MM_TO_PAGE_PX;
    return Math.round(
      clamp(sizeInPx, ORIENTATION_MIN_SIZE_PX, ORIENTATION_MAX_SIZE_PX)
    );
  });

  const insetDimensions = $derived.by(() => {
    const requestedSize = toFiniteNumber(
      geoIndicationsState.insetMap.size,
      160
    );
    const size = clamp(
      requestedSize,
      INSET_MAP_SIZE_LIMITS[geoIndicationsState.insetMap.type].min,
      INSET_MAP_SIZE_LIMITS[geoIndicationsState.insetMap.type].max
    );

    return { width: Math.round(size), height: Math.round(size) };
  });

  const insetContinentColor = $derived.by(() => {
    return hslToHex(
      geoIndicationsState.insetMap.continentColor.hue,
      geoIndicationsState.insetMap.continentColor.saturation,
      geoIndicationsState.insetMap.continentColor.lightness
    );
  });

  const insetSeaColor = $derived.by(() => {
    return hslToHex(
      geoIndicationsState.insetMap.seaColor.hue,
      geoIndicationsState.insetMap.seaColor.saturation,
      geoIndicationsState.insetMap.seaColor.lightness
    );
  });

  const insetWindowColor = $derived(
    hslToHex(
      geoIndicationsState.insetMap.windowColor.hue,
      geoIndicationsState.insetMap.windowColor.saturation,
      geoIndicationsState.insetMap.windowColor.lightness
    )
  );

  const hasVisibleLegend = $derived(
    legendState.visible && legendState.items.some((item) => item.visible)
  );
  const placementContext = $derived.by(() => ({
    legendVisible: hasVisibleLegend,
    legendPosition: legendState.position ?? LegendPosition.TOP_RIGHT,
    legendDragged: legendState.dragPosition !== null,
    scaleEnabled: geoIndicationsState.scale.enabled,
    scaleDragged: geoIndicationsState.scale.dragPosition !== null,
    orientationEnabled: geoIndicationsState.orientation.enabled,
    orientationDragged: geoIndicationsState.orientation.dragPosition !== null
  }));
  const scaleStyle = $derived.by(() => {
    if (geoIndicationsState.scale.dragPosition) {
      return `left: ${geoIndicationsState.scale.dragPosition.x}px; top: ${geoIndicationsState.scale.dragPosition.y}px; bottom: auto; right: auto;`;
    }

    return getDefaultScaleStyle(placementContext);
  });
  const orientationStyle = $derived.by(() => {
    if (geoIndicationsState.orientation.dragPosition) {
      return `left: ${geoIndicationsState.orientation.dragPosition.x}px; top: ${geoIndicationsState.orientation.dragPosition.y}px; bottom: auto; right: auto;`;
    }

    return getDefaultOrientationStyle(placementContext);
  });

  const insetPanelStyle = $derived.by(() => {
    const styles = [getDefaultInsetStyle(placementContext)];

    if (geoIndicationsState.insetMap.dragPosition) {
      styles.push(
        `left: ${geoIndicationsState.insetMap.dragPosition.x}px`,
        `top: ${geoIndicationsState.insetMap.dragPosition.y}px`,
        'bottom: auto',
        'right: auto'
      );
    }

    return styles.join('; ');
  });

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  const insetRenderState = $derived.by(() => {
    const _revision = mapViewRevision;
    const _deckViewState = mapInstanceStore.deckViewState;
    const _zoomLevel = mapInstanceStore.zoomLevel;
    void _revision;
    void _deckViewState;
    void _zoomLevel;

    const dimensions = insetDimensions;
    const mapBounds = getCurrentMapBounds();
    const projection = createInsetProjection(dimensions, mapBounds);
    const path = d3geo.geoPath(projection);
    const spherePath = path(WORLD_SPHERE) ?? '';
    const graticulePath = path(INSET_GRATICULE) ?? '';
    const landPaths = (worldFeatures?.features ?? [])
      .map((feature) => path(feature))
      .filter((candidate): candidate is string => Boolean(candidate));

    const viewportFeature = mapBounds ? buildViewportFeature(mapBounds) : null;
    const viewportProjectedBounds = viewportFeature
      ? path.bounds(viewportFeature)
      : null;
    const viewportWidth = viewportProjectedBounds
      ? viewportProjectedBounds[1][0] - viewportProjectedBounds[0][0]
      : 0;
    const viewportHeight = viewportProjectedBounds
      ? viewportProjectedBounds[1][1] - viewportProjectedBounds[0][1]
      : 0;
    const shouldRenderViewportPoint =
      !!mapBounds &&
      (!Number.isFinite(viewportWidth) ||
        !Number.isFinite(viewportHeight) ||
        viewportWidth < INSET_EXTENT_MIN_SIZE ||
        viewportHeight < INSET_EXTENT_MIN_SIZE);
    const viewportPath =
      viewportFeature && !shouldRenderViewportPoint
        ? path(viewportFeature)
        : null;
    const viewportPoint =
      shouldRenderViewportPoint && mapBounds
        ? getProjectedPoint(projection, mapBounds)
        : null;
    const landStrokeWidth = clamp(
      Math.min(dimensions.width, dimensions.height) * 0.0035,
      INSET_LAND_STROKE_MIN,
      INSET_LAND_STROKE_MAX
    );
    const windowStrokeWidth = clamp(
      Math.min(dimensions.width, dimensions.height) * 0.017,
      INSET_WINDOW_STROKE_MIN,
      INSET_WINDOW_STROKE_MAX
    );

    return {
      spherePath,
      graticulePath,
      landPaths,
      viewportPath,
      viewportPoint,
      landStrokeWidth,
      windowStrokeWidth
    } satisfies InsetRenderState;
  });

  const insetMapAvailable = $derived.by(() => {
    const _revision = mapViewRevision;
    const _deckViewState = mapInstanceStore.deckViewState;
    const _zoomLevel = mapInstanceStore.zoomLevel;
    void _revision;
    void _deckViewState;
    void _zoomLevel;

    return isInsetMapAvailableForBounds(getCurrentMapBounds());
  });

  type DragTarget = 'scale' | 'orientation' | 'inset';

  let overlayElement = $state<HTMLDivElement | null>(null);
  let scaleElement = $state<HTMLDivElement | null>(null);
  let orientationElement = $state<HTMLDivElement | null>(null);
  let insetMapElement = $state<HTMLDivElement | null>(null);
  let currentDrag = $state<DragTarget | null>(null);
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let centeredGeoTarget = $state<DragTarget | null>(null);
  let previousScaleEnabled = $state<boolean | null>(null);
  let previousOrientationEnabled = $state<boolean | null>(null);
  let previousInsetMapEnabled = $state<boolean | null>(null);

  const isGeoIndicationsActive = $derived(
    globalState.selectedTool === StylingTools.GeoIndications
  );

  function getPageScale(): number {
    return Math.max(globalState.zoom.pageZoomScale, 0.1);
  }

  function arePointsEqual(
    left: { x: number; y: number } | null,
    right: { x: number; y: number } | null
  ): boolean {
    return left?.x === right?.x && left?.y === right?.y;
  }

  function getOverlaySize(): { width: number; height: number } | null {
    if (!overlayElement) {
      return null;
    }

    return {
      width: overlayElement.offsetWidth,
      height: overlayElement.offsetHeight
    };
  }

  function getViewportElement(): HTMLElement | null {
    return getFocusViewportElement(overlayElement);
  }

  function getDragElement(target: DragTarget): HTMLDivElement | null {
    if (target === 'scale') {
      return scaleElement;
    }

    if (target === 'orientation') {
      return orientationElement;
    }

    return insetMapElement;
  }

  function centerGeoTargetInViewport(target: DragTarget): void {
    const delta = getElementCenteringDelta(
      getViewportElement(),
      getDragElement(target)
    );

    if (!delta) {
      return;
    }

    if (Math.abs(delta.x) < 0.5 && Math.abs(delta.y) < 0.5) {
      return;
    }

    globalActions.panPageBy(delta.x, delta.y);
  }

  function getDragPosition(
    target: DragTarget
  ): { x: number; y: number } | null {
    if (target === 'scale') {
      return geoIndicationsState.scale.dragPosition;
    }

    if (target === 'orientation') {
      return geoIndicationsState.orientation.dragPosition;
    }

    return geoIndicationsState.insetMap.dragPosition;
  }

  function setDragPosition(
    target: DragTarget,
    position: { x: number; y: number } | null
  ): void {
    if (target === 'scale') {
      geoIndicationsActions.setScaleDragPosition(position);
      return;
    }

    if (target === 'orientation') {
      geoIndicationsActions.setOrientationDragPosition(position);
      return;
    }

    geoIndicationsActions.setInsetMapDragPosition(position);
  }

  function normalizeDragPosition(
    target: DragTarget,
    position: { x: number; y: number },
    snapEnabled = formatState.gridEnabled
  ): { x: number; y: number } {
    const overlaySize = getOverlaySize();
    const dragElement = getDragElement(target);

    if (!overlaySize || !dragElement) {
      return position;
    }

    return snapPointWithinBounds(
      position,
      getDragBounds(overlaySize, {
        width: dragElement.offsetWidth,
        height: dragElement.offsetHeight
      }),
      snapEnabled
    );
  }

  function normalizeStoredDragPosition(
    target: DragTarget,
    snapEnabled = formatState.gridEnabled
  ): void {
    if (currentDrag === target) {
      return;
    }

    const dragPosition = getDragPosition(target);
    if (!dragPosition) {
      return;
    }

    const normalizedPosition = normalizeDragPosition(
      target,
      dragPosition,
      snapEnabled
    );

    if (!arePointsEqual(normalizedPosition, dragPosition)) {
      setDragPosition(target, normalizedPosition);
    }
  }

  $effect(() => {
    void formatState.width;
    void formatState.height;
    void formatState.margins.top;
    void formatState.margins.right;
    void formatState.margins.bottom;
    void formatState.margins.left;
    void geoIndicationsState.scale.form;
    void geoIndicationsState.scale.fontSize;
    void geoIndicationsState.scale.dragPosition;

    normalizeStoredDragPosition(
      'scale',
      untrack(() => formatState.gridEnabled)
    );
  });

  $effect(() => {
    void formatState.width;
    void formatState.height;
    void formatState.margins.top;
    void formatState.margins.right;
    void formatState.margins.bottom;
    void formatState.margins.left;
    void geoIndicationsState.orientation.size;
    void geoIndicationsState.orientation.style;
    void geoIndicationsState.orientation.dragPosition;

    normalizeStoredDragPosition(
      'orientation',
      untrack(() => formatState.gridEnabled)
    );
  });

  $effect(() => {
    void formatState.width;
    void formatState.height;
    void formatState.margins.top;
    void formatState.margins.right;
    void formatState.margins.bottom;
    void formatState.margins.left;
    void geoIndicationsState.insetMap.size;
    void geoIndicationsState.insetMap.type;
    void geoIndicationsState.insetMap.dragPosition;

    normalizeStoredDragPosition(
      'inset',
      untrack(() => formatState.gridEnabled)
    );
  });

  function stopDragging(): void {
    currentDrag = null;
    setStylingToolPopoverDragging(false);
    window.removeEventListener(EVENT.POINTERMOVE, handlePointerMove);
    window.removeEventListener(EVENT.POINTERUP, handlePointerUp);
  }

  function handlePointerUp(): void {
    stopDragging();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!currentDrag || !overlayElement) {
      return;
    }

    const scale = getPageScale();
    const rect = overlayElement.getBoundingClientRect();
    const position = normalizeDragPosition(currentDrag, {
      x: (event.clientX - rect.left) / scale - dragOffsetX,
      y: (event.clientY - rect.top) / scale - dragOffsetY
    });

    setDragPosition(currentDrag, position);
  }

  function startDrag(
    event: PointerEvent,
    target: DragTarget,
    element: HTMLDivElement | null
  ): void {
    if (!isGeoIndicationsActive || !overlayElement || !element) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const scale = getPageScale();
    const overlayRect = overlayElement.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    const currentX = (elementRect.left - overlayRect.left) / scale;
    const currentY = (elementRect.top - overlayRect.top) / scale;
    const dragPos = normalizeDragPosition(
      target,
      getDragPosition(target) ?? {
        x: currentX,
        y: currentY
      }
    );

    if (!arePointsEqual(dragPos, getDragPosition(target))) {
      setDragPosition(target, dragPos);
    }

    dragOffsetX = (event.clientX - overlayRect.left) / scale - dragPos.x;
    dragOffsetY = (event.clientY - overlayRect.top) / scale - dragPos.y;
    currentDrag = target;
    setStylingToolPopoverDragging(true);

    window.addEventListener(EVENT.POINTERMOVE, handlePointerMove);
    window.addEventListener(EVENT.POINTERUP, handlePointerUp);
  }

  function handleGeoIndicationsActivate(
    event: MouseEvent | KeyboardEvent
  ): void {
    event.stopPropagation();
    activateStylingToolFromMap(StylingTools.GeoIndications);
  }

  function centerGeoTargetOnClick(target: DragTarget): void {
    centerGeoTargetInViewport(target);
  }

  function isCenteredGeoTargetVisible(target: DragTarget): boolean {
    if (!geoIndicationsState.visible) {
      return false;
    }

    if (target === 'scale') {
      return geoIndicationsState.scale.enabled;
    }

    if (target === 'orientation') {
      return geoIndicationsState.orientation.enabled;
    }

    return geoIndicationsState.insetMap.enabled;
  }

  function resetCenteredGeoTargetPan(): void {
    if (!centeredGeoTarget) {
      return;
    }

    centeredGeoTarget = null;
    globalActions.resetPagePan();
  }

  function handleGeoIndicationsClick(
    event: MouseEvent,
    target: DragTarget
  ): void {
    handleGeoIndicationsActivate(event);
    centeredGeoTarget = target;

    const currentTarget = event.currentTarget;
    if (currentTarget instanceof HTMLElement) {
      currentTarget.focus({ preventScroll: true });
    }

    void tick().then(() => {
      centerGeoTargetOnClick(target);
    });
  }

  function handleGeoIndicationsBlur(target: DragTarget): void {
    if (centeredGeoTarget !== target) {
      return;
    }

    resetCenteredGeoTargetPan();
  }

  function handleGeoIndicationsKeyDown(
    event: KeyboardEvent,
    target: DragTarget
  ): void {
    if (event.key !== KEY.ENTER && event.key !== KEY.SPACE) {
      return;
    }

    event.preventDefault();
    handleGeoIndicationsActivate(event);
    centeredGeoTarget = target;
    void tick().then(() => {
      centerGeoTargetOnClick(target);
    });
  }

  $effect(() => {
    if (!centeredGeoTarget) {
      return;
    }

    if (hidden || !isCenteredGeoTargetVisible(centeredGeoTarget)) {
      resetCenteredGeoTargetPan();
      return;
    }

    if (!isGeoIndicationsActive) {
      resetCenteredGeoTargetPan();
    }
  });

  $effect(() => {
    const scaleEnabled = geoIndicationsState.scale.enabled;
    const orientationEnabled = geoIndicationsState.orientation.enabled;
    const insetMapEnabled = geoIndicationsState.insetMap.enabled;

    if (
      previousScaleEnabled === null ||
      previousOrientationEnabled === null ||
      previousInsetMapEnabled === null
    ) {
      previousScaleEnabled = scaleEnabled;
      previousOrientationEnabled = orientationEnabled;
      previousInsetMapEnabled = insetMapEnabled;
      return;
    }

    const shouldCenterScale = !previousScaleEnabled && scaleEnabled;
    const shouldCenterOrientation =
      !previousOrientationEnabled && orientationEnabled;
    const shouldCenterInsetMap = !previousInsetMapEnabled && insetMapEnabled;

    previousScaleEnabled = scaleEnabled;
    previousOrientationEnabled = orientationEnabled;
    previousInsetMapEnabled = insetMapEnabled;

    if (hidden || !interactive) {
      return;
    }

    const targetsToCenter: DragTarget[] = [];

    if (shouldCenterScale) {
      targetsToCenter.push('scale');
    }

    if (shouldCenterOrientation) {
      targetsToCenter.push('orientation');
    }

    if (shouldCenterInsetMap) {
      targetsToCenter.push('inset');
    }

    if (targetsToCenter.length === 0) {
      return;
    }

    void tick().then(() => {
      if (hidden || !interactive) {
        return;
      }

      for (const target of targetsToCenter) {
        if (isCenteredGeoTargetVisible(target)) {
          centerGeoTargetInViewport(target);
        }
      }
    });
  });

  function handleScalePointerDown(event: PointerEvent): void {
    startDrag(event, 'scale', scaleElement);
  }

  function handleOrientationPointerDown(event: PointerEvent): void {
    startDrag(event, 'orientation', orientationElement);
  }

  function handleInsetMapPointerDown(event: PointerEvent): void {
    startDrag(event, 'inset', insetMapElement);
  }

  onDestroy(() => {
    centeredGeoTarget = null;
    stopDragging();
  });
</script>

<div
  class="geo-indications-overlay"
  class:hidden={hidden}
  class:non-interactive={!interactive}
  bind:this={overlayElement}
>
  {#if geoIndicationsState.visible && geoIndicationsState.scale.enabled && isScaleAvailable}
    <div
      bind:this={scaleElement}
      class="scale-bar"
      class:draggable={isGeoIndicationsActive}
      class:dragging={currentDrag === 'scale'}
      data-workspace-pan-ignore="true"
      style={scaleStyle}
      role="button"
      tabindex="0"
      aria-label={m.tool_geo_indications()}
      onclick={(event: MouseEvent) => handleGeoIndicationsClick(event, 'scale')}
      onblur={() => handleGeoIndicationsBlur('scale')}
      onkeydown={(event: KeyboardEvent) =>
        handleGeoIndicationsKeyDown(event, 'scale')}
      onpointerdown={handleScalePointerDown}
    >
      <svg
        width={scaleSvgWidth}
        height="26"
        aria-label={m.geo_scale_bar_aria()}
      >
        {#if geoIndicationsState.scale.form === ScaleForm.BOX}
          <text
            x={scaleLabelX}
            y="9"
            text-anchor="middle"
            fill={scaleColor}
            font-size={scaleFontSize}
            font-family={scaleFontFamily}
          >
            {scaleLabel}
          </text>
          {#each SCALE_SEGMENTS as segment (segment)}
            <rect
              x={SCALE_PADDING + segment * scaleSegmentWidth}
              y="13"
              width={scaleSegmentWidth}
              height="8"
              fill={segment % 2 === 0 ? scaleColor : 'transparent'}
              stroke={scaleColor}
              stroke-width="1.5"
            />
          {/each}
        {:else}
          <line
            x1={SCALE_PADDING}
            y1="20"
            x2={scaleBarWidth + SCALE_PADDING}
            y2="20"
            stroke={scaleColor}
            stroke-width="2"
          />
          <text
            x={scaleLabelX}
            y="10"
            text-anchor="middle"
            fill={scaleColor}
            font-size={scaleFontSize}
            font-family={scaleFontFamily}
          >
            {scaleLabel}
          </text>
        {/if}
      </svg>
    </div>
  {/if}

  {#if geoIndicationsState.visible && geoIndicationsState.orientation.enabled}
    <div
      bind:this={orientationElement}
      class="north-arrow"
      class:draggable={isGeoIndicationsActive}
      class:dragging={currentDrag === 'orientation'}
      data-workspace-pan-ignore="true"
      style={orientationStyle}
      role="button"
      tabindex="0"
      aria-label={m.tool_geo_indications()}
      onclick={(event: MouseEvent) =>
        handleGeoIndicationsClick(event, 'orientation')}
      onblur={() => handleGeoIndicationsBlur('orientation')}
      onkeydown={(event: KeyboardEvent) =>
        handleGeoIndicationsKeyDown(event, 'orientation')}
      onpointerdown={handleOrientationPointerDown}
    >
      <svg
        width={orientationSize}
        height={orientationSize}
        viewBox="0 0 40 50"
        aria-label={m.geo_north_indicator_aria()}
      >
        {#if geoIndicationsState.orientation.style === OrientationIndicatorStyle.ARROW}
          <polygon
            points="20,5 30,35 20,28 10,35"
            fill={orientationColor}
            stroke={orientationColor}
            stroke-width="1"
          />
          <text
            x="20"
            y="47"
            text-anchor="middle"
            font-size={PRINT_STANDARD_TOKENS.geoIndications.scaleFontSize}
            font-weight="bold"
            fill={orientationColor}
            font-family={orientationFontFamily}
          >
            {m.orientation_north()}
          </text>
        {:else}
          <circle
            cx="20"
            cy="20"
            r="15"
            fill="none"
            stroke={orientationColor}
            stroke-width="2"
          />
          <polygon points="20,7 23,20 20,15 17,20" fill={orientationColor} />
          <polygon
            points="20,33 23,20 20,25 17,20"
            fill="none"
            stroke={orientationColor}
            stroke-width="1"
          />
          <line
            x1="7"
            y1="20"
            x2="33"
            y2="20"
            stroke={orientationColor}
            stroke-width="1"
          />
          <text
            x="20"
            y="47"
            text-anchor="middle"
            font-size={PRINT_STANDARD_TOKENS.annotations.captionFontSize}
            font-weight="bold"
            fill={orientationColor}
            font-family={orientationFontFamily}
          >
            {m.orientation_north()}
          </text>
        {/if}
      </svg>
    </div>
  {/if}

  {#if geoIndicationsState.visible && geoIndicationsState.insetMap.enabled && insetMapAvailable}
    <div
      bind:this={insetMapElement}
      class="inset-map-panel"
      class:draggable={isGeoIndicationsActive}
      class:dragging={currentDrag === 'inset'}
      data-workspace-pan-ignore="true"
      style={insetPanelStyle}
      role="button"
      tabindex="0"
      aria-label={m.tool_geo_indications()}
      onclick={(event: MouseEvent) => handleGeoIndicationsClick(event, 'inset')}
      onblur={() => handleGeoIndicationsBlur('inset')}
      onkeydown={(event: KeyboardEvent) =>
        handleGeoIndicationsKeyDown(event, 'inset')}
      onpointerdown={handleInsetMapPointerDown}
    >
      <div
        class="inset-map inset-map-globe"
        style="width: {insetDimensions.width}px; height: {insetDimensions.height}px;"
      >
        <svg
          class="inset-map-svg"
          width={insetDimensions.width}
          height={insetDimensions.height}
          viewBox="0 0 {insetDimensions.width} {insetDimensions.height}"
        >
          <defs>
            <clipPath id={insetClipId}>
              <path d={insetRenderState.spherePath}></path>
            </clipPath>
          </defs>
          <path d={insetRenderState.spherePath} fill={insetSeaColor}></path>
          <g clip-path={`url(#${insetClipId})`}>
            {#each insetRenderState.landPaths as landPath, index (index)}
              <path
                class="inset-land-path"
                d={landPath}
                fill={insetContinentColor}
                stroke={insetContinentColor}
                stroke-width={insetRenderState.landStrokeWidth}
              ></path>
            {/each}
            {#if insetRenderState.graticulePath}
              <path
                class="inset-graticule-path"
                d={insetRenderState.graticulePath}
                fill="none"
              ></path>
            {/if}
          </g>
          <path class="inset-outline" d={insetRenderState.spherePath}></path>
          {#if insetRenderState.viewportPath}
            <path
              class="inset-extent-path"
              d={insetRenderState.viewportPath}
              fill="none"
              stroke={insetWindowColor}
              stroke-width={insetRenderState.windowStrokeWidth}
            ></path>
          {:else if insetRenderState.viewportPoint}
            <circle
              class="inset-extent-point"
              cx={insetRenderState.viewportPoint.x}
              cy={insetRenderState.viewportPoint.y}
              r={insetRenderState.viewportPoint.radius}
              fill={insetWindowColor}
              stroke={insetWindowColor}
              stroke-width={insetRenderState.windowStrokeWidth}
            ></circle>
          {/if}
        </svg>
      </div>
    </div>
  {/if}
</div>

<style>
  .geo-indications-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: var(--z-content);
  }

  .geo-indications-overlay.hidden {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  :global(.is-exporting-map) .geo-indications-overlay.hidden {
    opacity: 1;
    visibility: visible;
  }

  .scale-bar {
    position: absolute;
    bottom: 12px;
    left: 12px;
    background: rgba(255, 255, 255, 0.85);
    padding: 3px 5px;
    border-radius: 3px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    pointer-events: auto;
    cursor: pointer;
    touch-action: none;
    outline: none;
  }

  .geo-indications-overlay.non-interactive .scale-bar,
  .geo-indications-overlay.non-interactive .north-arrow,
  .geo-indications-overlay.non-interactive .inset-map-panel {
    pointer-events: none;
    cursor: default;
  }

  .north-arrow {
    position: absolute;
    top: 12px;
    right: 12px;
    background: rgba(255, 255, 255, 0.85);
    padding: 4px;
    border-radius: 3px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    pointer-events: auto;
    cursor: pointer;
    touch-action: none;
    outline: none;
  }

  .inset-map-panel {
    position: absolute;
    bottom: 12px;
    right: 12px;
    background: rgba(255, 255, 255, 0.85);
    padding: 4px;
    border-radius: 3px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    pointer-events: auto;
    cursor: pointer;
    touch-action: none;
    outline: none;
  }

  .scale-bar.draggable,
  .north-arrow.draggable,
  .inset-map-panel.draggable {
    cursor: grab;
  }

  .scale-bar.dragging,
  .north-arrow.dragging,
  .inset-map-panel.dragging {
    cursor: grabbing;
    user-select: none;
  }

  .inset-map {
    position: relative;
    overflow: hidden;
  }

  .inset-map-globe {
    border-radius: 50%;
  }

  .inset-map-svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .inset-land-path {
    opacity: 0.95;
    vector-effect: non-scaling-stroke;
  }

  .inset-graticule-path {
    stroke: rgba(0, 0, 0, 0.3);
    stroke-width: 0.5;
    vector-effect: non-scaling-stroke;
  }

  .inset-extent-path,
  .inset-extent-point {
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .inset-outline {
    fill: none;
    stroke: rgba(0, 0, 0, 0.3);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
</style>
