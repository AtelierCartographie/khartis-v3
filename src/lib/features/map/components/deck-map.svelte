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

  interface DeckMapProps {
    jsTable: ArrowTable | null;
    userGeoJSON: FeatureCollection | null;
    onReady?: () => void;
  }

  let { jsTable, userGeoJSON, onReady }: DeckMapProps = $props();

  let mapContainer: HTMLDivElement;
  let map = $state<maplibregl.Map | null>(null);
  let deckOverlay: MapboxOverlay;
  let isMapLoaded = $state(false);
  let lastPendingGeoTable = $state<string | null>(null);

  const activeVisualizations = $derived(
    visualizationStore.activeVisualizations
  );

  const defaultVisualization = $derived(activeVisualizations[0]);
  const datasetId = $derived(defaultVisualization?.datasetId);

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

  function formatTooltipValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'bigint') return Number(value).toLocaleString('fr-FR');
    if (typeof value === 'number') {
      if (Number.isInteger(value)) return value.toLocaleString('fr-FR');
      return value.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    }
    if (value instanceof Date) return value.toLocaleDateString('fr-FR');
    const str = String(value);
    return str.length > 50 ? str.slice(0, 47) + '...' : str;
  }

  /**
   * Check if geometry data is already in GeoJSON format (not GeoArrow nested lists)
   */
  function isGeoJsonGeometry(geom: unknown): geom is GeoJSON.Geometry {
    if (!geom) return false;

    // Handle GeoJSON string (from ST_AsGeoJSON output)
    if (typeof geom === 'string') {
      try {
        const parsed = JSON.parse(geom);
        return isGeoJsonGeometry(parsed);
      } catch {
        return false;
      }
    }

    if (typeof geom !== 'object') return false;
    const g = geom as Record<string, unknown>;
    // GeoJSON geometry has 'type' and 'coordinates' properties
    return (
      typeof g.type === 'string' &&
      [
        'Point',
        'MultiPoint',
        'LineString',
        'MultiLineString',
        'Polygon',
        'MultiPolygon'
      ].includes(g.type as string) &&
      Array.isArray(g.coordinates)
    );
  }

  function parseGeoJsonGeometry(geom: unknown): GeoJSON.Geometry | null {
    if (!geom) return null;

    // Handle GeoJSON string (from ST_AsGeoJSON output)
    if (typeof geom === 'string') {
      try {
        const parsed = JSON.parse(geom);
        if (isGeoJsonGeometry(parsed)) {
          return parsed;
        }
      } catch {
        return null;
      }
    }

    // Handle WKB binary data (Uint8Array)
    if (geom instanceof Uint8Array) {
      return parseWkbToGeoJson(geom);
    }

    // Handle binary data from flechette (may be ArrayBuffer-like or have .buffer property)
    if (ArrayBuffer.isView(geom)) {
      const uint8 = new Uint8Array(
        (geom as ArrayBufferView).buffer,
        (geom as ArrayBufferView).byteOffset,
        (geom as ArrayBufferView).byteLength
      );
      return parseWkbToGeoJson(uint8);
    }

    // Handle raw ArrayBuffer
    if (geom instanceof ArrayBuffer) {
      return parseWkbToGeoJson(new Uint8Array(geom));
    }

    // Handle GeoArrow native format (nested arrays for coordinates)
    // MultiPolygon: [[[[x, y], [x, y], ...], ...], ...]
    // Polygon: [[[x, y], [x, y], ...], ...]
    if (Array.isArray(geom)) {
      return parseGeoArrowNative(geom);
    }

    // Handle flechette/arrow objects that have toArray() method
    if (
      typeof geom === 'object' &&
      geom !== null &&
      typeof (geom as { toArray?: () => unknown }).toArray === 'function'
    ) {
      const arr = (geom as { toArray: () => unknown }).toArray();
      if (arr instanceof Uint8Array) {
        return parseWkbToGeoJson(arr);
      }
      if (ArrayBuffer.isView(arr)) {
        const uint8 = new Uint8Array(
          (arr as ArrayBufferView).buffer,
          (arr as ArrayBufferView).byteOffset,
          (arr as ArrayBufferView).byteLength
        );
        return parseWkbToGeoJson(uint8);
      }
      if (Array.isArray(arr)) {
        // Check if it's an array of numbers (bytes) - convert to Uint8Array
        if (arr.length > 0 && typeof arr[0] === 'number') {
          const uint8 = new Uint8Array(arr as number[]);
          // Check if it looks like WKB (first byte is 0 or 1)
          if (uint8.length >= 5 && (uint8[0] === 0 || uint8[0] === 1)) {
            return parseWkbToGeoJson(uint8);
          }
        }
        return parseGeoArrowNative(arr);
      }
    }

    // Already an object
    if (isGeoJsonGeometry(geom)) {
      return geom;
    }

    return null;
  }

  function parseGeoArrowNative(coords: unknown[]): GeoJSON.Geometry | null {
    if (!Array.isArray(coords) || coords.length === 0) return null;

    // Detect geometry type by nesting depth
    // Point: [x, y]
    // LineString: [[x, y], [x, y], ...]
    // Polygon: [[[x, y], [x, y], ...], ...]
    // MultiPolygon: [[[[x, y], [x, y], ...], ...], ...]

    const first = coords[0];

    // Check if it's a coordinate pair [x, y]
    if (typeof first === 'number') {
      return {
        type: 'Point',
        coordinates: coords as [number, number]
      };
    }

    if (!Array.isArray(first)) return null;

    const second = first[0];

    // LineString: [[x, y], ...]
    if (typeof second === 'number') {
      return {
        type: 'LineString',
        coordinates: coords as [number, number][]
      };
    }

    if (!Array.isArray(second)) return null;

    const third = second[0];

    // Polygon: [[[x, y], ...], ...]
    if (typeof third === 'number') {
      return {
        type: 'Polygon',
        coordinates: coords as [number, number][][]
      };
    }

    if (!Array.isArray(third)) return null;

    const fourth = third[0];

    // MultiPolygon: [[[[x, y], ...], ...], ...]
    if (typeof fourth === 'number') {
      return {
        type: 'MultiPolygon',
        coordinates: coords as [number, number][][][]
      };
    }

    // Could be MultiLineString or other - check deeper
    if (Array.isArray(fourth)) {
      const fifth = fourth[0];
      if (typeof fifth === 'number') {
        // This is MultiLineString: [[[x, y], ...], ...]
        return {
          type: 'MultiLineString',
          coordinates: coords as [number, number][][]
        };
      }
    }

    return null;
  }

  function parseWkbToGeoJson(wkb: Uint8Array): GeoJSON.Geometry | null {
    if (wkb.length < 5) return null;

    const littleEndian = wkb[0] === 1;
    const view = new DataView(wkb.buffer, wkb.byteOffset, wkb.byteLength);
    const geomType = view.getUint32(1, littleEndian);

    let offset = 5;

    const readDouble = (): number => {
      const val = view.getFloat64(offset, littleEndian);
      offset += 8;
      return val;
    };

    const readUint32 = (): number => {
      const val = view.getUint32(offset, littleEndian);
      offset += 4;
      return val;
    };

    const readPoint = (): [number, number] => {
      return [readDouble(), readDouble()];
    };

    const readLinearRing = (): [number, number][] => {
      const numPoints = readUint32();
      const ring: [number, number][] = [];
      for (let i = 0; i < numPoints; i++) {
        ring.push(readPoint());
      }
      return ring;
    };

    const readPolygon = (): [number, number][][] => {
      const numRings = readUint32();
      const rings: [number, number][][] = [];
      for (let i = 0; i < numRings; i++) {
        rings.push(readLinearRing());
      }
      return rings;
    };

    try {
      switch (geomType) {
        case 1: // Point
          return { type: 'Point', coordinates: readPoint() };
        case 2: {
          // LineString
          const numPoints = readUint32();
          const coords: [number, number][] = [];
          for (let i = 0; i < numPoints; i++) {
            coords.push(readPoint());
          }
          return { type: 'LineString', coordinates: coords };
        }
        case 3: // Polygon
          return { type: 'Polygon', coordinates: readPolygon() };
        case 4: {
          // MultiPoint
          const numPoints = readUint32();
          const points: [number, number][] = [];
          for (let i = 0; i < numPoints; i++) {
            offset += 5; // Skip WKB header for each point
            points.push(readPoint());
          }
          return { type: 'MultiPoint', coordinates: points };
        }
        case 5: {
          // MultiLineString
          const numLines = readUint32();
          const lines: [number, number][][] = [];
          for (let i = 0; i < numLines; i++) {
            offset += 5; // Skip WKB header
            const numPoints = readUint32();
            const line: [number, number][] = [];
            for (let j = 0; j < numPoints; j++) {
              line.push(readPoint());
            }
            lines.push(line);
          }
          return { type: 'MultiLineString', coordinates: lines };
        }
        case 6: {
          // MultiPolygon
          const numPolygons = readUint32();
          const polygons: [number, number][][][] = [];
          for (let i = 0; i < numPolygons; i++) {
            offset += 5; // Skip WKB header
            polygons.push(readPolygon());
          }
          return { type: 'MultiPolygon', coordinates: polygons };
        }
        default:
          logger.warn('Unsupported WKB geometry type', LogCategory.MAP, {
            geomType
          });
          return null;
      }
    } catch (e) {
      logger.warn('Failed to parse WKB geometry', LogCategory.MAP, {
        error: e
      });
      return null;
    }
  }

  /**
   * Convert Arrow table to GeoJSON for fallback rendering.
   * Supports both GeoJSON objects and GeoJSON strings (from ST_AsGeoJSON).
   */
  function arrowTableToGeoJSON(
    table: ArrowTable,
    geoColumn: string
  ): FeatureCollection | null {
    try {
      const features: FeatureCollection['features'] = [];
      const geomVector = table.getChild(geoColumn);

      if (!geomVector) {
        logger.warn('No geometry vector found for fallback', LogCategory.MAP, {
          geoColumn
        });
        return null;
      }

      // Check first geometry to see if it's parseable GeoJSON
      const firstGeom = geomVector.get(0);
      const parsedFirstGeom = parseGeoJsonGeometry(firstGeom);
      if (!parsedFirstGeom) {
        // Enhanced logging to understand the geometry format
        let geomDetails: Record<string, unknown> = {
          geoColumn,
          sampleGeomType: typeof firstGeom,
          isArray: Array.isArray(firstGeom),
          isString: typeof firstGeom === 'string',
          isUint8Array: firstGeom instanceof Uint8Array,
          isArrayBufferView: ArrayBuffer.isView(firstGeom),
          isArrayBuffer: firstGeom instanceof ArrayBuffer
        };

        if (firstGeom && typeof firstGeom === 'object') {
          const obj = firstGeom as Record<string, unknown>;
          geomDetails = {
            ...geomDetails,
            objectKeys: Object.keys(obj).slice(0, 10),
            hasToArray: typeof obj.toArray === 'function',
            hasValues: typeof obj.values === 'function',
            constructorName: obj.constructor?.name
          };

          // Try to extract data if it has toArray method (flechette vectors)
          if (typeof obj.toArray === 'function') {
            try {
              const arr = (obj as { toArray: () => unknown[] }).toArray();
              geomDetails.toArrayResult = Array.isArray(arr)
                ? `Array[${arr.length}]`
                : typeof arr;
              if (Array.isArray(arr) && arr.length > 0) {
                geomDetails.firstElement = typeof arr[0];
              }
            } catch {
              geomDetails.toArrayError = true;
            }
          }
        }

        logger.warn(
          'Geometry is not in GeoJSON format, cannot use fallback',
          LogCategory.MAP,
          geomDetails
        );
        return null;
      }

      for (let i = 0; i < table.numRows; i++) {
        const properties: Record<string, unknown> = {};

        for (const field of table.schema.fields) {
          if (
            field.name === geoColumn ||
            field.name === 'geom' ||
            field.name === 'geometry'
          )
            continue;
          const col = table.getChild(field.name);
          if (col) {
            const val = col.get(i);
            properties[field.name] =
              typeof val === 'bigint' ? Number(val) : val;
          }
        }

        const geom = geomVector.get(i);
        const parsedGeom = parseGeoJsonGeometry(geom);
        if (parsedGeom) {
          features.push({
            type: 'Feature',
            properties,
            geometry: parsedGeom
          });
        }
      }

      return { type: 'FeatureCollection', features };
    } catch (error) {
      logger.error(
        'Failed to convert Arrow table to GeoJSON',
        LogCategory.MAP,
        error
      );
      return null;
    }
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
            autoHighlight: false,
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

          deckLayer = new geodecklayers.GeoArrowScatterplotLayer(
            scatterplotProps
          );
          break;
        }

        case 'LINESTRING':
        // falls through

        case 'MULTILINESTRING': {
          // OPTIMIZATION: Use stable, deterministic layer ID
          const layerId = `line-layer-${datasetId ?? 'default'}`;

          // Let the library auto-discover geometry from the table
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
            autoHighlight: false,
            // OPTIMIZATION: Add updateTriggers
            updateTriggers: {
              getColor: [fillColor],
              getWidth: [strokeWidth]
            }
          };

          deckLayer = new geodecklayers.GeoArrowPathLayer(pathProps);
          break;
        }

        case 'POLYGON':
        // falls through

        case 'MULTIPOLYGON': {
          // Debug: Log detailed geometry metadata for troubleshooting
          const geometryFieldDebug = jsTable.schema.fields.find(
            (f) => f.name === geoColumn
          );
          logger.info(
            'Creating polygon layer - geometry details',
            LogCategory.MAP,
            {
              geoColumn,
              hasMatchingGeoExtension,
              arrowExtension,
              expectedExtension,
              geometryType: resolvedGeometryType,
              fieldMetadata: geometryFieldDebug?.metadata
                ? Object.fromEntries(geometryFieldDebug.metadata.entries())
                : null,
              fieldType: geometryFieldDebug?.type?.toString()
            }
          );

          const useChoropleth = viz && shouldApplyChoropleth(viz);

          // OPTIMIZATION: Use stable, deterministic layer ID
          const layerId = `polygon-layer-${datasetId ?? 'default'}`;

          // Check if we have valid geometry extension metadata
          const isNativeGeoArrow =
            arrowExtension &&
            (arrowExtension === 'geoarrow.polygon' ||
              arrowExtension === 'geoarrow.multipolygon');

          const isGeoJsonEncoded = arrowExtension === 'geojson';
          const isWkbEncoded = arrowExtension === 'ogc.wkb';

          if (!isNativeGeoArrow && !isGeoJsonEncoded && !isWkbEncoded) {
            // Without proper extension metadata, the library cannot render the geometry
            logger.info(
              'Skipping polygon layer - missing geometry extension metadata',
              LogCategory.MAP,
              {
                geoColumn,
                arrowExtension,
                note: 'Polygons require proper geometry metadata to render'
              }
            );
            return [];
          }

          // Always use GeoJsonLayer for polygons - better tooltip support
          // Supports: GeoJSON strings, WKB binary, and native GeoArrow (which is WKB under the hood)
          const geojsonData = arrowTableToGeoJSON(jsTable, geoColumn);
          if (!geojsonData) {
            logger.warn(
              'Failed to convert geometry to GeoJSON',
              LogCategory.MAP,
              { encoding: arrowExtension }
            );
            return [];
          }

          logger.info('Using GeoJsonLayer for polygons', LogCategory.MAP, {
            encoding: arrowExtension,
            featureCount: geojsonData.features.length,
            hasVisualization: Boolean(viz)
          });

          // Build fill color accessor for choropleth if needed
          const geoJsonFillColor = useChoropleth
            ? (feature: { properties?: Record<string, unknown> }) => {
                const value = feature.properties?.[viz.mapping.valueColumn!];
                if (value === null || value === undefined) return fillColor;
                const numValue =
                  typeof value === 'number' ? value : parseFloat(String(value));
                if (isNaN(numValue)) return fillColor;
                return getColorForValue(
                  numValue,
                  viz.classification!.breaks!,
                  viz.classification!.colors!
                );
              }
            : fillColor;

          deckLayer = new GeoJsonLayer({
            id: layerId,
            data: geojsonData,
            getFillColor: geoJsonFillColor,
            getLineColor: withOpacity(strokeColor, strokeOpacity),
            opacity: fillOpacity,
            lineWidthUnits: 'pixels',
            lineWidthScale: strokeWidth / 4,
            pickable: true,
            autoHighlight: false,
            updateTriggers: {
              getFillColor: [
                useChoropleth,
                viz?.mapping.valueColumn,
                viz?.classification?.breaks,
                viz?.classification?.colors,
                fillColor
              ],
              getLineColor: [strokeColor, strokeOpacity]
            }
          });
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
      autoHighlight: false,
      // OPTIMIZATION: Add updateTriggers
      updateTriggers: {
        getFillColor: [fillColor, fillOpacity],
        getLineColor: [strokeColor],
        getLineWidth: [strokeWidth]
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
        layers: [],
        getTooltip: (info: {
          object?: unknown;
          index?: number;
          layer?: { id?: string; props?: { data?: unknown } } | null;
          picked?: boolean;
        }) => {
          if (!info.picked || info.index === undefined || info.index === -1) {
            return null;
          }

          const rowIndex = info.index;
          const entries: Array<{ key: string; value: string }> = [];

          // Case 1: GeoJSON layer (including fallback polygon layers)
          // Check if info.object has properties (GeoJSON feature format)
          const isGeoJsonFeature =
            info.object &&
            typeof info.object === 'object' &&
            'properties' in (info.object as Record<string, unknown>);

          if (isGeoJsonFeature) {
            const feature = info.object as {
              properties?: Record<string, unknown>;
            };
            if (feature.properties) {
              for (const key of Object.keys(feature.properties)) {
                if (key === 'geom' || key === 'geometry' || key === '__id')
                  continue;
                const val = feature.properties[key];
                entries.push({
                  key,
                  value: formatTooltipValue(val)
                });
              }
            }
          }
          // Case 2: GeoArrow layer - access data from layer props (not closure)
          else {
            const layerData = info.layer?.props?.data as ArrowTable | null;
            if (
              layerData &&
              'schema' in layerData &&
              rowIndex >= 0 &&
              rowIndex < layerData.numRows
            ) {
              for (const field of layerData.schema.fields) {
                const colName = field.name;
                if (
                  colName === 'geom' ||
                  colName === 'geometry' ||
                  colName === '__id'
                )
                  continue;
                const column = layerData.getChild(colName);
                if (column) {
                  const val = column.get(rowIndex);
                  entries.push({
                    key: colName,
                    value: formatTooltipValue(val)
                  });
                }
              }
            }
          }

          if (entries.length === 0) return null;

          // Build HTML for native Deck.gl tooltip
          const maxEntries = 10;
          const visibleEntries = entries.slice(0, maxEntries);
          const hiddenCount = Math.max(0, entries.length - maxEntries);

          let html =
            '<div style="display:flex;flex-direction:column;gap:4px;">';
          for (const entry of visibleEntries) {
            html += `<div style="display:flex;justify-content:space-between;gap:16px;"><span style="color:#525252;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">${entry.key}</span><span style="font-weight:500;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;">${entry.value}</span></div>`;
          }
          if (hiddenCount > 0) {
            html += `<div style="color:#525252;font-style:italic;font-size:11px;margin-top:4px;">+${hiddenCount} more...</div>`;
          }
          html += '</div>';

          return {
            html,
            style: {
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              color: '#161616',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'IBM Plex Sans, sans-serif',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
              border: '1px solid #8d8d8d',
              maxWidth: '300px'
            }
          };
        }
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

      // Signal that the map is ready after the first render frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onReady?.();
        });
      });
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
    background-color: var(--cds-ui-background);
  }

  .map-container {
    position: relative;
    width: 100%;
    height: 700px;
    background-color: var(--cds-ui-background);
  }

  :global(.maplibregl-ctrl-attrib) {
    display: none;
  }

  /* Deck.gl tooltip styling - ensure visibility and proper z-index */
  :global(.deck-tooltip) {
    z-index: 10000 !important;
    pointer-events: none !important;
  }
</style>
