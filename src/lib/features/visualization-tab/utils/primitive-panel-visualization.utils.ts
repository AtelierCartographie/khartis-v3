import {
  getEnabledPrimitiveFilters,
  getLinePrimitive,
  getPolygonPrimitive,
  getSymbolPrimitive,
  getTextPrimitive
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  applyFillModeOpacity,
  createPanelBuilder,
  extractStrokeColor
} from './panel-builder-factory.utils';

export const buildPolygonPanelVisualization = createPanelBuilder({
  getPrimitive: getPolygonPrimitive,
  build: (visualization, polygon) => ({
    ...visualization,
    primitiveFilters: getEnabledPrimitiveFilters(visualization),
    modes: {
      ...visualization.modes,
      fill: polygon.fillMode,
      stroke: polygon.strokeMode
    },
    style: {
      ...visualization.style,
      fillColor: polygon.fillColor,
      fillOpacity: applyFillModeOpacity(polygon.fillMode, polygon.fillOpacity),
      strokeColor:
        extractStrokeColor(polygon.strokeColor) ??
        visualization.style.strokeColor,
      strokeWidth: polygon.strokeWidth,
      strokeOpacity: polygon.strokeOpacity,
      strokeDashed: polygon.strokeDashed,
      strokeDashedPattern: polygon.strokeDashedPattern
    },
    mapping: {
      ...visualization.mapping,
      valueColumn: polygon.valueColumn,
      categoryColumn: polygon.categoryColumn
    },
    classification: polygon.classification,
    missingData: polygon.missingData
  })
});

export const buildSymbolPanelVisualization = createPanelBuilder({
  getPrimitive: getSymbolPrimitive,
  build: (visualization, symbol) => ({
    ...visualization,
    primitiveFilters: getEnabledPrimitiveFilters(visualization),
    modes: {
      ...visualization.modes,
      symbol: symbol.mode,
      fill: symbol.fillMode,
      stroke: symbol.strokeMode,
      proportionalType: symbol.proportionalType,
      categoryShape: symbol.categoryShape
    },
    style: {
      ...visualization.style,
      symbolFillColor: symbol.fillColor,
      fillColorB: symbol.fillColorB,
      strokeColor: extractStrokeColor(symbol.strokeColor),
      strokeWidth: symbol.strokeWidth,
      strokeOpacity: symbol.strokeOpacity,
      strokeDashed:
        symbol.strokeDashed ?? visualization.style.strokeDashed ?? false,
      strokeDashedPattern:
        symbol.strokeDashedPattern ?? visualization.style.strokeDashedPattern
    },
    mapping: {
      ...visualization.mapping,
      valueColumn: symbol.valueColumn,
      categoryColumn: symbol.categoryColumn,
      sizeColumn: symbol.sizeColumn
    },
    classification: symbol.classification,
    symbols: {
      ...(visualization.symbols ?? {
        type: symbol.shape,
        minSize: symbol.minSize,
        maxSize: symbol.maxSize,
        sizeScale: symbol.sizeScale
      }),
      type: symbol.shape,
      size: symbol.size,
      minSize: symbol.minSize,
      maxSize: symbol.maxSize,
      sizeScale: symbol.sizeScale,
      opacity: symbol.opacity
    },
    missingData: symbol.missingData
  })
});

export const buildSymbolFillPanelVisualization = createPanelBuilder({
  getPrimitive: getSymbolPrimitive,
  build: (visualization, symbol) => ({
    ...visualization,
    primitiveFilters: getEnabledPrimitiveFilters(visualization),
    modes: {
      ...visualization.modes,
      fill: symbol.fillMode
    },
    style: {
      ...visualization.style,
      symbolFillColor: symbol.fillColor,
      fillColorB: symbol.fillColorB
    },
    mapping: {
      ...visualization.mapping,
      valueColumn: symbol.fillValueColumn,
      categoryColumn: symbol.fillCategoryColumn
    },
    classification: symbol.fillClassification,
    missingData: symbol.missingData
  })
});

export const buildLinePanelVisualization = createPanelBuilder({
  getPrimitive: getLinePrimitive,
  build: (visualization, line) => ({
    ...visualization,
    primitiveFilters: getEnabledPrimitiveFilters(visualization),
    modes: {
      ...visualization.modes,
      color: line.colorMode,
      thickness: line.thicknessMode
    },
    style: {
      ...visualization.style,
      lineColor: line.color,
      lineOpacity: line.opacity,
      lineWidth: line.width,
      lineMaxWidth: line.maxWidth,
      lineDashed: line.dashed,
      lineDashedPattern: line.dashedPattern
    },
    mapping: {
      ...visualization.mapping,
      valueColumn: line.valueColumn,
      categoryColumn: line.categoryColumn,
      sizeColumn: line.sizeColumn
    },
    classification: line.classification,
    lineClassification: line.classification,
    lineThicknessClassification: line.thicknessClassification,
    missingData: line.missingData
  })
});

export const buildTextPanelVisualization = createPanelBuilder({
  getPrimitive: getTextPrimitive,
  build: (visualization, text) => ({
    ...visualization,
    primitiveFilters: getEnabledPrimitiveFilters(visualization),
    modes: {
      ...visualization.modes,
      color: text.colorMode,
      size: text.sizeMode
    },
    style: {
      ...visualization.style,
      textColor: text.color,
      textOpacity: text.enabled ? text.opacity : 0,
      textFontFamily: text.fontFamily,
      textSize: text.size,
      textBold: text.bold,
      textItalic: text.italic,
      textAlign: text.align,
      textHalo: text.halo,
      textHaloColor: text.haloColor,
      textHaloWidth: text.haloWidth,
      textCollisionDetection: text.collisionDetection,
      textDxpMasking: text.dxpMasking,
      labelColor: text.secondaryLabels.color,
      labelOpacity: text.secondaryLabels.opacity,
      labelFontFamily: text.secondaryLabels.fontFamily,
      labelSize: text.secondaryLabels.size,
      labelBold: text.secondaryLabels.bold,
      labelItalic: text.secondaryLabels.italic,
      labelAlign: text.secondaryLabels.align,
      labelHalo: text.secondaryLabels.halo,
      labelHaloColor: text.secondaryLabels.haloColor,
      labelHaloWidth: text.secondaryLabels.haloWidth,
      labelCollisionDetection: text.secondaryLabels.collisionDetection,
      labelDxpMasking: text.secondaryLabels.dxpMasking
    },
    mapping: {
      ...visualization.mapping,
      labelColumn: text.labelColumn,
      valueColumn: text.valueColumn,
      categoryColumn: text.categoryColumn,
      secondaryLabelColumn: text.secondaryLabels.labelColumn
    },
    classification: text.classification,
    missingData: text.missingData
  })
});
