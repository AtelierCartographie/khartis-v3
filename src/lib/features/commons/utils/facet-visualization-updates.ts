import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import {
  FACET_SLOT,
  getFacetMappingKey,
  type FacetSlotPath
} from '$lib/features/commons/constants/facets.constants';

export function buildFacetVariablePatch(
  visualization: VisualizationConfig,
  slotPath: FacetSlotPath,
  variableName: string
): Partial<VisualizationConfig> {
  const mappingKey = getFacetMappingKey(slotPath);
  const nextMapping = {
    ...visualization.mapping,
    [mappingKey]: variableName
  };

  switch (slotPath) {
    case FACET_SLOT.SYMBOL_VALUE:
      return {
        mapping: nextMapping,
        ...(visualization.symbol
          ? {
              symbol: {
                ...visualization.symbol,
                valueColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.SYMBOL_CATEGORY:
      return {
        mapping: nextMapping,
        ...(visualization.symbol
          ? {
              symbol: {
                ...visualization.symbol,
                categoryColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.SYMBOL_SIZE:
      return {
        mapping: nextMapping,
        ...(visualization.symbol
          ? {
              symbol: {
                ...visualization.symbol,
                sizeColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.SYMBOL_FILL_VALUE:
      return {
        mapping: nextMapping,
        ...(visualization.symbol
          ? {
              symbol: {
                ...visualization.symbol,
                fillValueColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.SYMBOL_FILL_CATEGORY:
      return {
        mapping: nextMapping,
        ...(visualization.symbol
          ? {
              symbol: {
                ...visualization.symbol,
                fillCategoryColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.SYMBOL_STROKE_VALUE:
      return {
        mapping: nextMapping,
        ...(visualization.symbol
          ? {
              symbol: {
                ...visualization.symbol,
                strokeValueColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.SYMBOL_STROKE_CATEGORY:
      return {
        mapping: nextMapping,
        ...(visualization.symbol
          ? {
              symbol: {
                ...visualization.symbol,
                strokeCategoryColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.POLYGON_VALUE:
      return {
        mapping: nextMapping,
        ...(visualization.polygon
          ? {
              polygon: {
                ...visualization.polygon,
                valueColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.POLYGON_CATEGORY:
      return {
        mapping: nextMapping,
        ...(visualization.polygon
          ? {
              polygon: {
                ...visualization.polygon,
                categoryColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.POLYGON_STROKE_VALUE:
      return {
        mapping: nextMapping,
        ...(visualization.polygon
          ? {
              polygon: {
                ...visualization.polygon,
                strokeValueColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.POLYGON_STROKE_CATEGORY:
      return {
        mapping: nextMapping,
        ...(visualization.polygon
          ? {
              polygon: {
                ...visualization.polygon,
                strokeCategoryColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.LINE_VALUE:
    case FACET_SLOT.LINE_THICKNESS_VALUE:
      return {
        mapping: nextMapping,
        ...(visualization.line
          ? {
              line: {
                ...visualization.line,
                valueColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.LINE_CATEGORY:
      return {
        mapping: nextMapping,
        ...(visualization.line
          ? {
              line: {
                ...visualization.line,
                categoryColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.LINE_SIZE:
      return {
        mapping: nextMapping,
        ...(visualization.line
          ? {
              line: {
                ...visualization.line,
                sizeColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.TEXT_VALUE:
      return {
        mapping: nextMapping,
        ...(visualization.text
          ? {
              text: {
                ...visualization.text,
                valueColumn: variableName
              }
            }
          : {})
      };

    case FACET_SLOT.TEXT_CATEGORY:
      return {
        mapping: nextMapping,
        ...(visualization.text
          ? {
              text: {
                ...visualization.text,
                categoryColumn: variableName
              }
            }
          : {})
      };
  }
}

export function applyFacetVariablePatch(
  visualization: VisualizationConfig,
  slotPath: FacetSlotPath,
  variableName: string
): void {
  Object.assign(
    visualization,
    buildFacetVariablePatch(visualization, slotPath, variableName)
  );
}

export function getFacetSlotVariable(
  visualization: VisualizationConfig,
  slotPath: FacetSlotPath
): string | undefined {
  switch (slotPath) {
    case FACET_SLOT.SYMBOL_VALUE:
      return visualization.symbol?.valueColumn;
    case FACET_SLOT.SYMBOL_CATEGORY:
      return visualization.symbol?.categoryColumn;
    case FACET_SLOT.SYMBOL_SIZE:
      return visualization.symbol?.sizeColumn;
    case FACET_SLOT.SYMBOL_FILL_VALUE:
      return visualization.symbol?.fillValueColumn;
    case FACET_SLOT.SYMBOL_FILL_CATEGORY:
      return visualization.symbol?.fillCategoryColumn;
    case FACET_SLOT.SYMBOL_STROKE_VALUE:
      return visualization.symbol?.strokeValueColumn;
    case FACET_SLOT.SYMBOL_STROKE_CATEGORY:
      return visualization.symbol?.strokeCategoryColumn;
    case FACET_SLOT.POLYGON_VALUE:
      return visualization.polygon?.valueColumn;
    case FACET_SLOT.POLYGON_CATEGORY:
      return visualization.polygon?.categoryColumn;
    case FACET_SLOT.POLYGON_STROKE_VALUE:
      return visualization.polygon?.strokeValueColumn;
    case FACET_SLOT.POLYGON_STROKE_CATEGORY:
      return visualization.polygon?.strokeCategoryColumn;
    case FACET_SLOT.LINE_VALUE:
    case FACET_SLOT.LINE_THICKNESS_VALUE:
      return visualization.line?.valueColumn;
    case FACET_SLOT.LINE_CATEGORY:
      return visualization.line?.categoryColumn;
    case FACET_SLOT.LINE_SIZE:
      return visualization.line?.sizeColumn;
    case FACET_SLOT.TEXT_VALUE:
      return visualization.text?.valueColumn;
    case FACET_SLOT.TEXT_CATEGORY:
      return visualization.text?.categoryColumn;
  }
}
