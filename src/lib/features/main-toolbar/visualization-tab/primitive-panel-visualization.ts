import {
  getEnabledPrimitiveFilters,
  getLinePrimitive,
  getPolygonPrimitive,
  getSymbolPrimitive,
  getTextPrimitive,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { FillMode } from '../constants';

type PanelBuilder = (
  visualization: VisualizationConfig | undefined
) => VisualizationConfig | undefined;

function memoizePanelBuilder(builder: PanelBuilder): PanelBuilder {
  const cache = new WeakMap<
    VisualizationConfig,
    VisualizationConfig | undefined
  >();
  return (visualization) => {
    if (!visualization) return builder(visualization);
    const cached = cache.get(visualization);
    if (cached !== undefined || cache.has(visualization)) {
      return cached;
    }
    const result = builder(visualization);
    cache.set(visualization, result);
    return result;
  };
}

function buildPolygonPanelVisualizationImpl(
  visualization: VisualizationConfig | undefined
): VisualizationConfig | undefined {
  const polygon = getPolygonPrimitive(visualization);
  if (!visualization || !polygon) {
    return undefined;
  }

  return {
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
      fillOpacity: polygon.fillMode === FillMode.NONE ? 0 : polygon.fillOpacity,
      strokeColor:
        (Array.isArray(polygon.strokeColor)
          ? polygon.strokeColor[0]
          : polygon.strokeColor) ?? visualization.style.strokeColor,
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
  };
}

function buildSymbolPanelVisualizationImpl(
  visualization: VisualizationConfig | undefined
): VisualizationConfig | undefined {
  const symbol = getSymbolPrimitive(visualization);
  if (!visualization || !symbol) {
    return undefined;
  }

  return {
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
      strokeColor: Array.isArray(symbol.strokeColor)
        ? symbol.strokeColor[0]
        : symbol.strokeColor,
      strokeWidth: symbol.strokeWidth,
      strokeOpacity: symbol.strokeOpacity,
      strokeDashed: symbol.strokeDashed,
      strokeDashedPattern: symbol.strokeDashedPattern
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
  };
}

function buildSymbolFillPanelVisualizationImpl(
  visualization: VisualizationConfig | undefined
): VisualizationConfig | undefined {
  const symbol = getSymbolPrimitive(visualization);
  if (!visualization || !symbol) {
    return undefined;
  }

  return {
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
  };
}

function buildLinePanelVisualizationImpl(
  visualization: VisualizationConfig | undefined
): VisualizationConfig | undefined {
  const line = getLinePrimitive(visualization);
  if (!visualization || !line) {
    return undefined;
  }

  return {
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
      lineDashed: line.dashed
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
  };
}

function buildTextPanelVisualizationImpl(
  visualization: VisualizationConfig | undefined
): VisualizationConfig | undefined {
  const text = getTextPrimitive(visualization);
  if (!visualization || !text) {
    return undefined;
  }

  return {
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
  };
}

function buildTextBackgroundPanelVisualizationImpl(
  visualization: VisualizationConfig | undefined
): VisualizationConfig | undefined {
  const text = getTextPrimitive(visualization);
  if (!visualization || !text) {
    return undefined;
  }

  const background = text.background;
  return {
    ...visualization,
    primitiveFilters: getEnabledPrimitiveFilters(visualization),
    modes: {
      ...visualization.modes,
      fill: background.fillMode,
      stroke: background.strokeMode
    },
    style: {
      ...visualization.style,
      fillColor: background.fillColor,
      fillOpacity:
        background.fillMode === FillMode.NONE ? 0 : background.fillOpacity,
      strokeColor: Array.isArray(background.strokeColor)
        ? background.strokeColor[0]
        : background.strokeColor,
      strokeWidth: background.strokeWidth,
      strokeOpacity: background.strokeOpacity,
      strokeDashed: background.strokeDashed,
      strokeDashedPattern: background.strokeDashedPattern
    },
    mapping: {
      ...visualization.mapping,
      valueColumn: background.valueColumn,
      categoryColumn: background.categoryColumn
    },
    classification: background.classification,
    missingData: undefined
  };
}

export const buildPolygonPanelVisualization = memoizePanelBuilder(
  buildPolygonPanelVisualizationImpl
);
export const buildSymbolPanelVisualization = memoizePanelBuilder(
  buildSymbolPanelVisualizationImpl
);
export const buildSymbolFillPanelVisualization = memoizePanelBuilder(
  buildSymbolFillPanelVisualizationImpl
);
export const buildLinePanelVisualization = memoizePanelBuilder(
  buildLinePanelVisualizationImpl
);
export const buildTextPanelVisualization = memoizePanelBuilder(
  buildTextPanelVisualizationImpl
);
export const buildTextBackgroundPanelVisualization = memoizePanelBuilder(
  buildTextBackgroundPanelVisualizationImpl
);
