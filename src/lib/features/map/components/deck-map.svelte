<script lang="ts">
  import { MapboxOverlay } from '@deck.gl/mapbox';
  import type { DeckProps, Layer } from '@deck.gl/core';
  import { GeoJsonLayer } from '@deck.gl/layers';
  import * as geodecklayers from '@geoarrow/deck.gl-layers';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import type { FeatureCollection } from 'geojson';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onMount } from 'svelte';
  import { visualizationStore } from '../../commons/store/visualization.store.svelte';
  import { datasetsStore } from '../../commons/store/datasets.store.svelte';
  import {
    globalState,
    globalActions
  } from '../../commons/store/global.svelte';
  import { ZoomMode } from '../../commons/types/global';
  import { hexToRgb } from '../../commons/utils/color-utils';
  import {
    getColorForValue,
    getSizeForValue,
    getCategoricalColorMap,
    shouldApplyChoropleth,
    shouldApplyProportionalSymbols,
    shouldApplyCategorical
  } from '../utils/data-styling.utils';
  import {
    BASEMAP_STYLES,
    DEFAULT_BASEMAP_STYLE
  } from '../configs/basemap-styles';
  import {
    calculateBoundsFromGeoArrow,
    calculateBoundsFromGeoJSON
  } from '../utils/map-controls.utils';
  import { basemapStyleStore } from '../../commons/store/basemap-style.store.svelte';
  import { logger, LogCategory } from '../../commons/utils/logger';
  import { mapInstanceStore } from '../../commons/store/map-instance.store.svelte';

  const MAP_CENTER_STORAGE_KEY = 'khartis_map_center';
  const MAP_ZOOM_STORAGE_KEY = 'khartis_maplibre_zoom';

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
    // CRITICAL: Check metadata exists before accessing
    const geoMetadata = jsTable.schema.metadata?.get('geo');

    if (!geoMetadata) {
      logger.error('No GeoArrow metadata in Arrow table', LogCategory.MAP, {
        hasSchemaMetadata: !!jsTable.schema.metadata,
        metadataKeys: jsTable.schema.metadata
          ? Array.from(jsTable.schema.metadata.keys())
          : [],
        schemaFields: jsTable.schema.fields.map((f) => f.name),
        numRows: jsTable.numRows
      });

      // Try to find geometry column manually as fallback diagnostic
      const geomColumn = jsTable.schema.fields.find(
        (f) => f.name === 'geom' || f.name === 'geometry'
      );

      if (!geomColumn) {
        logger.error('No geometry column found in table', LogCategory.MAP);
      } else {
        logger.warn(
          'Geometry column exists but no GeoArrow metadata',
          LogCategory.MAP,
          {
            geomColumnName: geomColumn.name,
            suggestion:
              'Table may have come from DuckDB query instead of GeoParquetReader'
          }
        );
      }

      return [];
    }

    try {
      const jsonMeta = JSON.parse(geoMetadata);
      const geoColumn = jsonMeta.primary_column;
      const geometryType = jsonMeta.columns[geoColumn].geometry_types[0];

      logger.info('Creating deck layers', LogCategory.MAP, {
        geoColumn,
        geometryType,
        rowCount: jsTable.numRows,
        hasVisualization: !!defaultVisualization
      });

      const viz = defaultVisualization;
      const fillColor: [number, number, number] = viz?.style.fillColor
        ? hexToRgb(viz.style.fillColor as string)
        : [220, 220, 220];
      const strokeColor: [number, number, number] = viz?.style.strokeColor
        ? hexToRgb(viz.style.strokeColor)
        : [255, 255, 255];
      const fillOpacity: number = viz?.style.fillOpacity ?? 0.6;
      const strokeWidth: number = viz?.style.strokeWidth ?? 1;
      const strokeOpacity: number = viz?.style.strokeOpacity ?? 1;

      let deckLayer: Layer<DeckDataRow>;
      switch (geometryType.toUpperCase()) {
        case 'POINT':

        // fallthrough
        case 'MULTIPOINT': {
          const pointChild = jsTable.getChild(geoColumn);
          if (!pointChild) return [];

          const useProportionalSymbols =
            viz && shouldApplyProportionalSymbols(viz);
          const useCategoricalColor = viz && shouldApplyCategorical(viz);

          let minValue = 0;
          let maxValue = 100;
          let categoryColorMap: Map<string, [number, number, number]> | null =
            null;

          if (useProportionalSymbols && viz.mapping.sizeColumn && datasetId) {
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
              minValue = stats.min;
              maxValue = stats.max;
            }
          }

          if (useCategoricalColor && viz.mapping.categoryColumn && datasetId) {
            const categories = datasetsStore
              .getUniqueValues(datasetId, viz.mapping.categoryColumn)
              .map(String);
            categoryColorMap = getCategoricalColorMap(
              categories,
              viz.classification!.colors!
            );
          }

          deckLayer = new geodecklayers.GeoArrowScatterplotLayer({
            id: 'point-layer',
            data: jsTable,
            getPosition: pointChild,
            stroked: true,
            getFillColor: useCategoricalColor
              ? (object: DeckDataRow) => {
                  const category = object[viz.mapping.categoryColumn!];
                  return (
                    categoryColorMap?.get(String(category)) ?? [128, 128, 128]
                  );
                }
              : fillColor,
            getLineColor: strokeColor,
            opacity: fillOpacity,
            lineOpacity: strokeOpacity,
            getRadius: useProportionalSymbols
              ? (object: DeckDataRow) => {
                  const rawValue = object[viz.mapping.sizeColumn!];
                  const numericValue =
                    typeof rawValue === 'number' ? rawValue : Number(rawValue);
                  if (!Number.isFinite(numericValue)) {
                    return viz.symbols!.minSize;
                  }
                  return getSizeForValue(
                    numericValue,
                    minValue,
                    maxValue,
                    viz.symbols!.minSize,
                    viz.symbols!.maxSize,
                    viz.symbols!.sizeScale
                  );
                }
              : 1,
            radiusScale: useProportionalSymbols ? 1 : 5,
            radiusUnits: 'pixels',
            lineWidthUnits: 'pixels',
            lineWidthScale: strokeWidth / 3,
            lineCapRounded: true,
            pickable: true,
            autoHighlight: true
          });
          break;
        }

        case 'LINESTRING':

        // fallthrough
        case 'MULTILINESTRING':
          deckLayer = new geodecklayers.GeoArrowPathLayer({
            id: 'line-layer',
            data: jsTable,
            getColor: fillColor,
            opacity: fillOpacity,
            getWidth: strokeWidth,
            lineWidthUnits: 'pixels',
            lineWidthScale: 1 / 4,
            lineCapRounded: true,
            pickable: true,
            autoHighlight: true
          });
          break;

        case 'POLYGON':

        // fallthrough
        case 'MULTIPOLYGON': {
          const polygonChild = jsTable.getChild(geoColumn);
          if (!polygonChild) return [];

          const useChoropleth = viz && shouldApplyChoropleth(viz);

          deckLayer = new geodecklayers.GeoArrowPolygonLayer({
            id: 'polygon-layer',
            data: jsTable,
            getPolygon: polygonChild,
            getFillColor: useChoropleth
              ? (object: DeckDataRow) => {
                  const rawValue = object[viz.mapping.valueColumn!];
                  const numericValue =
                    typeof rawValue === 'number' ? rawValue : Number(rawValue);
                  if (!Number.isFinite(numericValue)) {
                    return [200, 200, 200];
                  }
                  return getColorForValue(
                    numericValue,
                    viz.classification!.breaks!,
                    viz.classification!.colors!
                  );
                }
              : fillColor,
            getLineColor: strokeColor,
            opacity: fillOpacity,
            lineOpacity: strokeOpacity,
            lineWidthUnits: 'pixels',
            lineWidthScale: strokeWidth / 4,
            lineCapRounded: true,
            pickable: true,
            autoHighlight: true,
            onHover: (pickingInfo, _event) => {
              handleDeckHover(pickingInfo);
            }
          });
          break;
        }

        default:
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
    const fillColor: [number, number, number] = viz?.style.fillColor
      ? hexToRgb(viz.style.fillColor as string)
      : [220, 220, 220];
    const strokeColor: [number, number, number] = viz?.style.strokeColor
      ? hexToRgb(viz.style.strokeColor)
      : [255, 255, 255];
    const fillOpacity: number = (viz?.style.fillOpacity ?? 0.6) * 255;
    const strokeWidth: number = viz?.style.strokeWidth ?? 1;

    logger.info('Creating GeoJSON layer', LogCategory.MAP, {
      featureCount: geojson.features.length
    });

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
      logger.warn(
        'Cannot update layers: deckOverlay or map not ready',
        LogCategory.MAP,
        {
          hasDeckOverlay: !!deckOverlay,
          isMapLoaded
        }
      );
      return;
    }

    let layers: Layer<DeckDataRow>[];
    if (geojson) {
      layers = createGeoJsonLayers(geojson);
      logger.info('Updating map with GeoJSON layers', LogCategory.MAP, {
        layerCount: layers.length,
        featureCount: geojson.features.length
      });
    } else if (jsTable) {
      layers = createDeckLayers(jsTable);
      logger.info('Updating map with Arrow layers', LogCategory.MAP, {
        layerCount: layers.length,
        tableRows: jsTable.numRows
      });
    } else {
      layers = [];
    }

    deckOverlay.setProps({ layers });
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

          logger.info(
            'Restored map position from localStorage',
            LogCategory.MAP,
            {
              center,
              zoom
            }
          );
        }
      } catch (error) {
        logger.warn('Failed to restore map position', LogCategory.MAP, error);
      }
    }
  }

  function syncZoomToMap(): void {
    if (!map || !isMapLoaded || isZoomSyncing) return;
    if (globalState.zoom.mode === ZoomMode.Map) {
      isZoomSyncing = true;
      const zoomPercent = globalState.zoom.mapZoomLevel;
      const mapLibreZoom = baseZoomLevel + Math.log2(zoomPercent / 100) * 2;
      map.setZoom(mapLibreZoom);
      setTimeout(() => {
        isZoomSyncing = false;
      }, 100);
    }
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
    if (jsTable && isMapLoaded && map && lastFitTable !== jsTable) {
      shouldRestorePosition = false;
      const bounds = calculateBoundsFromGeoArrow(jsTable);
      if (bounds) {
        map.fitBounds(bounds, { padding: 50, duration: 1000 });

        setTimeout(() => {
          if (map) {
            baseZoomLevel = map.getZoom();
            globalActions.setMapZoom(100);
            saveMapPosition();
          }
        }, 1100);

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
        logger.info('Fitting map to GeoJSON bounds', LogCategory.MAP, {
          bounds,
          featureCount: userGeoJSON.features.length
        });

        map.fitBounds(bounds, { padding: 50, duration: 1000 });

        setTimeout(() => {
          if (map) {
            baseZoomLevel = map.getZoom();
            globalActions.setMapZoom(100);
            saveMapPosition();
          }
        }, 1100);

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

  onMount(() => {
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
      scrollZoom: true,
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

      if (jsTable || userGeoJSON) {
        updateMapLayers(jsTable, userGeoJSON);
      } else if (shouldRestorePosition) {
        setTimeout(() => restoreMapPosition(), 100);
      }
    });

    map.on('zoom', () => {
      if (map && globalState.zoom.mode === ZoomMode.Map && !isZoomSyncing) {
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
