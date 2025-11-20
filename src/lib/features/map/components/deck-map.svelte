<script lang="ts">
  import type { Color, DeckProps, Layer } from '@deck.gl/core';
  import { GeoJsonLayer } from '@deck.gl/layers';
  import { MapboxOverlay } from '@deck.gl/mapbox';
  import * as geodecklayers from '@geoarrow/deck.gl-layers';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import type { FeatureCollection } from 'geojson';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onMount } from 'svelte';
  import { basemapStyleStore } from '../../commons/store/basemap-style.store.svelte';
  import { datasetsStore } from '../../commons/store/datasets.store.svelte';
  import {
    globalActions,
    globalState
  } from '../../commons/store/global.svelte';
  import { mapInstanceStore } from '../../commons/store/map-instance.store.svelte';
  import { visualizationStore } from '../../commons/store/visualization.store.svelte';
  import { hexToRgb } from '../../commons/utils/color-utils';
  import { LogCategory, logger } from '../../commons/utils/logger';
  import {
    BASEMAP_STYLES,
    DEFAULT_BASEMAP_STYLE
  } from '../configs/basemap-styles';
  import {
    getCategoricalColorMap,
    getColorForValue,
    getSizeForValue,
    shouldApplyCategorical,
    shouldApplyChoropleth,
    shouldApplyProportionalSymbols
  } from '../utils/data-styling.utils';
  import {
    calculateBoundsFromGeoArrow,
    calculateBoundsFromGeoJSON
  } from '../utils/map-controls.utils';
  import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
  import {
    createOSMRasterSource,
    createOSMRasterLayer
  } from '../services/osm-tile.service';

  const MAP_CENTER_STORAGE_KEY = 'khartis_map_center';
  const MAP_ZOOM_STORAGE_KEY = 'khartis_maplibre_zoom';

  function withOpacity(color: number[], opacity = 1): Color {
    const normalized = Math.min(Math.max(opacity, 0), 1);
    const alpha = Math.round(normalized * 255);
    const base = color.slice(0, 3);
    if (color.length === 4) {
      return [...base, alpha] as Color;
    }
    return [...base, alpha] as Color;
  }

  const GEO_TYPE_TO_EXTENSION: Record<string, string> = {
    POINT: 'geoarrow.point',
    MULTIPOINT: 'geoarrow.multipoint',
    LINESTRING: 'geoarrow.linestring',
    MULTILINESTRING: 'geoarrow.multilinestring',
    POLYGON: 'geoarrow.polygon',
    MULTIPOLYGON: 'geoarrow.multipolygon'
  };
  const GEO_EXTENSION_TO_TYPE: Record<string, string> = Object.fromEntries(
    Object.entries(GEO_TYPE_TO_EXTENSION).map(([type, extension]) => [
      extension,
      type
    ])
  );

  function areGeometryTypesCompatible(
    metadataType: string,
    extensionType: string
  ): boolean {
    if (metadataType === extensionType) return true;

    const compatibilityMap: Record<string, string[]> = {
      POINT: ['MULTIPOINT'],
      MULTIPOINT: ['POINT'],
      LINESTRING: ['MULTILINESTRING'],
      MULTILINESTRING: ['LINESTRING'],
      POLYGON: ['MULTIPOLYGON'],
      MULTIPOLYGON: ['POLYGON']
    };

    return compatibilityMap[metadataType]?.includes(extensionType) ?? false;
  }

  type DeckDataRow = Record<string, unknown>;

  interface TooltipEvent {
    object?: DeckDataRow | null;
    x: number;
    y: number;
    coordinate?: [number, number];
  }

  interface DeckMapProps {
    jsTable: ArrowTable | null;
    userGeoJSON: FeatureCollection | null;
  }

  let { jsTable, userGeoJSON }: DeckMapProps = $props();

  let mapContainer: HTMLDivElement;
  let map = $state<maplibregl.Map | null>(null);
  let deckOverlay: MapboxOverlay;
  let isMapLoaded = $state(false);
  let tooltip: HTMLDivElement;
  let lastPendingGeoTable = $state<string | null>(null);

  const activeVisualizations = $derived(
    visualizationStore.activeVisualizations
  );

  const defaultVisualization = $derived(activeVisualizations[0]);
  const datasetId = $derived(defaultVisualization?.datasetId);

  const visualizationVariables = $derived.by(() => {
    if (!defaultVisualization) return [];
    const variables: string[] = [];
    const mapping = defaultVisualization.mapping;
    if (mapping.valueColumn) {
      variables.push(mapping.valueColumn);
    }
    if (mapping.categoryColumn) {
      variables.push(mapping.categoryColumn);
    }
    if (mapping.sizeColumn) {
      variables.push(mapping.sizeColumn);
    }
    if (mapping.colorColumn) {
      variables.push(mapping.colorColumn);
    }
    return variables;
  });

  const memoizedColors = $derived.by(() => {
    const viz = defaultVisualization;
    if (!viz) {
      return {
        fill: [220, 220, 220] as [number, number, number],
        stroke: [255, 255, 255] as [number, number, number]
      };
    }

    return {
      fill: viz.style.fillColor
        ? hexToRgb(viz.style.fillColor as string)
        : ([220, 220, 220] as [number, number, number]),
      stroke: viz.style.strokeColor
        ? hexToRgb(viz.style.strokeColor)
        : ([255, 255, 255] as [number, number, number])
    };
  });

  const memoizedStatistics = $derived.by(() => {
    const viz = defaultVisualization;
    if (!viz || !viz.mapping.sizeColumn || !datasetId) {
      return { min: 0, max: 100 };
    }

    const stats = datasetsStore.getColumnStatistics(
      datasetId,
      viz.mapping.sizeColumn
    );

    if (
      stats &&
      'min' in stats &&
      'max' in stats &&
      typeof stats.min === 'number' &&
      typeof stats.max === 'number'
    ) {
      return { min: stats.min, max: stats.max };
    }

    return { min: 0, max: 100 };
  });

  const memoizedCategoryColorMap = $derived.by(() => {
    const viz = defaultVisualization;
    if (!viz || !viz.mapping.categoryColumn || !datasetId) {
      return null;
    }

    const useCategoricalColor = shouldApplyCategorical(viz);
    if (!useCategoricalColor || !viz.classification?.colors) {
      return null;
    }

    const categories = datasetsStore
      .getUniqueValues(datasetId, viz.mapping.categoryColumn)
      .map(String);

    return getCategoricalColorMap(categories, viz.classification.colors);
  });

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'object') return '';
    if (typeof value === 'number') {
      return value.toLocaleString('fr-FR', {
        maximumFractionDigits: 2
      });
    }
    return String(value);
  }

  const MAX_SECONDARY_FIELDS = 3;
  const SECONDARY_PRIORITY_KEYWORDS = ['name', 'nom', 'label', 'iso', 'code'];

  function hideTooltip(): void {
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  }

  // OPTIMIZATION: Extract accessor functions to avoid closure creation on every render
  function createCategoricalColorAccessor(
    categoryColumn: string,
    colorMap: Map<string, [number, number, number]> | null
  ) {
    return (object: DeckDataRow): [number, number, number] => {
      const category = object[categoryColumn];
      return colorMap?.get(String(category)) ?? [128, 128, 128];
    };
  }

  function createProportionalSizeAccessor(
    sizeColumn: string,
    minValue: number,
    maxValue: number,
    minSize: number,
    maxSize: number,
    sizeScale: 'linear' | 'sqrt' | 'log'
  ) {
    return (object: DeckDataRow): number => {
      const rawValue = object[sizeColumn];
      const numericValue =
        typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        return minSize;
      }
      return getSizeForValue(
        numericValue,
        minValue,
        maxValue,
        minSize,
        maxSize,
        sizeScale
      );
    };
  }

  function createChoroplethColorAccessor(
    valueColumn: string,
    breaks: number[],
    colors: string[]
  ) {
    return (object: DeckDataRow): [number, number, number] => {
      const rawValue = object[valueColumn];
      const numericValue =
        typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        return [200, 200, 200];
      }
      return getColorForValue(numericValue, breaks, colors);
    };
  }

  function updateTooltip({ object, x, y, coordinate }: TooltipEvent) {
    if (!tooltip) return;

    if (object) {
      const {
        geom: _geom,
        geometry: _geometry,
        ...attributes
      } = object as DeckDataRow;

      const primaryData: Array<[string, unknown]> = [];
      const secondaryData: Array<[string, unknown]> = [];

      Object.entries(attributes).forEach(([key, value]) => {
        if (typeof value === 'object') return;

        if (visualizationVariables.includes(key)) {
          primaryData.push([key, value]);
        } else if (key !== '__id') {
          secondaryData.push([key, value]);
        }
      });

      let html = '';

      if (primaryData.length > 0) {
        primaryData.forEach(([key, value]) => {
          html += `
            <div style="display: flex; justify-content: space-between; gap: 16px; margin-bottom: 6px;">
              <span style="color: #525252; font-weight: 600;">${key}:</span>
              <span style="color: #0f62fe; font-weight: 700; font-size: 14px;">${formatValue(value)}</span>
            </div>
          `;
        });
        if (secondaryData.length > 0) {
          html +=
            '<div style="border-top: 1px solid #e0e0e0; margin: 8px 0;"></div>';
        }
      }

      if (secondaryData.length > 0) {
        const prioritized = secondaryData.filter(([key]) =>
          SECONDARY_PRIORITY_KEYWORDS.some((kw) =>
            key.toLowerCase().includes(kw)
          )
        );
        const remaining = secondaryData.filter(
          ([key]) => !prioritized.some(([pk]) => pk === key)
        );
        const limitedSecondary = [
          ...prioritized.slice(0, MAX_SECONDARY_FIELDS),
          ...remaining.slice(
            0,
            Math.max(0, MAX_SECONDARY_FIELDS - prioritized.length)
          )
        ];

        limitedSecondary.forEach(([key, value]) => {
          html += `
            <div style="display: flex; justify-content: space-between; gap: 16px; margin-bottom: 4px;">
              <span style="color: #525252; font-weight: 600; font-size: 12px;">${key}:</span>
              <span style="color: #161616; font-size: 12px;">${formatValue(value)}</span>
            </div>
          `;
        });
      }

      if (coordinate && coordinate.length >= 2) {
        html +=
          '<div style="border-top: 1px solid #e0e0e0; margin: 8px 0;"></div>';
        html += `
          <div style="display: flex; justify-content: space-between; gap: 16px; margin-bottom: 4px;">
            <span style="color: #525252; font-weight: 600; font-size: 11px;">Longitude:</span>
            <span style="color: #161616; font-size: 11px;">${coordinate[0].toFixed(4)}°</span>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 16px;">
            <span style="color: #525252; font-weight: 600; font-size: 11px;">Latitude:</span>
            <span style="color: #161616; font-size: 11px;">${coordinate[1].toFixed(4)}°</span>
          </div>
        `;
      }

      tooltip.innerHTML = html;
      tooltip.style.display = 'block';
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    } else {
      hideTooltip();
    }
  }

  function normalizeTooltipCoordinate(
    coordinate?: number[] | null
  ): [number, number] | undefined {
    if (
      Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      typeof coordinate[0] === 'number' &&
      typeof coordinate[1] === 'number'
    ) {
      return [coordinate[0], coordinate[1]];
    }
    return undefined;
  }

  function handleDeckHover(pickingInfo: {
    object?: unknown;
    coordinate?: number[] | null;
    x?: number;
    y?: number;
  }): void {
    updateTooltip({
      object: (pickingInfo.object as DeckDataRow) ?? null,
      x: pickingInfo.x ?? 0,
      y: pickingInfo.y ?? 0,
      coordinate: normalizeTooltipCoordinate(pickingInfo.coordinate)
    });
  }

  function createDeckLayers(jsTable: ArrowTable): Layer<DeckDataRow>[] {
    const geoMetadata = jsTable.schema.metadata?.get('geo');

    const hasUserDataset = Boolean(datasetId);

    if (!geoMetadata) {
      const schemaMetadata = jsTable.schema.metadata;
      const metadataDetails = {
        hasSchemaMetadata: !!schemaMetadata,
        metadataKeys: schemaMetadata ? Array.from(schemaMetadata.keys()) : [],
        schemaFields: jsTable.schema.fields.map((f) => f.name),
        numRows: jsTable.numRows,
        datasetId
      };

      if (hasUserDataset) {
        logger.error(
          'No GeoArrow metadata in Arrow table',
          LogCategory.MAP,
          metadataDetails
        );
      }

      // Try to find geometry column manually as fallback diagnostic
      const geomColumn = jsTable.schema.fields.find(
        (f) => f.name === 'geom' || f.name === 'geometry'
      );

      if (!geomColumn && hasUserDataset) {
        logger.error('No geometry column found in table', LogCategory.MAP);
      }

      return [];
    }

    try {
      const jsonMeta = JSON.parse(geoMetadata);
      const geoColumn = jsonMeta.primary_column;
      const geometryType = jsonMeta.columns[geoColumn].geometry_types[0];
      const normalizedGeometryType = geometryType.toUpperCase();
      const geometryField = jsTable.schema.fields.find(
        (field) => field.name === geoColumn
      );
      const arrowExtensionRaw =
        geometryField?.metadata?.get('ARROW:extension:name') ?? null;
      const arrowExtension = arrowExtensionRaw
        ? arrowExtensionRaw.toLowerCase()
        : null;
      const expectedExtension =
        GEO_TYPE_TO_EXTENSION[normalizedGeometryType] ?? null;
      const extensionGeometryType = arrowExtension
        ? GEO_EXTENSION_TO_TYPE[arrowExtension]
        : null;
      const hasMatchingGeoExtension =
        arrowExtension && expectedExtension
          ? arrowExtension === expectedExtension ||
            (extensionGeometryType
              ? areGeometryTypesCompatible(
                  normalizedGeometryType,
                  extensionGeometryType
                )
              : false)
          : false;
      const resolvedGeometryType =
        extensionGeometryType ?? normalizedGeometryType;

      if (!hasMatchingGeoExtension && hasUserDataset) {
        logger.warn('Geometry extension mismatch detected', LogCategory.MAP, {
          geometryType: resolvedGeometryType,
          arrowExtension,
          expectedExtension
        });

        // Validate that we can extract geometry manually if extension is missing
        const geometryField = jsTable.schema.fields.find(
          (field) => field.name === geoColumn
        );
        const geometryVector = geometryField
          ? jsTable.getChild(geoColumn)
          : null;

        if (!geometryVector) {
          logger.error(
            'Cannot render geometry: missing proper GeoArrow extension metadata and unable to extract geometry column',
            LogCategory.MAP,
            {
              geometryType: resolvedGeometryType,
              geoColumn,
              availableFields: jsTable.schema.fields.map((f) => f.name)
            }
          );
          return [];
        }
      }

      const viz = defaultVisualization;
      // OPTIMIZATION: Use memoized colors instead of converting on every call
      const fillColor = memoizedColors.fill;
      const strokeColor = memoizedColors.stroke;
      const fillOpacity: number = viz?.style.fillOpacity ?? 0.6;
      const strokeWidth: number = viz?.style.strokeWidth ?? 1;
      const strokeOpacity: number = viz?.style.strokeOpacity ?? 1;

      let deckLayer: Layer<DeckDataRow>;
      switch (resolvedGeometryType) {
        case 'POINT':
        // falls through

        case 'MULTIPOINT': {
          const pointVector = hasMatchingGeoExtension
            ? null
            : jsTable.getChild(geoColumn);
          if (!hasMatchingGeoExtension && !pointVector) {
            logger.error(
              'Geometry column vector missing for point layer',
              LogCategory.MAP,
              { geoColumn }
            );
            return [];
          }

          const useProportionalSymbols =
            viz && shouldApplyProportionalSymbols(viz);
          const useCategoricalColor = viz && shouldApplyCategorical(viz);

          // OPTIMIZATION: Use memoized statistics instead of querying store
          const minValue = memoizedStatistics.min;
          const maxValue = memoizedStatistics.max;

          // OPTIMIZATION: Use memoized category color map
          const categoryColorMap = memoizedCategoryColorMap;

          // OPTIMIZATION: Use stable, deterministic layer ID for proper updates
          const layerId = `point-layer-${datasetId ?? 'default'}`;

          const scatterplotProps: ConstructorParameters<
            typeof geodecklayers.GeoArrowScatterplotLayer
          >[0] = {
            id: layerId,
            data: jsTable,
            stroked: true,
            // OPTIMIZATION: Use extracted accessor functions
            getFillColor: useCategoricalColor
              ? createCategoricalColorAccessor(
                  viz.mapping.categoryColumn!,
                  categoryColorMap
                )
              : fillColor,
            getLineColor: withOpacity(strokeColor, strokeOpacity),
            opacity: fillOpacity,
            getRadius: useProportionalSymbols
              ? createProportionalSizeAccessor(
                  viz.mapping.sizeColumn!,
                  minValue,
                  maxValue,
                  viz.symbols!.minSize,
                  viz.symbols!.maxSize,
                  viz.symbols!.sizeScale
                )
              : 1,
            radiusScale: useProportionalSymbols ? 1 : 5,
            radiusUnits: 'pixels',
            lineWidthUnits: 'pixels',
            lineWidthScale: strokeWidth / 3,
            pickable: true,
            autoHighlight: true,
            // OPTIMIZATION: Add updateTriggers to tell Deck.gl when to recompute accessors
            updateTriggers: {
              getFillColor: [
                useCategoricalColor,
                viz?.mapping.categoryColumn,
                categoryColorMap,
                fillColor
              ],
              getRadius: [
                useProportionalSymbols,
                viz?.mapping.sizeColumn,
                minValue,
                maxValue,
                viz?.symbols?.minSize,
                viz?.symbols?.maxSize,
                viz?.symbols?.sizeScale
              ],
              getLineColor: [strokeColor, strokeOpacity]
            }
          };

          if (pointVector) {
            scatterplotProps.getPosition = pointVector;
          }

          deckLayer = new geodecklayers.GeoArrowScatterplotLayer(
            scatterplotProps
          );
          break;
        }

        case 'LINESTRING':
        // falls through

        case 'MULTILINESTRING': {
          const pathVector = hasMatchingGeoExtension
            ? null
            : jsTable.getChild(geoColumn);
          if (!hasMatchingGeoExtension && !pathVector) {
            logger.error(
              'Geometry column vector missing for path layer',
              LogCategory.MAP,
              { geoColumn }
            );
            return [];
          }

          // OPTIMIZATION: Use stable, deterministic layer ID
          const layerId = `line-layer-${datasetId ?? 'default'}`;

          const pathProps: ConstructorParameters<
            typeof geodecklayers.GeoArrowPathLayer
          >[0] = {
            id: layerId,
            data: jsTable,
            getColor: fillColor,
            opacity: fillOpacity,
            getWidth: strokeWidth,
            widthUnits: 'pixels',
            widthScale: 1 / 4,
            capRounded: true,
            pickable: true,
            autoHighlight: true,
            // OPTIMIZATION: Add updateTriggers
            updateTriggers: {
              getColor: [fillColor],
              getWidth: [strokeWidth]
            }
          };

          if (pathVector) {
            pathProps.getPath = pathVector;
          }

          deckLayer = new geodecklayers.GeoArrowPathLayer(pathProps);
          break;
        }

        case 'POLYGON':
        // falls through

        case 'MULTIPOLYGON': {
          const polygonVector = hasMatchingGeoExtension
            ? null
            : jsTable.getChild(geoColumn);
          if (!hasMatchingGeoExtension && !polygonVector) {
            logger.error(
              'Geometry column vector missing for polygon layer',
              LogCategory.MAP,
              { geoColumn }
            );
            return [];
          }

          // Additional validation: check if geometry data is compatible
          if (!hasMatchingGeoExtension) {
            logger.warn(
              'Rendering polygon layer without proper GeoArrow extension metadata - using fallback extraction',
              LogCategory.MAP,
              {
                geometryType: resolvedGeometryType,
                geoColumn,
                hasVector: !!polygonVector
              }
            );
          }

          const useChoropleth = viz && shouldApplyChoropleth(viz);

          // OPTIMIZATION: Use stable, deterministic layer ID
          const layerId = `polygon-layer-${datasetId ?? 'default'}`;

          const polygonProps: ConstructorParameters<
            typeof geodecklayers.GeoArrowPolygonLayer
          >[0] = {
            id: layerId,
            data: jsTable,
            // OPTIMIZATION: Use extracted accessor function
            getFillColor: useChoropleth
              ? createChoroplethColorAccessor(
                  viz.mapping.valueColumn!,
                  viz.classification!.breaks!,
                  viz.classification!.colors!
                )
              : fillColor,
            getLineColor: withOpacity(strokeColor, strokeOpacity),
            opacity: fillOpacity,
            lineWidthUnits: 'pixels',
            lineWidthScale: strokeWidth / 4,
            pickable: true,
            autoHighlight: true,
            // OPTIMIZATION: Add updateTriggers
            updateTriggers: {
              getFillColor: [
                useChoropleth,
                viz?.mapping.valueColumn,
                viz?.classification?.breaks,
                viz?.classification?.colors,
                fillColor
              ],
              getLineColor: [strokeColor, strokeOpacity]
            },
            onHover: (pickingInfo, _event) => {
              handleDeckHover(pickingInfo);
            }
          };

          if (polygonVector) {
            polygonProps.getPolygon = polygonVector;
          }

          deckLayer = new geodecklayers.GeoArrowPolygonLayer(polygonProps);
          break;
        }

        default:
          logger.error(
            'Unsupported geometry type for Deck layer',
            LogCategory.MAP,
            {
              geometryType: resolvedGeometryType,
              datasetId
            }
          );
          return [];
      }

      return [deckLayer];
    } catch (error) {
      logger.error('Failed to create Deck.gl layers', LogCategory.MAP, error);
      return [];
    }
  }

  function createGeoJsonLayers(
    geojson: FeatureCollection
  ): Layer<DeckDataRow>[] {
    const viz = defaultVisualization;
    // OPTIMIZATION: Use memoized colors instead of converting on every call
    const fillColor = memoizedColors.fill;
    const strokeColor = memoizedColors.stroke;
    const fillOpacity: number = (viz?.style.fillOpacity ?? 0.6) * 255;
    const strokeWidth: number = viz?.style.strokeWidth ?? 1;

    const layer = new GeoJsonLayer({
      id: 'geojson-layer',
      data: geojson,
      filled: true,
      stroked: true,
      getFillColor: [...fillColor, fillOpacity],
      getLineColor: strokeColor,
      getLineWidth: strokeWidth,
      lineWidthMinPixels: strokeWidth,
      pickable: true,
      autoHighlight: true,
      // OPTIMIZATION: Add updateTriggers
      updateTriggers: {
        getFillColor: [fillColor, fillOpacity],
        getLineColor: [strokeColor],
        getLineWidth: [strokeWidth]
      },
      onHover: (pickingInfo, _event) => {
        handleDeckHover(pickingInfo);
      }
    });

    return [layer];
  }

  function updateMapLayers(
    jsTable: ArrowTable | null,
    geojson: FeatureCollection | null
  ): void {
    if (!deckOverlay || !isMapLoaded) {
      return;
    }

    logger.debug('Updating Deck.gl layers', LogCategory.MAP, {
      hasArrowTable: Boolean(jsTable),
      hasGeoJSON: Boolean(geojson)
    });

    let layers: Layer<DeckDataRow>[];
    if (geojson) {
      layers = createGeoJsonLayers(geojson);
    } else if (jsTable) {
      const hasGeoMetadata = !!jsTable.schema.metadata?.get('geo');
      if (!hasGeoMetadata) {
        if (lastPendingGeoTable !== datasetId) {
          lastPendingGeoTable = datasetId ?? null;
          logger.warn(
            'Arrow table missing GeoArrow metadata',
            LogCategory.MAP,
            {
              datasetId,
              note: 'Waiting for metadata-prefetch'
            }
          );
        }
        return;
      }
      lastPendingGeoTable = null;

      layers = createDeckLayers(jsTable);
    } else {
      layers = [];
    }

    deckOverlay.setProps({ layers });
    logger.success('Deck.gl layers applied', LogCategory.MAP, {
      layerCount: layers.length
    });
  }

  let isZoomSyncing = false;
  let baseZoomLevel = $state(1.5);
  let shouldRestorePosition = $state(true);

  function saveMapPosition(): void {
    if (!map || !isMapLoaded) return;
    const center = map.getCenter();
    const zoom = map.getZoom();

    if (typeof window !== 'undefined') {
      localStorage.setItem(
        MAP_CENTER_STORAGE_KEY,
        JSON.stringify({ lng: center.lng, lat: center.lat })
      );
      localStorage.setItem(MAP_ZOOM_STORAGE_KEY, String(zoom));
    }
  }

  function restoreMapPosition(): void {
    if (!map || !isMapLoaded || typeof window === 'undefined') return;

    const savedCenter = localStorage.getItem(MAP_CENTER_STORAGE_KEY);
    const savedZoom = localStorage.getItem(MAP_ZOOM_STORAGE_KEY);

    if (savedCenter && savedZoom) {
      try {
        const center = JSON.parse(savedCenter);
        const zoom = parseFloat(savedZoom);

        if (center.lng && center.lat && !isNaN(zoom)) {
          map.setCenter([center.lng, center.lat]);
          map.setZoom(zoom);
          baseZoomLevel = zoom;
          globalActions.setMapZoom(100);
        }
      } catch (error) {
        logger.warn('Failed to restore saved map position', LogCategory.MAP, {
          error
        });
      }
    }
  }

  function syncZoomToMap(): void {
    if (!map || !isMapLoaded || isZoomSyncing) return;
    isZoomSyncing = true;
    const zoomPercent = globalState.zoom.mapZoomLevel;
    const mapLibreZoom = baseZoomLevel + Math.log2(zoomPercent / 100) * 2;
    map.setZoom(mapLibreZoom);
    setTimeout(() => {
      isZoomSyncing = false;
    }, 100);
  }

  function syncBasemapStyle(): void {
    if (!map || !isMapLoaded) return;
    const styleUrl = basemapStyleStore.selectedStyleUrl;
    if (map.getStyle()?.sprite !== styleUrl) {
      map.setStyle(styleUrl);
    }
  }

  $effect(() => {
    if (isMapLoaded && deckOverlay) {
      updateMapLayers(jsTable, userGeoJSON);
    }
  });

  let lastFitTable = $state<ArrowTable | null>(null);
  $effect(() => {
    if (
      jsTable &&
      jsTable.schema.metadata?.get('geo') &&
      isMapLoaded &&
      map &&
      lastFitTable !== jsTable
    ) {
      shouldRestorePosition = false;
      const bounds = calculateBoundsFromGeoArrow(jsTable);
      if (bounds) {
        map.fitBounds(bounds, { padding: 50, duration: 300 }); // Reduced from 1000ms
        logger.info('Fitting map to Arrow dataset bounds', LogCategory.MAP, {
          datasetId,
          bounds
        });

        // Use moveend event instead of setTimeout
        const onMoveEnd = () => {
          if (map) {
            baseZoomLevel = map.getZoom();
            globalActions.setMapZoom(100);
            saveMapPosition();
            map.off('moveend', onMoveEnd); // Remove listener after use
          }
        };
        map.once('moveend', onMoveEnd);

        lastFitTable = jsTable;
      }
    }
  });

  let lastFitGeoJSON = $state<FeatureCollection | null>(null);
  $effect(() => {
    if (userGeoJSON && isMapLoaded && map && lastFitGeoJSON !== userGeoJSON) {
      shouldRestorePosition = false;
      const bounds = calculateBoundsFromGeoJSON(userGeoJSON);
      if (bounds) {
        map.fitBounds(bounds, { padding: 50, duration: 300 }); // Reduced from 1000ms
        logger.info('Fitting map to GeoJSON bounds', LogCategory.MAP, {
          featureCount: userGeoJSON.features.length
        });

        // Use moveend event instead of setTimeout
        const onMoveEnd = () => {
          if (map) {
            baseZoomLevel = map.getZoom();
            globalActions.setMapZoom(100);
            saveMapPosition();
            map.off('moveend', onMoveEnd); // Remove listener after use
          }
        };
        map.once('moveend', onMoveEnd);

        lastFitGeoJSON = userGeoJSON;
      }
    }
  });

  $effect(() => {
    const _zoomLevel = globalState.zoom.mapZoomLevel;
    syncZoomToMap();
  });

  $effect(() => {
    const _styleUrl = basemapStyleStore.selectedStyleUrl;
    syncBasemapStyle();
  });

  // OSM raster layer effect
  $effect(() => {
    const osmBasemap = osmBasemapStore.activeOSMBasemap;
    const tileConfig = osmBasemapStore.tileConfig;

    if (isMapLoaded && map) {
      const OSM_SOURCE_ID = 'osm-raster-source';
      const OSM_LAYER_ID = 'osm-raster-layer';

      // Remove existing OSM layer and source if present
      if (map.getLayer(OSM_LAYER_ID)) {
        map.removeLayer(OSM_LAYER_ID);
      }
      if (map.getSource(OSM_SOURCE_ID)) {
        map.removeSource(OSM_SOURCE_ID);
      }

      // Add new OSM raster layer if active
      if (osmBasemap && tileConfig) {
        const rasterSource = createOSMRasterSource(tileConfig);
        const rasterLayer = createOSMRasterLayer(OSM_SOURCE_ID);

        map.addSource(OSM_SOURCE_ID, rasterSource);
        map.addLayer(rasterLayer);

        logger.debug('OSM raster basemap applied', LogCategory.MAP, {
          basemap: osmBasemap.file,
          title: osmBasemap.title
        });
      }
    }
  });

  onMount(() => {
    logger.info('Mounting Deck.gl map component', LogCategory.MAP);
    tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.zIndex = '1';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.display = 'none';
    tooltip.style.background = 'white';
    tooltip.style.border = '1px solid #161616';
    tooltip.style.borderRadius = '4px';
    tooltip.style.padding = '12px';
    tooltip.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)';
    tooltip.style.fontSize = '13px';
    tooltip.style.lineHeight = '1.4';
    tooltip.classList.add('deck-tooltip');
    document.body.appendChild(tooltip);
    const handleMouseLeave = () => hideTooltip();
    mapContainer?.addEventListener('mouseleave', handleMouseLeave);

    map = new maplibregl.Map({
      container: mapContainer,
      style: BASEMAP_STYLES[DEFAULT_BASEMAP_STYLE],
      center: [0, 20],
      zoom: 1.5,
      minZoom: 0.5,
      maxZoom: 20,
      pitch: 0,
      bearing: 0,
      interactive: true,
      scrollZoom: false,
      dragPan: true,
      dragRotate: false,
      doubleClickZoom: true,
      touchZoomRotate: true
    });

    map.on('load', () => {
      deckOverlay = new MapboxOverlay({
        interleaved: true,
        layers: []
      } as DeckProps);

      if (map) {
        map.addControl(deckOverlay as maplibregl.IControl);
        map.addControl(
          new maplibregl.ScaleControl({
            maxWidth: 100,
            unit: 'metric'
          }),
          'bottom-left'
        );
      }

      isMapLoaded = true;
      mapInstanceStore.setMapInstance(map);
      mapInstanceStore.setDeckOverlay(deckOverlay);
      mapInstanceStore.setMapLoaded(true);
      logger.success('Maplibre + Deck.gl ready', LogCategory.MAP);

      if (jsTable || userGeoJSON) {
        updateMapLayers(jsTable, userGeoJSON);
      } else if (shouldRestorePosition) {
        setTimeout(() => restoreMapPosition(), 100);
      }
    });

    map.on('zoom', () => {
      if (map && !isZoomSyncing) {
        const mapLibreZoom = map.getZoom();
        const zoomPercent =
          100 * Math.pow(2, (mapLibreZoom - baseZoomLevel) / 2);
        globalActions.setMapZoom(Math.round(zoomPercent));
      }
    });

    map.on('moveend', () => {
      saveMapPosition();
    });

    map.on('zoomend', () => {
      saveMapPosition();
    });

    return () => {
      mapContainer?.removeEventListener('mouseleave', handleMouseLeave);
      if (tooltip && document.body.contains(tooltip)) {
        document.body.removeChild(tooltip);
      }
      if (map) {
        map.remove();
      }
      mapInstanceStore.reset();
      logger.info('Deck.gl map destroyed', LogCategory.MAP);
    };
  });
</script>

<div class="map-wrapper">
  <div bind:this={mapContainer} class="map-container"></div>
</div>

<style>
  .map-wrapper {
    position: relative;
    width: 100%;
    height: 700px;
    background-color: white;
  }

  .map-container {
    position: relative;
    width: 100%;
    height: 700px;
    background-color: white;
  }

  :global(.maplibregl-ctrl-attrib) {
    display: none;
  }

  :global(.deck-tooltip) {
    width: 280px;
    max-width: 280px;
    max-height: 220px;
    overflow-y: auto;
  }
</style>
