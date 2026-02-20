<script lang="ts">
  import {
    DistanceUnit,
    InsetMapType,
    OrientationIndicatorStyle,
    ScaleForm
  } from '$lib/features/commons/constants/ui.constants';
  import { StylingTools } from '$lib/features/commons/types/global';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { EVENT, KEY } from '$lib/features/commons/constants/dom.constants';
  import {
    geoIndicationsActions,
    geoIndicationsState
  } from '$lib/features/step-toolbar/tools/geo-indications/geo-indications.store.svelte';
  import { onDestroy, onMount } from 'svelte';
  import * as d3geo from 'd3-geo';
  import type { GeoPermissibleObjects, GeoProjection } from 'd3-geo';
  import type {
    Feature,
    FeatureCollection,
    GeoJsonProperties,
    MultiPolygon,
    Polygon
  } from 'geojson';
  import { basemapLayersStore } from '../stores/basemap-layers.store.svelte';
  import { activateStylingToolFromMap } from '../utils/styling-tool-activation.utils';
  import * as m from '$lib/paraglide/messages';
  import { GEOJSON_TYPE } from '$lib/features/commons/constants';

  const EARTH_CIRCUMFERENCE_KM = 40075.017;
  const EARTH_RADIUS_METERS = 6378137;
  const KM_TO_MILES = 0.621371;
  const MILE_TO_METERS = 1609.344;
  const MM_TO_PAGE_PX = 72 / 25.4;
  const SCALE_PADDING = 10;
  const SCALE_SEGMENT_COUNT = 4;
  const SCALE_SEGMENTS = Array.from(
    { length: SCALE_SEGMENT_COUNT },
    (_, index) => index
  );
  const SCALE_FALLBACK_ZOOM = 2;
  const INSET_MAP_DATA_URL = '/basemaps/geometry/world-countries-50m.geojson';
  const INSET_PLANISPHERE_RATIO = 0.62;
  const INSET_MAP_PADDING = 4;
  const INSET_MAP_MAX_RATIO = 0.34;
  const INSET_MAP_WORLD_SPAN_EPSILON = 359.5;
  const INSET_ZOOM_BASE = 0.6;
  const INSET_ZOOM_FACTOR = 1.2;
  const INSET_WINDOW_STROKE_MIN = 1.2;
  const INSET_WINDOW_STROKE_MAX = 3;
  const INSET_WORLD_WINDOW_INSET = 1.5;
  const INSET_LAND_STROKE_MIN = 0.35;
  const INSET_LAND_STROKE_MAX = 0.8;

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
  type InsetRenderState = {
    spherePath: string;
    landPaths: string[];
    viewportPath: string | null;
    worldViewport: boolean;
    landStrokeWidth: number;
    windowStrokeWidth: number;
  };

  const WORLD_SPHERE: GeoPermissibleObjects = { type: 'Sphere' };
  const EMPTY_GEOJSON_PROPERTIES: GeoJsonProperties = {};
  const insetClipId = `inset-geo-${Math.random().toString(36).slice(2, 10)}`;

  let worldFeatures = $state<WorldFeatureCollection | null>(null);
  let mapViewRevision = $state(0);

  onMount(() => {
    let cancelled = false;

    const loadWorldFeatures = async (): Promise<void> => {
      try {
        const response = await fetch(INSET_MAP_DATA_URL);
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as unknown;
        if (!cancelled) {
          worldFeatures = toWorldFeatureCollection(payload);
        }
      } catch {
        if (!cancelled) {
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

  const orientationColor = $derived(
    hslToHex(
      geoIndicationsState.orientation.color.hue,
      geoIndicationsState.orientation.color.saturation,
      geoIndicationsState.orientation.color.lightness
    )
  );

  function toFiniteNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return fallback;
  }

  function toDistanceMeters(distance: number, unit: DistanceUnit): number {
    return unit === DistanceUnit.KILOMETERS
      ? distance * 1000
      : (distance / KM_TO_MILES) * 1000;
  }

  function fromDistanceMeters(
    distanceMeters: number,
    unit: DistanceUnit
  ): number {
    return unit === DistanceUnit.KILOMETERS
      ? distanceMeters / 1000
      : distanceMeters / MILE_TO_METERS;
  }

  function toNiceDistance(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 1;
    }

    const exponent = Math.floor(Math.log10(value));
    const magnitude = Math.pow(10, exponent);
    const normalized = value / magnitude;
    const step =
      normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;

    return step * magnitude;
  }

  function getMapCanvasWidthPx(): number {
    const canvas = mapInstanceStore.getMapCanvas();
    return canvas ? canvas.clientWidth : 0;
  }

  function getMapCanvasHeightPx(): number {
    const canvas = mapInstanceStore.getMapCanvas();
    return canvas ? canvas.clientHeight : 0;
  }

  function getMapCanvasMinSizePx(): number {
    const canvas = mapInstanceStore.getMapCanvas();
    if (!canvas) {
      return 0;
    }

    return Math.min(canvas.clientWidth, canvas.clientHeight);
  }

  function computeScaleWidthFromMap(distanceMeters: number): number | null {
    const map = mapInstanceStore.map;
    if (!map || distanceMeters <= 0) {
      return null;
    }

    const center = map.getCenter();
    const safeLatitude = clamp(center.lat, -85, 85);
    const latitudeRadians = (safeLatitude * Math.PI) / 180;
    const cosLatitude = Math.cos(latitudeRadians);
    if (Math.abs(cosLatitude) < 1e-6) {
      return null;
    }

    const deltaLongitude =
      (distanceMeters / (EARTH_RADIUS_METERS * cosLatitude)) * (180 / Math.PI);
    const projectedStart = map.project(center);
    const projectedEnd = map.project([
      center.lng + deltaLongitude,
      safeLatitude
    ]);
    const width = Math.abs(projectedEnd.x - projectedStart.x);

    return Number.isFinite(width) ? width : null;
  }

  function getProjectedMetersPerPixelAtCenter(): number | null {
    const map = mapInstanceStore.map;
    if (!map) {
      return null;
    }

    const center = map.getCenter();
    const safeLatitude = clamp(center.lat, -85, 85);
    const latitudeRadians = (safeLatitude * Math.PI) / 180;
    const cosLatitude = Math.cos(latitudeRadians);
    if (Math.abs(cosLatitude) < 1e-6) {
      return null;
    }

    const projectedCenter = map.project([center.lng, safeLatitude]);
    const projectedEast = map.project([center.lng + 1, safeLatitude]);
    const pixelDelta = Math.abs(projectedEast.x - projectedCenter.x);
    if (!Number.isFinite(pixelDelta) || pixelDelta < 1e-6) {
      return null;
    }

    const metersPerLongitudeDegree =
      (Math.PI / 180) * EARTH_RADIUS_METERS * cosLatitude;
    return metersPerLongitudeDegree / pixelDelta;
  }

  function getFallbackMetersPerPixel(): number {
    const fallbackZoom = toFiniteNumber(
      mapInstanceStore.currentZoom,
      SCALE_FALLBACK_ZOOM
    );
    const centerLatitude =
      mapInstanceStore.getMapCenter()?.lat ??
      mapInstanceStore.map?.getCenter().lat ??
      0;
    const cosine = Math.max(
      Math.cos((clamp(centerLatitude, -85, 85) * Math.PI) / 180),
      1e-6
    );

    return (
      (EARTH_CIRCUMFERENCE_KM * 1000 * cosine) / Math.pow(2, fallbackZoom + 8)
    );
  }

  function getSuggestedScaleDistance(unit: DistanceUnit): number {
    const mapWidth = getMapCanvasWidthPx();
    const targetWidthPx = clamp(mapWidth * 0.2 || 140, 90, 220);

    const metersPerPixel =
      getProjectedMetersPerPixelAtCenter() ?? getFallbackMetersPerPixel();
    const rawDistance = fromDistanceMeters(
      targetWidthPx * metersPerPixel,
      unit
    );
    const niceDistance = toNiceDistance(rawDistance);

    return Math.max(1, Math.round(niceDistance));
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
    const bounds = mapInstanceStore.getMapBounds();
    if (!bounds) {
      return null;
    }

    const north = clamp(toFiniteNumber(bounds.north, 90), -90, 90);
    const south = clamp(toFiniteNumber(bounds.south, -90), -90, 90);
    if (north <= south) {
      return null;
    }

    const rawEast = toFiniteNumber(bounds.east, 180);
    const rawWest = toFiniteNumber(bounds.west, -180);
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

  function getInsetZoomScale(): number {
    const zoom = toFiniteNumber(geoIndicationsState.insetMap.zoom, 50);
    const normalized = clamp(zoom / 100, 0, 1);
    return INSET_ZOOM_BASE + normalized * INSET_ZOOM_FACTOR;
  }

  function createInsetProjection(dimensions: InsetDimensions): GeoProjection {
    const rotationLng = toFiniteNumber(
      geoIndicationsState.insetMap.centerLongitude,
      0
    );
    const rotationLat = toFiniteNumber(
      geoIndicationsState.insetMap.centerLatitude,
      0
    );
    const extent: [[number, number], [number, number]] = [
      [INSET_MAP_PADDING, INSET_MAP_PADDING],
      [
        dimensions.width - INSET_MAP_PADDING,
        dimensions.height - INSET_MAP_PADDING
      ]
    ];

    const projection =
      geoIndicationsState.insetMap.type === InsetMapType.GLOBE
        ? d3geo
            .geoOrthographic()
            .rotate([-rotationLng, -rotationLat])
            .clipAngle(90)
        : d3geo.geoNaturalEarth1().rotate([-rotationLng, -rotationLat, 0]);

    projection.fitExtent(extent, WORLD_SPHERE);
    projection.scale(projection.scale() * getInsetZoomScale());

    return projection;
  }

  const effectiveScaleDistance = $derived.by(() => {
    const distance = toFiniteNumber(geoIndicationsState.scale.distance, 0);
    if (distance > 0) {
      return distance;
    }

    return getSuggestedScaleDistance(geoIndicationsState.scale.units);
  });

  $effect(() => {
    const _revision = mapViewRevision;
    void _revision;

    if (!geoIndicationsState.scale.enabled) {
      return;
    }

    const currentDistance = toFiniteNumber(
      geoIndicationsState.scale.distance,
      0
    );
    if (currentDistance > 0) {
      return;
    }

    geoIndicationsActions.setScaleDistance(
      getSuggestedScaleDistance(geoIndicationsState.scale.units)
    );
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
    const mapWidth = getMapCanvasWidthPx();
    const maxWidth = mapWidth > 0 ? mapWidth * 0.55 : 420;

    const projectedWidth = computeScaleWidthFromMap(distanceMeters);
    if (projectedWidth !== null) {
      return clamp(projectedWidth, 8, maxWidth);
    }

    const metersPerPixel = getFallbackMetersPerPixel();
    const fallbackWidth = distanceMeters / metersPerPixel;

    return clamp(fallbackWidth, 8, maxWidth);
  });

  const scaleLabel = $derived.by(() => {
    const distance = Math.max(1, Math.round(effectiveScaleDistance));
    const units = geoIndicationsState.scale.units;
    const unitLabel = units === DistanceUnit.KILOMETERS ? 'km' : 'mi';
    return `${distance} ${unitLabel}`;
  });
  const scaleRenderedWidth = $derived(Math.max(8, Math.round(scaleWidth)));
  const scaleSegmentWidth = $derived.by(() =>
    Math.max(2, Math.round(scaleRenderedWidth / SCALE_SEGMENT_COUNT))
  );
  const scaleBarWidth = $derived(scaleSegmentWidth * SCALE_SEGMENT_COUNT);
  const scaleSvgWidth = $derived(scaleBarWidth + SCALE_PADDING * 2);
  const scaleLabelX = $derived(scaleBarWidth / 2 + SCALE_PADDING);

  const orientationSize = $derived.by(() => {
    const _revision = mapViewRevision;
    void _revision;

    const rawSize = toFiniteNumber(geoIndicationsState.orientation.size, 10);
    const sizeInPx = rawSize * MM_TO_PAGE_PX;
    const mapMinSize = getMapCanvasMinSizePx();
    const maxSize = Math.max(
      14,
      Math.min(mapMinSize > 0 ? mapMinSize * 0.14 : 84, 84)
    );

    return Math.round(clamp(sizeInPx, 14, maxSize));
  });

  const insetDimensions = $derived.by(() => {
    const _revision = mapViewRevision;
    void _revision;

    const requestedSize = toFiniteNumber(
      geoIndicationsState.insetMap.size,
      160
    );
    const mapWidth = getMapCanvasWidthPx();
    const mapHeight = getMapCanvasHeightPx();
    const maxWidth = Math.max(
      72,
      mapWidth > 0 ? mapWidth * INSET_MAP_MAX_RATIO : 240
    );
    const maxHeight = Math.max(
      48,
      mapHeight > 0 ? mapHeight * INSET_MAP_MAX_RATIO : 170
    );

    if (geoIndicationsState.insetMap.type === InsetMapType.GLOBE) {
      const maxSize = Math.max(56, Math.min(maxWidth, maxHeight));
      const size = clamp(requestedSize, 56, maxSize);
      return { width: Math.round(size), height: Math.round(size) };
    }

    const width = clamp(requestedSize, 72, maxWidth);
    const proposedHeight = width * INSET_PLANISPHERE_RATIO;
    const height = clamp(proposedHeight, 48, maxHeight);

    return {
      width: Math.round(width),
      height: Math.round(height)
    };
  });

  const basemapContinentColor = $derived.by(() => {
    const terreLayer = basemapLayersStore.getLayer('terre');
    return terreLayer ? terreLayer.fillColor : '#d9d9d9';
  });

  const basemapSeaColor = $derived.by(() => {
    const seaLayer = basemapLayersStore.getLayer('mers');
    return seaLayer ? seaLayer.color : '#d0e2ff';
  });

  const insetContinentColor = $derived.by(() => {
    if (geoIndicationsState.insetMap.useBasemapColors) {
      return basemapContinentColor;
    }

    return hslToHex(
      geoIndicationsState.insetMap.continentColor.hue,
      geoIndicationsState.insetMap.continentColor.saturation,
      geoIndicationsState.insetMap.continentColor.lightness
    );
  });

  const insetSeaColor = $derived.by(() => {
    if (geoIndicationsState.insetMap.useBasemapColors) {
      return basemapSeaColor;
    }

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

  const insetPanelBackgroundColor = $derived(insetWindowColor);
  const insetPanelBorderColor = $derived(insetWindowColor);

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  const insetRenderState = $derived.by(() => {
    const _revision = mapViewRevision;
    void _revision;

    const dimensions = insetDimensions;
    const projection = createInsetProjection(dimensions);
    const path = d3geo.geoPath(projection);
    const spherePath = path(WORLD_SPHERE) ?? '';
    const landPaths = (worldFeatures?.features ?? [])
      .map((feature) => path(feature))
      .filter((candidate): candidate is string => Boolean(candidate));

    const mapBounds = getCurrentMapBounds();
    const worldViewport =
      !mapBounds || mapBounds.longitudeSpan >= INSET_MAP_WORLD_SPAN_EPSILON;
    const viewportFeature =
      mapBounds && !worldViewport ? buildViewportFeature(mapBounds) : null;
    const viewportPath = worldViewport
      ? geoIndicationsState.insetMap.type === InsetMapType.GLOBE
        ? spherePath
        : null
      : viewportFeature
        ? path(viewportFeature)
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
      landPaths,
      viewportPath,
      worldViewport,
      landStrokeWidth,
      windowStrokeWidth
    } satisfies InsetRenderState;
  });

  type DragTarget = 'scale' | 'orientation' | 'inset';

  let overlayElement = $state<HTMLDivElement | null>(null);
  let scaleElement = $state<HTMLDivElement | null>(null);
  let orientationElement = $state<HTMLDivElement | null>(null);
  let insetMapElement = $state<HTMLDivElement | null>(null);
  let currentDrag = $state<DragTarget | null>(null);
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const isGeoIndicationsActive = $derived(
    globalState.selectedTool === StylingTools.GeoIndications
  );

  function stopDragging(): void {
    currentDrag = null;
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

    const rect = overlayElement.getBoundingClientRect();
    const x = clamp(
      event.clientX - rect.left - dragOffsetX,
      0,
      Math.max(0, rect.width - 10)
    );
    const y = clamp(
      event.clientY - rect.top - dragOffsetY,
      0,
      Math.max(0, rect.height - 10)
    );

    if (currentDrag === 'scale') {
      geoIndicationsActions.setScaleDragPosition({ x, y });
    } else if (currentDrag === 'orientation') {
      geoIndicationsActions.setOrientationDragPosition({ x, y });
    } else if (currentDrag === 'inset') {
      geoIndicationsActions.setInsetMapDragPosition({ x, y });
    }
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

    const overlayRect = overlayElement.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    const currentX = elementRect.left - overlayRect.left;
    const currentY = elementRect.top - overlayRect.top;

    let dragPos: { x: number; y: number } | null = null;
    if (target === 'scale') {
      dragPos = geoIndicationsState.scale.dragPosition;
    } else if (target === 'orientation') {
      dragPos = geoIndicationsState.orientation.dragPosition;
    } else if (target === 'inset') {
      dragPos = geoIndicationsState.insetMap.dragPosition;
    }

    if (!dragPos) {
      const initialPos = { x: currentX, y: currentY };
      if (target === 'scale') {
        geoIndicationsActions.setScaleDragPosition(initialPos);
      } else if (target === 'orientation') {
        geoIndicationsActions.setOrientationDragPosition(initialPos);
      } else if (target === 'inset') {
        geoIndicationsActions.setInsetMapDragPosition(initialPos);
      }
      dragPos = initialPos;
    }

    dragOffsetX = event.clientX - overlayRect.left - dragPos.x;
    dragOffsetY = event.clientY - overlayRect.top - dragPos.y;
    currentDrag = target;

    window.addEventListener(EVENT.POINTERMOVE, handlePointerMove);
    window.addEventListener(EVENT.POINTERUP, handlePointerUp);
  }

  function handleGeoIndicationsActivate(
    event: MouseEvent | KeyboardEvent
  ): void {
    event.stopPropagation();
    activateStylingToolFromMap(StylingTools.GeoIndications);
  }

  function handleGeoIndicationsKeyDown(event: KeyboardEvent): void {
    if (event.key !== KEY.ENTER && event.key !== KEY.SPACE) {
      return;
    }

    event.preventDefault();
    handleGeoIndicationsActivate(event);
  }

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
    stopDragging();
  });
</script>

<div class="geo-indications-overlay" bind:this={overlayElement}>
  {#if geoIndicationsState.visible && geoIndicationsState.scale.enabled}
    <div
      bind:this={scaleElement}
      class="scale-bar"
      class:draggable={isGeoIndicationsActive}
      class:dragging={currentDrag === 'scale'}
      style={geoIndicationsState.scale.dragPosition
        ? `left: ${geoIndicationsState.scale.dragPosition.x}px; top: ${geoIndicationsState.scale.dragPosition.y}px; bottom: auto; right: auto;`
        : ''}
      role="button"
      tabindex="0"
      aria-label={m.tool_geo_indications()}
      onclick={handleGeoIndicationsActivate}
      onkeydown={handleGeoIndicationsKeyDown}
      onpointerdown={handleScalePointerDown}
    >
      <svg
        width={scaleSvgWidth}
        height="34"
        aria-label={m.geo_scale_bar_aria()}
      >
        {#if geoIndicationsState.scale.form === ScaleForm.BOX}
          <text
            x={scaleLabelX}
            y="10"
            text-anchor="middle"
            fill={scaleColor}
            font-size="11"
            font-family="Arial, sans-serif"
          >
            {scaleLabel}
          </text>
          {#each SCALE_SEGMENTS as segment (segment)}
            <rect
              x={SCALE_PADDING + segment * scaleSegmentWidth}
              y="14"
              width={scaleSegmentWidth}
              height="10"
              fill={segment % 2 === 0 ? scaleColor : 'transparent'}
              stroke={scaleColor}
              stroke-width="1.5"
            />
          {/each}
        {:else}
          <line
            x1={SCALE_PADDING}
            y1="22"
            x2={scaleBarWidth + SCALE_PADDING}
            y2="22"
            stroke={scaleColor}
            stroke-width="2"
          />
          <line
            x1={SCALE_PADDING}
            y1="17"
            x2={SCALE_PADDING}
            y2="27"
            stroke={scaleColor}
            stroke-width="2"
          />
          <line
            x1={scaleBarWidth + SCALE_PADDING}
            y1="17"
            x2={scaleBarWidth + SCALE_PADDING}
            y2="27"
            stroke={scaleColor}
            stroke-width="2"
          />
          <text
            x={scaleLabelX}
            y="11"
            text-anchor="middle"
            fill={scaleColor}
            font-size="11"
            font-family="Arial, sans-serif"
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
      style={geoIndicationsState.orientation.dragPosition
        ? `left: ${geoIndicationsState.orientation.dragPosition.x}px; top: ${geoIndicationsState.orientation.dragPosition.y}px; bottom: auto; right: auto;`
        : ''}
      role="button"
      tabindex="0"
      aria-label={m.tool_geo_indications()}
      onclick={handleGeoIndicationsActivate}
      onkeydown={handleGeoIndicationsKeyDown}
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
            font-size="12"
            font-weight="bold"
            fill={orientationColor}
            font-family="Arial, sans-serif"
          >
            N
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
            font-size="10"
            font-weight="bold"
            fill={orientationColor}
            font-family="Arial, sans-serif"
          >
            N
          </text>
        {/if}
      </svg>
    </div>
  {/if}

  {#if geoIndicationsState.visible && geoIndicationsState.insetMap.enabled}
    <div
      bind:this={insetMapElement}
      class="inset-map-panel"
      class:draggable={isGeoIndicationsActive}
      class:dragging={currentDrag === 'inset'}
      style="background-color: {insetPanelBackgroundColor}; border: 1px solid {insetPanelBorderColor};{geoIndicationsState
        .insetMap.dragPosition
        ? ` left: ${geoIndicationsState.insetMap.dragPosition.x}px; top: ${geoIndicationsState.insetMap.dragPosition.y}px; bottom: auto; right: auto;`
        : ''}"
      role="button"
      tabindex="0"
      aria-label={m.tool_geo_indications()}
      onclick={handleGeoIndicationsActivate}
      onkeydown={handleGeoIndicationsKeyDown}
      onpointerdown={handleInsetMapPointerDown}
    >
      <div
        class="inset-map {geoIndicationsState.insetMap.type ===
        InsetMapType.GLOBE
          ? 'inset-map-globe'
          : 'inset-map-planisphere'}"
        style="width: {insetDimensions.width}px; height: {insetDimensions.height}px;"
      >
        <svg
          class="inset-map-svg"
          width={insetDimensions.width}
          height={insetDimensions.height}
          viewBox="0 0 {insetDimensions.width} {insetDimensions.height}"
        >
          {#if geoIndicationsState.insetMap.type === InsetMapType.GLOBE}
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
            </g>
            <path class="inset-outline" d={insetRenderState.spherePath}></path>
            {#if insetRenderState.viewportPath}
              <path
                class="inset-window-path"
                d={insetRenderState.viewportPath}
                fill="none"
                stroke={insetWindowColor}
                stroke-width={insetRenderState.windowStrokeWidth}
              ></path>
            {/if}
          {:else}
            <rect
              x="0"
              y="0"
              width={insetDimensions.width}
              height={insetDimensions.height}
              fill={insetSeaColor}
            ></rect>
            {#each insetRenderState.landPaths as landPath, index (index)}
              <path
                class="inset-land-path"
                d={landPath}
                fill={insetContinentColor}
                stroke={insetContinentColor}
                stroke-width={insetRenderState.landStrokeWidth}
              ></path>
            {/each}
            <rect
              class="inset-outline"
              x="0.5"
              y="0.5"
              width={insetDimensions.width - 1}
              height={insetDimensions.height - 1}
              rx="6"
              ry="6"
            ></rect>
            {#if insetRenderState.viewportPath}
              <path
                class="inset-window-path"
                d={insetRenderState.viewportPath}
                fill="none"
                stroke={insetWindowColor}
                stroke-width={insetRenderState.windowStrokeWidth}
              ></path>
            {:else if insetRenderState.worldViewport}
              <rect
                class="inset-window-path"
                x={INSET_WORLD_WINDOW_INSET}
                y={INSET_WORLD_WINDOW_INSET}
                width={Math.max(
                  1,
                  insetDimensions.width - INSET_WORLD_WINDOW_INSET * 2
                )}
                height={Math.max(
                  1,
                  insetDimensions.height - INSET_WORLD_WINDOW_INSET * 2
                )}
                rx="5"
                ry="5"
                fill="none"
                stroke={insetWindowColor}
                stroke-width={insetRenderState.windowStrokeWidth}
              ></rect>
            {/if}
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

  .scale-bar {
    position: absolute;
    bottom: 16px;
    left: 16px;
    background: rgba(255, 255, 255, 0.85);
    padding: 4px 6px;
    border-radius: 4px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
    pointer-events: auto;
    cursor: pointer;
    touch-action: none;
    outline: none;
  }

  .north-arrow {
    position: absolute;
    top: 16px;
    right: 16px;
    background: rgba(255, 255, 255, 0.85);
    padding: 6px;
    border-radius: 4px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
    pointer-events: auto;
    cursor: pointer;
    touch-action: none;
    outline: none;
  }

  .inset-map-panel {
    position: absolute;
    bottom: 16px;
    right: 16px;
    background: rgba(255, 255, 255, 0.85);
    padding: 6px;
    border-radius: 4px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
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

  .inset-map-planisphere {
    border-radius: 6px;
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

  .inset-window-path {
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .inset-outline {
    fill: none;
    stroke: rgba(22, 22, 22, 0.24);
    stroke-width: 1;
  }
</style>
