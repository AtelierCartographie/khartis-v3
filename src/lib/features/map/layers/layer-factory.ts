import type { Layer } from '@deck.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import * as geodecklayers from '@geoarrow/deck.gl-layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  ArrowExtension,
  createLayerId,
  DeckLayerId,
  GeometryType
} from '../constants';
import { arrowTableToGeoJSON, extractGeometryInfo } from '../io';
import type { DeckDataRow, GeometryInfo, LayerContext } from '../types';
import {
  shouldApplyCategorical,
  shouldApplyChoropleth,
  shouldApplyProportionalSymbols
} from '../utils/data-styling.utils';
import {
  BASE_FILL_COLOR,
  BASE_STROKE_COLOR,
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
    fillOpacity,
    strokeWidth,
    strokeOpacity,
    statistics,
    categoryColorMap,
    modelMatrix
  } = ctx;
  const { geoColumn, isWkbEncoded, isGeoJsonEncoded } = geometryInfo;
  const arrowExtension = geometryInfo.encoding;

  const useProportionalSymbols = viz && shouldApplyProportionalSymbols(viz);
  const useCategoricalColor = viz && shouldApplyCategorical(viz);
  const { min: minValue, max: maxValue } = statistics;

  const layerId = createLayerId(DeckLayerId.POINT_LAYER, datasetId);

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
  const { datasetId, fillColor, fillOpacity, strokeWidth, modelMatrix } = ctx;
  const {
    geoColumn,
    encoding: arrowExtension,
    isNativeGeoArrow,
    isWkbEncoded,
    isGeoJsonEncoded
  } = geometryInfo;

  const layerId = createLayerId(DeckLayerId.LINE_LAYER, datasetId);

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
    fillOpacity,
    strokeWidth,
    strokeOpacity,
    modelMatrix
  } = ctx;
  const {
    geoColumn,
    encoding: arrowExtension,
    isNativeGeoArrow,
    isWkbEncoded,
    isGeoJsonEncoded
  } = geometryInfo;

  const useChoropleth = viz && shouldApplyChoropleth(viz);
  const layerId = createLayerId(DeckLayerId.POLYGON_LAYER, datasetId);

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
        : fillColor;

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
    return [];
  }

  logger.info('Using GeoJsonLayer fallback for polygons', LogCategory.MAP, {
    encoding: arrowExtension,
    featureCount: geojsonData.features.length,
    hasVisualization: Boolean(viz)
  });

  const geoJsonFillColor =
    useChoropleth && viz
      ? createGeoJsonChoroplethColorAccessor(
          viz.mapping.valueColumn!,
          viz.classification!.breaks!,
          viz.classification!.colors!,
          fillColor
        )
      : fillColor;

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

export function createWorldBaseLayer(
  baseTable: ArrowTable,
  ctx?: LayerContext
): Layer<DeckDataRow> | null {
  const geometryInfo = extractGeometryInfo(baseTable);
  if (!geometryInfo) {
    logger.warn('World base table missing geo metadata', LogCategory.MAP);
    return null;
  }

  const modelMatrix = ctx?.modelMatrix;
  const {
    geoColumn,
    isNativeGeoArrow,
    encoding: arrowExtension
  } = geometryInfo;

  const isNativeGeoArrowPolygon =
    arrowExtension &&
    (arrowExtension === ArrowExtension.GEOARROW_POLYGON ||
      arrowExtension === ArrowExtension.GEOARROW_MULTIPOLYGON);

  if (isNativeGeoArrowPolygon || isNativeGeoArrow) {
    logger.debug('Using GeoArrowPolygonLayer for world base', LogCategory.MAP, {
      encoding: arrowExtension,
      rows: baseTable.numRows
    });

    const polygonProps: ConstructorParameters<
      typeof geodecklayers.GeoArrowPolygonLayer
    >[0] = {
      id: DeckLayerId.WORLD_BASE_LAYER,
      data: baseTable,
      filled: true,
      stroked: true,
      getFillColor: [...BASE_FILL_COLOR, 255],
      getLineColor: BASE_STROKE_COLOR,
      opacity: 1,
      lineWidthUnits: 'pixels',
      lineWidthScale: 0.25,
      pickable: false,
      autoHighlight: false,
      ...(modelMatrix && { modelMatrix })
    };

    return new geodecklayers.GeoArrowPolygonLayer(polygonProps);
  }

  try {
    const geojsonData = arrowTableToGeoJSON(baseTable, geoColumn);

    if (!geojsonData) {
      logger.warn(
        'Failed to convert world base table to GeoJSON',
        LogCategory.MAP
      );
      return null;
    }

    logger.debug(
      'Using GeoJsonLayer fallback for world base',
      LogCategory.MAP,
      {
        encoding: arrowExtension,
        featureCount: geojsonData.features.length
      }
    );

    return new GeoJsonLayer({
      id: DeckLayerId.WORLD_BASE_LAYER,
      data: geojsonData,
      getFillColor: [...BASE_FILL_COLOR, 255],
      getLineColor: BASE_STROKE_COLOR,
      opacity: 1,
      lineWidthUnits: 'pixels',
      lineWidthScale: 0.25,
      pickable: false,
      autoHighlight: false,
      ...(modelMatrix && { modelMatrix })
    });
  } catch (error) {
    logger.error('Failed to create world base layer', LogCategory.MAP, error);
    return null;
  }
}

export function createGeoJsonLayers(
  geojson: FeatureCollection,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const { fillColor, strokeColor, fillOpacity, strokeWidth, modelMatrix } = ctx;

  return [
    new GeoJsonLayer({
      id: DeckLayerId.GEOJSON_LAYER,
      data: geojson,
      filled: true,
      stroked: true,
      getFillColor: [...fillColor, fillOpacity * 255],
      getLineColor: strokeColor,
      getLineWidth: strokeWidth,
      lineWidthMinPixels: strokeWidth,
      pickable: true,
      autoHighlight: false,
      ...(modelMatrix && { modelMatrix }),
      updateTriggers: {
        getFillColor: [fillColor, fillOpacity],
        getLineColor: [strokeColor],
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
