<script lang="ts">
  import { MapboxOverlay } from '@deck.gl/mapbox';
  import type { DeckProps } from '@deck.gl/core';
  import { GeoJsonLayer } from '@deck.gl/layers';
  import * as geodecklayers from '@geoarrow/deck.gl-layers';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
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
  import { hexToRgb } from '../utils/color.utils';
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

  interface DeckMapProps {
    jsTable: ArrowTable | null;
    userGeoJSON: any | null;
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

  function formatValue(value: any): string {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'object') return '';
    if (typeof value === 'number') {
      return value.toLocaleString('fr-FR', {
        maximumFractionDigits: 2
      });
    }
    return String(value);
  }

  function updateTooltip({ object, x, y, coordinate }: any) {
    if (!tooltip) return;

    if (object) {
      const { geom, geometry, ...attributes } = object;

      const primaryData: [string, any][] = [];
      const secondaryData: [string, any][] = [];

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
        secondaryData.forEach(([key, value]) => {
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
      tooltip.style.display = 'none';
    }
  }

  function createDeckLayers(jsTable: ArrowTable): any[] {
    const geoMetadata = jsTable.schema.metadata.get('geo');
    if (!geoMetadata) {
      logger.warn('No geo metadata in table', LogCategory.MAP);
      return [];
    }

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

    let deckLayer;
    switch (geometryType.toUpperCase()) {
      case 'POINT':

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
          const categories = datasetsStore.getUniqueValues(
            datasetId,
            viz.mapping.categoryColumn
          );
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
            ? (object: any) => {
                const category = object[viz.mapping.categoryColumn!];
                return (
                  categoryColorMap?.get(String(category)) || [128, 128, 128]
                );
              }
            : fillColor,
          getLineColor: strokeColor,
          opacity: fillOpacity,
          lineOpacity: strokeOpacity,
          getRadius: useProportionalSymbols
            ? (object: any) => {
                const value = object[viz.mapping.sizeColumn!];
                if (value === null || value === undefined || isNaN(value))
                  return viz.symbols!.minSize;
                return getSizeForValue(
                  value,
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

      case 'MULTIPOLYGON': {
        const polygonChild = jsTable.getChild(geoColumn);
        if (!polygonChild) return [];

        const useChoropleth = viz && shouldApplyChoropleth(viz);

        deckLayer = new geodecklayers.GeoArrowPolygonLayer({
          id: 'polygon-layer',
          data: jsTable,
          getPolygon: polygonChild,
          getFillColor: useChoropleth
            ? (object: any) => {
                const value = object[viz.mapping.valueColumn!];
                if (value === null || value === undefined || isNaN(value)) {
                  return [200, 200, 200];
                }
                return getColorForValue(
                  value,
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
          onHover: updateTooltip
        });
        break;
      }

      default:
        return [];
    }

    return [deckLayer];
  }

  function createGeoJsonLayers(geojson: any): any[] {
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
      onHover: updateTooltip
    });

    return [layer];
  }

  function updateMapLayers(
    jsTable: ArrowTable | null,
    geojson: any | null
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

    let layers: any[];
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
      const bounds = calculateBoundsFromGeoArrow(jsTable);
      if (bounds) {
        map.fitBounds(bounds, { padding: 50, duration: 1000 });

        setTimeout(() => {
          if (map) {
            baseZoomLevel = map.getZoom();
            globalActions.setMapZoom(100);
          }
        }, 1100);

        lastFitTable = jsTable;
      }
    }
  });

  let lastFitGeoJSON = $state<any | null>(null);
  $effect(() => {
    if (userGeoJSON && isMapLoaded && map && lastFitGeoJSON !== userGeoJSON) {
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
          }
        }, 1100);

        lastFitGeoJSON = userGeoJSON;
      }
    }
  });

  $effect(() => {
    const zoomLevel = globalState.zoom.mapZoomLevel;
    syncZoomToMap();
  });

  $effect(() => {
    const styleUrl = basemapStyleStore.selectedStyleUrl;
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
    tooltip.style.maxWidth = '320px';
    tooltip.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)';
    tooltip.style.fontSize = '13px';
    tooltip.style.lineHeight = '1.4';
    document.body.appendChild(tooltip);

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
        map.addControl(deckOverlay as any);
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

    return () => {
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
</style>
