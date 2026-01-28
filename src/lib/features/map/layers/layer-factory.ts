import type { Layer } from '@deck.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import * as geodecklayers from '@geoarrow/deck.gl-layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
import * as m from '$lib/paraglide/messages';
import {
  ArrowExtension,
  createLayerId,
  DeckLayerId,
  GeometryType
} from '../constants';
import { arrowTableToGeoJSON, extractGeometryInfo } from '../io';
import type { PrimitiveFilter } from '$lib/features/commons/store/visualization.store.svelte';
import type { DeckDataRow, GeometryInfo, LayerContext } from '../types';

const HIGHLIGHT_DIMMING_FACTOR = 0.3;
import {
  shouldApplyCategorical,
  shouldApplyChoropleth,
  shouldApplyProportionalSymbols
} from '../utils/data-styling.utils';
import {
  createCategoricalColorAccessor,
  createChoroplethColorAccessor,
  createGeoJsonCategoricalColorAccessor,
  createGeoJsonChoroplethColorAccessor,
  createGeoJsonProportionalSizeAccessor,
  createProportionalSizeAccessor,
  withOpacity
} from './layer-helpers';

export type { LayerContext };

export function createPointLayers(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const {
    viz,
    datasetId,
    fillColor,
    strokeColor,
    fillOpacity: rawFillOpacity,
    strokeWidth,
    strokeOpacity: rawStrokeOpacity,
    statistics,
    categoryColorMap,
    highlightedRowIds,
    modelMatrix,
    projectionSuffix,
    beforeId
  } = ctx;
  const hasHighlights = highlightedRowIds && highlightedRowIds.size > 0;
  const fillOpacity = hasHighlights
    ? rawFillOpacity * HIGHLIGHT_DIMMING_FACTOR
    : rawFillOpacity;
  const strokeOpacity = hasHighlights
    ? rawStrokeOpacity * HIGHLIGHT_DIMMING_FACTOR
    : rawStrokeOpacity;
  const { geoColumn, isWkbEncoded, isGeoJsonEncoded } = geometryInfo;
  const arrowExtension = geometryInfo.encoding;

  const useProportionalSymbols = viz && shouldApplyProportionalSymbols(viz);
  const useCategoricalColor = viz && shouldApplyCategorical(viz);
  const { min: minValue, max: maxValue } = statistics;

  const highlightSuffix = hasHighlights ? `-hl${highlightedRowIds.size}` : '';
  const styleFingerprint = `${fillColor.join(',')}-${fillOpacity}-${strokeWidth}-${strokeOpacity}${highlightSuffix}`;
  const layerId = createLayerId(
    DeckLayerId.POINT_LAYER,
    datasetId,
    projectionSuffix
      ? `${projectionSuffix}-${styleFingerprint}`
      : styleFingerprint
  );

  const isNativeGeoArrowPoint =
    arrowExtension &&
    (arrowExtension === ArrowExtension.GEOARROW_POINT ||
      arrowExtension === ArrowExtension.GEOARROW_MULTIPOINT);

  if (!isNativeGeoArrowPoint && (isWkbEncoded || isGeoJsonEncoded)) {
    logger.info(
      'Using GeoJsonLayer fallback for points (WKB/GeoJSON encoded)',
      LogCategory.MAP,
      { arrowExtension, geometryType: geometryInfo.type }
    );

    let geojsonData;
    try {
      geojsonData = arrowTableToGeoJSON(jsTable, geoColumn);
    } catch (error) {
      logger.error(
        'Error converting point geometry to GeoJSON',
        LogCategory.MAP,
        {
          encoding: arrowExtension,
          error: error instanceof Error ? error.message : String(error)
        }
      );
      return [];
    }
    if (!geojsonData) {
      logger.warn(
        'Failed to convert point geometry to GeoJSON',
        LogCategory.MAP,
        {
          encoding: arrowExtension
        }
      );
      showWarning(
        m.error_geometry_conversion_title(),
        m.error_geometry_conversion_message()
      );
      return [];
    }

    const geoJsonFillColor =
      useCategoricalColor && viz
        ? createGeoJsonCategoricalColorAccessor(
            viz.mapping.categoryColumn!,
            categoryColorMap,
            fillColor
          )
        : fillColor;

    const geoJsonRadius =
      useProportionalSymbols && viz
        ? createGeoJsonProportionalSizeAccessor(
            viz.mapping.sizeColumn!,
            minValue,
            maxValue,
            viz.symbols!.minSize,
            viz.symbols!.maxSize,
            viz.symbols!.sizeScale
          )
        : 5;

    return [
      new GeoJsonLayer({
        id: layerId,
        data: geojsonData,
        pointType: 'circle',
        filled: true,
        stroked: true,
        getFillColor: geoJsonFillColor,
        getLineColor: withOpacity(strokeColor, strokeOpacity),
        getPointRadius: geoJsonRadius,
        pointRadiusUnits: 'pixels',
        lineWidthUnits: 'pixels',
        getLineWidth: strokeWidth / 3,
        opacity: fillOpacity,
        pickable: true,
        autoHighlight: false,
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        updateTriggers: {
          getFillColor: [
            useCategoricalColor,
            viz?.mapping.categoryColumn,
            categoryColorMap,
            fillColor
          ],
          getPointRadius: [
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
      })
    ];
  }

  const scatterplotProps: ConstructorParameters<
    typeof geodecklayers.GeoArrowScatterplotLayer
  >[0] = {
    id: layerId,
    data: jsTable,
    stroked: true,
    getFillColor:
      useCategoricalColor && viz
        ? createCategoricalColorAccessor(
            viz.mapping.categoryColumn!,
            categoryColorMap
          )
        : fillColor,
    getLineColor: withOpacity(strokeColor, strokeOpacity),
    opacity: fillOpacity,
    getRadius:
      useProportionalSymbols && viz
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
    ...(modelMatrix && { modelMatrix }),
    ...(beforeId && { beforeId }),
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

  return [new geodecklayers.GeoArrowScatterplotLayer(scatterplotProps)];
}

export function createLineLayers(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const {
    datasetId,
    fillColor,
    fillOpacity: rawLineFillOpacity,
    strokeWidth,
    highlightedRowIds: lineHighlightedRowIds,
    modelMatrix,
    projectionSuffix,
    beforeId
  } = ctx;
  const hasLineHighlights =
    lineHighlightedRowIds && lineHighlightedRowIds.size > 0;
  const fillOpacity = hasLineHighlights
    ? rawLineFillOpacity * HIGHLIGHT_DIMMING_FACTOR
    : rawLineFillOpacity;
  const {
    geoColumn,
    encoding: arrowExtension,
    isNativeGeoArrow,
    isWkbEncoded,
    isGeoJsonEncoded
  } = geometryInfo;

  const lineHighlightSuffix = hasLineHighlights
    ? `-hl${lineHighlightedRowIds.size}`
    : '';
  const styleFingerprint = `${fillColor.join(',')}-${fillOpacity}-${strokeWidth}${lineHighlightSuffix}`;
  const layerId = createLayerId(
    DeckLayerId.LINE_LAYER,
    datasetId,
    projectionSuffix
      ? `${projectionSuffix}-${styleFingerprint}`
      : styleFingerprint
  );

  const isNativeGeoArrowLine =
    arrowExtension &&
    (arrowExtension === ArrowExtension.GEOARROW_LINESTRING ||
      arrowExtension === ArrowExtension.GEOARROW_MULTILINESTRING);

  if (isNativeGeoArrowLine || isNativeGeoArrow) {
    logger.info('Using GeoArrowPathLayer for lines', LogCategory.MAP, {
      encoding: arrowExtension,
      rows: jsTable.numRows
    });

    const pathProps: ConstructorParameters<
      typeof geodecklayers.GeoArrowPathLayer
    >[0] = {
      id: layerId,
      data: jsTable,
      getColor: withOpacity(fillColor, fillOpacity),
      widthUnits: 'pixels',
      getWidth: strokeWidth,
      widthMinPixels: 1,
      pickable: true,
      autoHighlight: false,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getColor: [fillColor, fillOpacity],
        getWidth: [strokeWidth]
      }
    };

    return [new geodecklayers.GeoArrowPathLayer(pathProps)];
  }

  if (!isWkbEncoded && !isGeoJsonEncoded) {
    logger.warn(
      'Unknown line encoding, attempting GeoJSON fallback',
      LogCategory.MAP,
      { arrowExtension }
    );
  }

  let lineGeojsonData;
  try {
    lineGeojsonData = arrowTableToGeoJSON(jsTable, geoColumn);
  } catch (error) {
    logger.error('Error converting line geometry to GeoJSON', LogCategory.MAP, {
      encoding: arrowExtension,
      geoColumn,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
  if (!lineGeojsonData) {
    logger.warn('Failed to convert line geometry to GeoJSON', LogCategory.MAP, {
      encoding: arrowExtension,
      geoColumn
    });
    showWarning(
      m.error_geometry_conversion_title(),
      m.error_geometry_conversion_message()
    );
    return [];
  }

  logger.info('Using GeoJsonLayer fallback for lines', LogCategory.MAP, {
    encoding: arrowExtension,
    featureCount: lineGeojsonData.features.length
  });

  return [
    new GeoJsonLayer({
      id: layerId,
      data: lineGeojsonData,
      stroked: true,
      filled: false,
      getLineColor: withOpacity(fillColor, fillOpacity),
      lineWidthUnits: 'pixels',
      getLineWidth: strokeWidth,
      lineWidthMinPixels: 1,
      pickable: true,
      autoHighlight: false,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getLineColor: [fillColor, fillOpacity],
        getLineWidth: [strokeWidth]
      }
    })
  ];
}

export function createPolygonLayers(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const {
    viz,
    datasetId,
    fillColor,
    strokeColor,
    fillOpacity: rawPolyFillOpacity,
    strokeWidth,
    strokeOpacity: rawPolyStrokeOpacity,
    highlightedRowIds: polyHighlightedRowIds,
    modelMatrix,
    projectionSuffix,
    beforeId
  } = ctx;
  const hasPolyHighlights =
    polyHighlightedRowIds && polyHighlightedRowIds.size > 0;
  const fillOpacity = hasPolyHighlights
    ? rawPolyFillOpacity * HIGHLIGHT_DIMMING_FACTOR
    : rawPolyFillOpacity;
  const strokeOpacity = hasPolyHighlights
    ? rawPolyStrokeOpacity * HIGHLIGHT_DIMMING_FACTOR
    : rawPolyStrokeOpacity;
  const {
    geoColumn,
    encoding: arrowExtension,
    isNativeGeoArrow,
    isWkbEncoded,
    isGeoJsonEncoded
  } = geometryInfo;

  const useChoropleth = viz && shouldApplyChoropleth(viz);
  const polyHighlightSuffix = hasPolyHighlights
    ? `-hl${polyHighlightedRowIds.size}`
    : '';
  const styleFingerprint = `${fillColor.join(',')}-${fillOpacity}-${strokeWidth}-${strokeOpacity}${polyHighlightSuffix}`;
  const layerId = createLayerId(
    DeckLayerId.POLYGON_LAYER,
    datasetId,
    projectionSuffix
      ? `${projectionSuffix}-${styleFingerprint}`
      : styleFingerprint
  );

  if (!isNativeGeoArrow && !isGeoJsonEncoded && !isWkbEncoded) {
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

  const isNativeGeoArrowPolygon =
    arrowExtension &&
    (arrowExtension === ArrowExtension.GEOARROW_POLYGON ||
      arrowExtension === ArrowExtension.GEOARROW_MULTIPOLYGON);

  if (isNativeGeoArrowPolygon || isNativeGeoArrow) {
    logger.info('Using GeoArrowPolygonLayer for polygons', LogCategory.MAP, {
      encoding: arrowExtension,
      rows: jsTable.numRows,
      hasVisualization: Boolean(viz)
    });

    const arrowFillColor =
      useChoropleth && viz
        ? createChoroplethColorAccessor(
            viz.mapping.valueColumn!,
            viz.classification!.breaks!,
            viz.classification!.colors!
          )
        : ([fillColor[0], fillColor[1], fillColor[2], 255] as [
            number,
            number,
            number,
            number
          ]);

    const polygonProps: ConstructorParameters<
      typeof geodecklayers.GeoArrowPolygonLayer
    >[0] = {
      id: layerId,
      data: jsTable,
      filled: true,
      stroked: true,
      getFillColor: arrowFillColor,
      getLineColor: withOpacity(strokeColor, strokeOpacity),
      opacity: fillOpacity,
      lineWidthUnits: 'pixels',
      lineWidthScale: strokeWidth / 4,
      pickable: true,
      autoHighlight: false,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
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
    };

    return [new geodecklayers.GeoArrowPolygonLayer(polygonProps)];
  }

  let geojsonData;
  try {
    geojsonData = arrowTableToGeoJSON(jsTable, geoColumn);
  } catch (error) {
    logger.error(
      'Error converting polygon geometry to GeoJSON',
      LogCategory.MAP,
      {
        encoding: arrowExtension,
        geoColumn,
        error: error instanceof Error ? error.message : String(error)
      }
    );
    return [];
  }
  if (!geojsonData) {
    logger.warn('Failed to convert geometry to GeoJSON', LogCategory.MAP, {
      encoding: arrowExtension
    });
    showWarning(
      m.error_geometry_conversion_title(),
      m.error_geometry_conversion_message()
    );
    return [];
  }

  logger.info('Using GeoJsonLayer fallback for polygons', LogCategory.MAP, {
    encoding: arrowExtension,
    featureCount: geojsonData.features.length,
    hasVisualization: Boolean(viz)
  });

  const defaultFillWithAlpha = [
    fillColor[0],
    fillColor[1],
    fillColor[2],
    255
  ] as [number, number, number, number];
  const geoJsonFillColor =
    useChoropleth && viz
      ? createGeoJsonChoroplethColorAccessor(
          viz.mapping.valueColumn!,
          viz.classification!.breaks!,
          viz.classification!.colors!,
          fillColor
        )
      : defaultFillWithAlpha;

  return [
    new GeoJsonLayer({
      id: layerId,
      data: geojsonData,
      getFillColor: geoJsonFillColor,
      getLineColor: withOpacity(strokeColor, strokeOpacity),
      opacity: fillOpacity,
      lineWidthUnits: 'pixels',
      lineWidthScale: strokeWidth / 4,
      pickable: true,
      autoHighlight: false,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
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
    })
  ];
}

export function createGeoJsonLayers(
  geojson: FeatureCollection,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const {
    datasetId,
    fillColor,
    strokeColor,
    fillOpacity,
    strokeWidth,
    strokeOpacity,
    modelMatrix,
    projectionSuffix,
    beforeId
  } = ctx;

  const styleFingerprint = `${fillColor.join(',')}-${fillOpacity}-${strokeWidth}-${strokeOpacity}`;
  const layerId = createLayerId(
    DeckLayerId.GEOJSON_LAYER,
    datasetId,
    projectionSuffix
      ? `${projectionSuffix}-${styleFingerprint}`
      : styleFingerprint
  );

  return [
    new GeoJsonLayer({
      id: layerId,
      data: geojson,
      filled: true,
      stroked: true,
      getFillColor: [...fillColor, Math.round(fillOpacity * 255)],
      getLineColor: withOpacity(strokeColor, strokeOpacity),
      getLineWidth: strokeWidth,
      lineWidthMinPixels: Math.max(1, strokeWidth),
      pickable: true,
      autoHighlight: false,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getFillColor: [fillColor, fillOpacity],
        getLineColor: [strokeColor, strokeOpacity],
        getLineWidth: [strokeWidth]
      }
    })
  ];
}

export function createDeckLayers(
  jsTable: ArrowTable,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const geometryInfo = extractGeometryInfo(jsTable);

  if (!geometryInfo) {
    const hasUserDataset = Boolean(ctx.datasetId);
    if (hasUserDataset) {
      logger.error('No GeoArrow metadata in Arrow table', LogCategory.MAP, {
        datasetId: ctx.datasetId
      });
    }
    return [];
  }

  const resolvedGeometryType = geometryInfo.type;

  const primitiveMap: Record<string, PrimitiveFilter> = {
    [GeometryType.POINT]: 'point',
    [GeometryType.MULTIPOINT]: 'point',
    [GeometryType.LINESTRING]: 'line',
    [GeometryType.MULTILINESTRING]: 'line',
    [GeometryType.POLYGON]: 'polygon',
    [GeometryType.MULTIPOLYGON]: 'polygon'
  };

  const primitive = primitiveMap[resolvedGeometryType];
  if (
    primitive &&
    ctx.viz?.primitiveFilters &&
    !ctx.viz.primitiveFilters.includes(primitive)
  ) {
    return [];
  }

  switch (resolvedGeometryType) {
    case GeometryType.POINT:
    case GeometryType.MULTIPOINT:
      return createPointLayers(jsTable, geometryInfo, ctx);

    case GeometryType.LINESTRING:
    case GeometryType.MULTILINESTRING:
      return createLineLayers(jsTable, geometryInfo, ctx);

    case GeometryType.POLYGON:
    case GeometryType.MULTIPOLYGON:
      return createPolygonLayers(jsTable, geometryInfo, ctx);

    default:
      logger.error(
        'Unsupported geometry type for Deck layer',
        LogCategory.MAP,
        {
          geometryType: resolvedGeometryType,
          datasetId: ctx.datasetId
        }
      );
      return [];
  }
}
