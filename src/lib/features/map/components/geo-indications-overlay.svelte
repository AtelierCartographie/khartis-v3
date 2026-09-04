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
  import { KEY } from '$lib/features/commons/constants/dom.constants';
  import {
    PAGE_GRID_SIZE_PX,
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
    getNorthBearingAtCenter,
    getScaleMetersPerPixel,
    getSuggestedScaleDistance,
    getInsetMapFrameOutline,
    getInsetMapGeographicBounds,
    INSET_MAP_SIZE_LIMITS,
    isInsetMapAvailableForViewport,
    SCALE_MAX_WIDTH_PX,
    toDistanceMeters
  } from '$lib/features/step-toolbar/tools/geo-indications';
  import { onDestroy, tick, untrack } from 'svelte';
  import * as d3geo from 'd3-geo';
  import type { GeoPermissibleObjects, GeoProjection } from 'd3-geo';
  import type {
    Feature,
    FeatureCollection,
    GeoJsonProperties,
    LineString,
    MultiPolygon,
    Polygon,
    Position
  } from 'geojson';
  import { activateStylingToolFromMap } from '../utils/styling-tool-activation.utils';
  import {
    getElementCenteringDelta,
    getFocusViewportElement
  } from '../utils/focus-viewport.utils';
  import {
    areDraggablePageItemPointsEqual,
    createDraggablePageItemController
  } from '../utils/use-draggable-page-item';
  import { getKeyboardMoveDelta } from '../utils/keyboard-position.utils';
  import { getLegendState } from '$lib/features/step-toolbar/tools/legend';
  import * as m from '$lib/paraglide/messages';
  import { GEOJSON_TYPE } from '$lib/features/commons/constants';
  import { loadWorldLandGeometry } from '$lib/features/commons/utils/world-land-geometry';
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
  const SCALE_BAR_THICKNESS = 8;
  const SCALE_SVG_BOTTOM_PADDING = 2;
  // Slightly high glyph-width estimate avoids clipping fully derived scale labels.
  const SCALE_CHAR_WIDTH_RATIO = 0.62;
  const SCALE_SEGMENTS = Array.from(
    { length: SCALE_SEGMENT_COUNT },
    (_, index) => index
  );
  const INSET_MAP_PADDING = 4;
  const INSET_MAP_WORLD_SPAN_EPSILON = 359.5;
  const INSET_ZOOM_SCALE = 1.2;
  const INSET_EXTENT_POINT_RADIUS = 4;
  const INSET_EXTENT_MIN_SIZE = 8;
  const INSET_OUTLINE_MIN_POINTS = 4;
  const INSET_POINT_BOUNDS_EPSILON = 0.000001;
  const INSET_WINDOW_STROKE_MIN = 1.2;
  const INSET_WINDOW_STROKE_MAX = 3;
  const INSET_LAND_STROKE_MIN = 0.35;
  const INSET_LAND_STROKE_MAX = 0.8;
  const ORIENTATION_MIN_SIZE_PX = 14;
  const ORIENTATION_MAX_SIZE_PX = 84;
  const GEO_INDICATION_DRAG_THRESHOLD_PX = 3;
  const GEO_INDICATION_CLICK_SUPPRESSION_MS = 120;

  type WorldFeatureCollection = FeatureCollection<
    Polygon | MultiPolygon,
    GeoJsonProperties
  >;
  type InsetViewportFeature = Feature<
    Polygon | MultiPolygon | LineString,
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

  const SPHERE_HALF_AREA_STERADIANS = 2 * Math.PI;
  const WORLD_SPHERE: GeoPermissibleObjects = { type: 'Sphere' };
  const INSET_GRATICULE = d3geo.geoGraticule().step([20, 20])();
  const EMPTY_GEOJSON_PROPERTIES: GeoJsonProperties = {};
  const componentId = $props.id();
  const insetClipId = `inset-geo-${componentId}`;

  let worldFeatures = $state<WorldFeatureCollection | null>(null);
  let mapViewRevision = $state(0);
  let worldFeaturesLoadStarted = false;
  let worldFeaturesLoadGeneration = 0;

  async function loadWorldFeatures(generation: number): Promise<void> {
    try {
      const geometry = await loadWorldLandGeometry();
      if (generation === worldFeaturesLoadGeneration && geometry) {
        worldFeatures = toWorldFeatureCollection(geometry.land);
      }
    } catch (error) {
      if (generation === worldFeaturesLoadGeneration) {
        logger.error(
          'Failed to load inset world basemap',
          LogCategory.MAP,
          error
        );
        worldFeatures = null;
      }
    }
  }

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

    const collection = payload as WorldFeatureCollection;
    return {
      ...collection,
      features: collection.features.map(rewindFeatureForSphericalClip)
    };
  }

  /**
   * d3-geo's spherical clip reads a counterclockwise exterior ring — the
   * GeoJSON RFC 7946 winding of the catalog basemaps — as the complement of the
   * polygon, so each country would paint the whole visible hemisphere.
   */
  function rewindFeatureForSphericalClip(
    feature: WorldFeatureCollection['features'][number]
  ): WorldFeatureCollection['features'][number] {
    const { geometry } = feature;
    if (!geometry) {
      return feature;
    }

    if (geometry.type === GEOJSON_TYPE.POLYGON) {
      const rewound = rewindPolygonRings(geometry.coordinates);
      return rewound === geometry.coordinates
        ? feature
        : { ...feature, geometry: { ...geometry, coordinates: rewound } };
    }

    if (geometry.type === GEOJSON_TYPE.MULTI_POLYGON) {
      let didRewind = false;
      const coordinates = geometry.coordinates.map((rings) => {
        const rewound = rewindPolygonRings(rings);
        if (rewound !== rings) {
          didRewind = true;
        }
        return rewound;
      });

      return didRewind
        ? { ...feature, geometry: { ...geometry, coordinates } }
        : feature;
    }

    return feature;
  }

  function rewindPolygonRings(rings: Position[][]): Position[][] {
    const area = d3geo.geoArea({
      type: GEOJSON_TYPE.POLYGON,
      coordinates: rings
    });

    return area > SPHERE_HALF_AREA_STERADIANS
      ? rings.map((ring) => [...ring].reverse())
      : rings;
  }

  function normalizeLongitude(longitude: number): number {
    const normalized = ((((longitude + 180) % 360) + 360) % 360) - 180;
    return normalized === -180 && longitude > 0 ? 180 : normalized;
  }

  function getMapFramingContext() {
    return {
      isProjectedCoordinates: projectionStore.isProjectedCoordinates,
      projection: projectionStore.renderProjection
    };
  }

  function getCurrentFrameOutline(): Position[] | null {
    return getInsetMapFrameOutline(
      mapInstanceStore.getMapBounds(),
      getMapFramingContext()
    );
  }

  function getCurrentMapBounds(): MapBounds | null {
    const mapBounds = mapInstanceStore.getMapBounds();
    const bounds = getInsetMapGeographicBounds(
      mapBounds,
      getMapFramingContext()
    );
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

  function buildViewportFeature(
    bounds: MapBounds,
    outline: Position[] | null
  ): InsetViewportFeature {
    if (outline && outline.length >= INSET_OUTLINE_MIN_POINTS) {
      return {
        type: GEOJSON_TYPE.FEATURE,
        properties: EMPTY_GEOJSON_PROPERTIES,
        geometry: {
          type: GEOJSON_TYPE.LINE_STRING,
          coordinates: [...outline, outline[0]]
        }
      };
    }

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
    return INSET_ZOOM_SCALE;
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
    // Keep auto-tuned distances synced until the user overrides the value.
    if (currentDistance <= 0 || geoIndicationsState.scale.autoTuned) {
      const suggested = getSuggestedScaleDistance(
        geoIndicationsState.scale.units,
        getCurrentScaleDistanceContext()
      );
      // Persist only valid measurements; basemap-load transitions can be bogus.
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
  // Widen the SVG to the larger of the bar and estimated label width.
  const scaleLabelWidth = $derived(
    Math.ceil(scaleLabel.length * scaleFontSize * SCALE_CHAR_WIDTH_RATIO)
  );
  const scaleContentWidth = $derived(Math.max(scaleBarWidth, scaleLabelWidth));
  const scaleSvgWidth = $derived(scaleContentWidth + SCALE_PADDING * 2);
  const scaleBarStartX = $derived(
    SCALE_PADDING + (scaleContentWidth - scaleBarWidth) / 2
  );
  const scaleLabelX = $derived(scaleSvgWidth / 2);

  // Vertical layout follows font size so large labels stay inside the SVG.
  const scaleLabelBaselineY = $derived(scaleFontSize);
  const scaleLabelGap = $derived(Math.max(4, Math.round(scaleFontSize * 0.35)));
  const scaleBarTopY = $derived(scaleLabelBaselineY + scaleLabelGap);
  const scaleLineY = $derived(scaleBarTopY + SCALE_BAR_THICKNESS / 2);
  const scaleSvgHeight = $derived(
    scaleBarTopY + SCALE_BAR_THICKNESS + SCALE_SVG_BOTTOM_PADDING
  );

  const orientationSize = $derived.by(() => {
    const rawSize = toFiniteNumber(geoIndicationsState.orientation.size, 10);
    const sizeInPx = rawSize * MM_TO_PAGE_PX;
    return Math.round(
      clamp(sizeInPx, ORIENTATION_MIN_SIZE_PX, ORIENTATION_MAX_SIZE_PX)
    );
  });

  // North orientation follows the current framing and projection like the scale bar.
  const orientationAngle = $derived.by(() => {
    const _revision = mapViewRevision;
    const _zoomLevel = mapInstanceStore.zoomLevel;
    void _revision;
    void _zoomLevel;

    return getNorthBearingAtCenter(getCurrentScaleDistanceContext()) ?? 0;
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
  // Drag positions are logical page coordinates; figures are not CSS-scaled.
  const scaleStyle = $derived.by(() => {
    if (geoIndicationsState.scale.dragPosition) {
      const scale = getPageScale();
      return `left: ${geoIndicationsState.scale.dragPosition.x * scale}px; top: ${geoIndicationsState.scale.dragPosition.y * scale}px; bottom: auto; right: auto;`;
    }

    return getDefaultScaleStyle(placementContext);
  });
  const orientationStyle = $derived.by(() => {
    if (geoIndicationsState.orientation.dragPosition) {
      const scale = getPageScale();
      return `left: ${geoIndicationsState.orientation.dragPosition.x * scale}px; top: ${geoIndicationsState.orientation.dragPosition.y * scale}px; bottom: auto; right: auto;`;
    }

    return getDefaultOrientationStyle(placementContext);
  });

  const insetPanelStyle = $derived.by(() => {
    const styles = [getDefaultInsetStyle(placementContext)];

    if (geoIndicationsState.insetMap.dragPosition) {
      const scale = getPageScale();
      styles.push(
        `left: ${geoIndicationsState.insetMap.dragPosition.x * scale}px`,
        `top: ${geoIndicationsState.insetMap.dragPosition.y * scale}px`,
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

    const viewportFeature = mapBounds
      ? buildViewportFeature(mapBounds, getCurrentFrameOutline())
      : null;
    const viewportProjectedBounds = viewportFeature
      ? path.bounds(viewportFeature)
      : null;
    const viewportWidth = viewportProjectedBounds
      ? viewportProjectedBounds[1][0] - viewportProjectedBounds[0][0]
      : 0;
    const viewportHeight = viewportProjectedBounds
      ? viewportProjectedBounds[1][1] - viewportProjectedBounds[0][1]
      : 0;
    // Only a framing too small in both directions is unreadable as an
    // outline; a flat or narrow one still says where the map looks.
    const shouldRenderViewportPoint =
      !!mapBounds &&
      (!Number.isFinite(viewportWidth) ||
        !Number.isFinite(viewportHeight) ||
        (viewportWidth < INSET_EXTENT_MIN_SIZE &&
          viewportHeight < INSET_EXTENT_MIN_SIZE));
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

    return isInsetMapAvailableForViewport(mapInstanceStore.getMapBounds(), {
      isProjectedCoordinates: projectionStore.isProjectedCoordinates,
      projection: projectionStore.renderProjection
    });
  });

  $effect(() => {
    if (
      !geoIndicationsState.visible ||
      !geoIndicationsState.insetMap.enabled ||
      !insetMapAvailable ||
      worldFeatures ||
      worldFeaturesLoadStarted
    ) {
      return;
    }

    worldFeaturesLoadStarted = true;
    const generation = ++worldFeaturesLoadGeneration;
    untrack(() => {
      void loadWorldFeatures(generation);
    });
  });

  type DragTarget = 'scale' | 'orientation' | 'inset';

  let overlayElement = $state<HTMLDivElement | null>(null);
  let scaleElement = $state<HTMLDivElement | null>(null);
  let orientationElement = $state<HTMLDivElement | null>(null);
  let insetMapElement = $state<HTMLDivElement | null>(null);
  let currentDrag = $state<DragTarget | null>(null);
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  let currentDragMoved = false;
  let suppressedClickGeoTarget: DragTarget | null = null;
  let suppressedClickTimeoutId: ReturnType<typeof setTimeout> | null = null;
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

  function getKeyboardMoveStep(): number {
    return formatState.gridEnabled ? PAGE_GRID_SIZE_PX : 1;
  }

  function getKeyboardFastMoveStep(): number {
    return formatState.gridEnabled ? PAGE_GRID_SIZE_PX * 5 : 10;
  }

  function getOverlaySize(): { width: number; height: number } | null {
    if (!overlayElement) {
      return null;
    }

    // Convert screen-pixel dimensions to logical page units for drag bounds.
    const scale = getPageScale();
    return {
      width: overlayElement.offsetWidth / scale,
      height: overlayElement.offsetHeight / scale
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

  function getKeyboardDragPosition(
    target: DragTarget
  ): { x: number; y: number } | null {
    const dragPosition = getDragPosition(target);
    if (dragPosition) {
      return dragPosition;
    }

    const dragElement = getDragElement(target);
    if (!overlayElement || !dragElement) {
      return null;
    }

    const scale = getPageScale();
    const overlayRect = overlayElement.getBoundingClientRect();
    const elementRect = dragElement.getBoundingClientRect();

    return {
      x: (elementRect.left - overlayRect.left) / scale,
      y: (elementRect.top - overlayRect.top) / scale
    };
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

    // Convert screen-size elements to logical page units for drag bounds.
    const scale = getPageScale();
    return snapPointWithinBounds(
      position,
      getDragBounds(overlaySize, {
        width: dragElement.offsetWidth / scale,
        height: dragElement.offsetHeight / scale
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

    if (!areDraggablePageItemPointsEqual(normalizedPosition, dragPosition)) {
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

  function clearSuppressedGeoIndicationsClick(): void {
    if (suppressedClickTimeoutId) {
      clearTimeout(suppressedClickTimeoutId);
      suppressedClickTimeoutId = null;
    }

    suppressedClickGeoTarget = null;
  }

  function suppressNextGeoIndicationsClick(target: DragTarget): void {
    clearSuppressedGeoIndicationsClick();
    suppressedClickGeoTarget = target;
    suppressedClickTimeoutId = setTimeout(() => {
      suppressedClickTimeoutId = null;
      suppressedClickGeoTarget = null;
    }, GEO_INDICATION_CLICK_SUPPRESSION_MS);
  }

  function suppressCurrentGeoIndicationsClickAfterDrag(): void {
    const completedDrag = currentDrag;
    const shouldSuppressClick = currentDragMoved;

    if (completedDrag && shouldSuppressClick) {
      suppressNextGeoIndicationsClick(completedDrag);
    }
  }

  function trackGeoIndicationsDragMove(event: PointerEvent): void {
    if (!currentDrag) {
      return;
    }

    const pointerDistance = Math.hypot(
      event.clientX - dragStartClientX,
      event.clientY - dragStartClientY
    );

    if (
      !currentDragMoved &&
      pointerDistance >= GEO_INDICATION_DRAG_THRESHOLD_PX
    ) {
      currentDragMoved = true;
    }
  }

  const geoIndicationsDragController = createDraggablePageItemController({
    getOverlayElement: () => overlayElement,
    getPageScale,
    getCurrentPosition: () =>
      currentDrag ? getDragPosition(currentDrag) : null,
    normalizePosition: (position) =>
      currentDrag ? normalizeDragPosition(currentDrag, position) : position,
    setPosition: (position) => {
      if (currentDrag) {
        setDragPosition(currentDrag, position);
      }
    },
    onDraggingChange: (active) => {
      if (active) {
        return;
      }

      currentDrag = null;
      currentDragMoved = false;
    },
    onPointerMove: trackGeoIndicationsDragMove,
    onPointerUp: suppressCurrentGeoIndicationsClickAfterDrag
  });

  function stopDragging(): void {
    geoIndicationsDragController.stop();
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

    dragStartClientX = event.clientX;
    dragStartClientY = event.clientY;
    currentDragMoved = false;
    currentDrag = target;

    const started = geoIndicationsDragController.start({
      event,
      itemElement: element
    });

    if (!started) {
      currentDrag = null;
      currentDragMoved = false;
    }
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
    if (suppressedClickGeoTarget === target) {
      event.preventDefault();
      event.stopPropagation();
      clearSuppressedGeoIndicationsClick();
      return;
    }

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

  function moveGeoIndicationWithKeyboard(
    event: KeyboardEvent,
    target: DragTarget
  ): boolean {
    const delta = getKeyboardMoveDelta(
      event,
      getKeyboardMoveStep(),
      getKeyboardFastMoveStep()
    );
    if (!delta) {
      return false;
    }

    const currentPosition = getKeyboardDragPosition(target);
    if (!currentPosition) {
      return false;
    }

    event.preventDefault();
    handleGeoIndicationsActivate(event);
    setDragPosition(
      target,
      normalizeDragPosition(target, {
        x: currentPosition.x + delta.x,
        y: currentPosition.y + delta.y
      })
    );
    return true;
  }

  function handleGeoIndicationsKeyDown(
    event: KeyboardEvent,
    target: DragTarget
  ): void {
    if (moveGeoIndicationWithKeyboard(event, target)) {
      return;
    }

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
    worldFeaturesLoadGeneration += 1;
    centeredGeoTarget = null;
    clearSuppressedGeoIndicationsClick();
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
      aria-label={m.geo_scale_bar_aria()}
      onclick={(event: MouseEvent) => handleGeoIndicationsClick(event, 'scale')}
      onblur={() => handleGeoIndicationsBlur('scale')}
      onkeydown={(event: KeyboardEvent) =>
        handleGeoIndicationsKeyDown(event, 'scale')}
      onpointerdown={handleScalePointerDown}
    >
      <svg
        width={scaleSvgWidth}
        height={scaleSvgHeight}
        aria-label={m.geo_scale_bar_aria()}
      >
        {#if geoIndicationsState.scale.form === ScaleForm.BOX}
          <text
            x={scaleLabelX}
            y={scaleLabelBaselineY}
            text-anchor="middle"
            fill={scaleColor}
            font-size={scaleFontSize}
            font-family={scaleFontFamily}
          >
            {scaleLabel}
          </text>
          {#each SCALE_SEGMENTS as segment (segment)}
            <rect
              x={scaleBarStartX + segment * scaleSegmentWidth}
              y={scaleBarTopY}
              width={scaleSegmentWidth}
              height={SCALE_BAR_THICKNESS}
              fill={segment % 2 === 0 ? scaleColor : 'transparent'}
              stroke={scaleColor}
              stroke-width="1.5"
            />
          {/each}
        {:else}
          <line
            x1={scaleBarStartX}
            y1={scaleLineY}
            x2={scaleBarStartX + scaleBarWidth}
            y2={scaleLineY}
            stroke={scaleColor}
            stroke-width="2"
          />
          <text
            x={scaleLabelX}
            y={scaleLabelBaselineY}
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
      aria-label={m.geo_north_indicator_aria()}
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
        style="overflow: visible;"
        aria-label={m.geo_north_indicator_aria()}
      >
        <g transform={`rotate(${orientationAngle.toFixed(1)} 20 25)`}>
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
        </g>
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
      aria-label={m.geo_inset_map()}
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
              <path
                d={insetRenderState.spherePath}
                fill="none"
                style="fill: none;"
              ></path>
            </clipPath>
          </defs>
          <path
            d={insetRenderState.spherePath}
            fill={insetSeaColor}
            style={`fill: ${insetSeaColor};`}
          ></path>
          <g clip-path={`url(#${insetClipId})`}>
            {#each insetRenderState.landPaths as landPath, index (index)}
              <path
                class="inset-land-path"
                d={landPath}
                fill={insetContinentColor}
                stroke={insetContinentColor}
                stroke-width={insetRenderState.landStrokeWidth}
                opacity="0.95"
                vector-effect="non-scaling-stroke"
                style={`fill: ${insetContinentColor}; stroke: ${insetContinentColor};`}
              ></path>
            {/each}
            {#if insetRenderState.graticulePath}
              <path
                class="inset-graticule-path"
                d={insetRenderState.graticulePath}
                fill="none"
                stroke="rgba(0, 0, 0, 0.3)"
                stroke-width="0.5"
                vector-effect="non-scaling-stroke"
                style="fill: none; stroke: rgba(0, 0, 0, 0.3); stroke-width: 0.5; vector-effect: non-scaling-stroke;"
              ></path>
            {/if}
          </g>
          <path
            class="inset-outline"
            d={insetRenderState.spherePath}
            fill="none"
            stroke="rgba(0, 0, 0, 0.3)"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
            style="fill: none; stroke: rgba(0, 0, 0, 0.3); stroke-width: 1; vector-effect: non-scaling-stroke;"
          ></path>
          {#if insetRenderState.viewportPath}
            <path
              class="inset-extent-path"
              d={insetRenderState.viewportPath}
              fill="none"
              stroke={insetWindowColor}
              stroke-width={insetRenderState.windowStrokeWidth}
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
              style={`fill: none; stroke: ${insetWindowColor};`}
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
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
              style={`fill: ${insetWindowColor}; stroke: ${insetWindowColor};`}
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
