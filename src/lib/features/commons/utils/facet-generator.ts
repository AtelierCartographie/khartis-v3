import { m } from '$lib/paraglide/messages.js';
import type { VisualizationConfig } from '../store/visualization.store.svelte';
import { datasetsStore } from '../store/datasets.store.svelte';
import { deepClone } from './clone.utils';
import {
  FACET_SLOT,
  SCALE_MODE,
  type FacetSlotPath,
  type ScaleMode
} from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';
import {
  findPaletteById,
  generatePaletteColors,
  PALETTE_TYPE,
  type Palette
} from '$lib/features/commons/components/palette-popover/palette.constants';

function buildEqualIntervalBreaks(
  min: number,
  max: number,
  classes: number
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min, max];
  }

  const totalClasses = Math.max(2, classes);
  const step = (max - min) / totalClasses;
  const breaks = [min];

  for (let i = 1; i < totalClasses; i += 1) {
    breaks.push(min + step * i);
  }

  breaks.push(max);
  return breaks;
}

function resolveFacetMappingKey(
  slotPath: FacetSlotPath
): keyof NonNullable<VisualizationConfig['mapping']> {
  if (slotPath.endsWith('.categoryColumn')) {
    return 'categoryColumn';
  }
  if (slotPath.endsWith('.sizeColumn')) {
    return 'sizeColumn';
  }
  return 'valueColumn';
}

function resolveFacetClassification(
  visualization: VisualizationConfig,
  slotPath: FacetSlotPath
): VisualizationConfig['classification'] {
  switch (slotPath) {
    case FACET_SLOT.SYMBOL_VALUE:
    case FACET_SLOT.SYMBOL_CATEGORY:
    case FACET_SLOT.SYMBOL_SIZE:
      return (
        visualization.symbol?.classification ?? visualization.classification
      );

    case FACET_SLOT.LINE_VALUE:
    case FACET_SLOT.LINE_CATEGORY:
    case FACET_SLOT.LINE_SIZE:
      return visualization.line?.classification ?? visualization.classification;

    case FACET_SLOT.TEXT_VALUE:
    case FACET_SLOT.TEXT_CATEGORY:
      return visualization.text?.classification ?? visualization.classification;

    case FACET_SLOT.TEXT_BACKGROUND_VALUE:
    case FACET_SLOT.TEXT_BACKGROUND_CATEGORY:
      return visualization.text?.background?.classification;

    case FACET_SLOT.TEXT_BACKGROUND_STROKE_VALUE:
    case FACET_SLOT.TEXT_BACKGROUND_STROKE_CATEGORY:
      return visualization.text?.background?.strokeClassification;

    case FACET_SLOT.POLYGON_VALUE:
    case FACET_SLOT.POLYGON_CATEGORY:
    default:
      return (
        visualization.polygon?.classification ?? visualization.classification
      );
  }
}

function resolveQualitativePalette(
  classification: NonNullable<VisualizationConfig['classification']>
): Palette | null {
  if (classification.paletteId) {
    const palette = findPaletteById(classification.paletteId);
    if (palette) {
      return palette;
    }
  }

  if (!classification.colors?.length) {
    return null;
  }

  return {
    id: 'facet-derived-qualitative',
    colors: classification.colors,
    type: PALETTE_TYPE.QUALITATIVE
  };
}

function buildCategoricalFacetClassification(
  baseViz: VisualizationConfig,
  variable: string,
  baseClassification: NonNullable<VisualizationConfig['classification']>
): VisualizationConfig['classification'] {
  const labels = datasetsStore
    .getUniqueValues(baseViz.datasetId, variable)
    .map((value) => (value == null ? null : String(value)))
    .filter((value): value is string => Boolean(value));

  const palette = resolveQualitativePalette(baseClassification);
  const colors =
    labels.length > 0 && palette
      ? generatePaletteColors(palette, labels.length)
      : baseClassification.colors;

  return {
    ...baseClassification,
    labels: labels.length > 0 ? labels : (baseClassification.labels ?? []),
    colors
  };
}

function applyFacetVariableToVisualization(
  visualization: VisualizationConfig,
  slotPath: FacetSlotPath,
  variable: string
): void {
  const mappingKey = resolveFacetMappingKey(slotPath);
  visualization.mapping = {
    ...visualization.mapping,
    [mappingKey]: variable
  };

  switch (slotPath) {
    case FACET_SLOT.SYMBOL_VALUE:
      if (visualization.symbol) {
        visualization.symbol = {
          ...visualization.symbol,
          valueColumn: variable
        };
      }
      return;

    case FACET_SLOT.SYMBOL_CATEGORY:
      if (visualization.symbol) {
        visualization.symbol = {
          ...visualization.symbol,
          categoryColumn: variable
        };
      }
      return;

    case FACET_SLOT.SYMBOL_SIZE:
      if (visualization.symbol) {
        visualization.symbol = {
          ...visualization.symbol,
          sizeColumn: variable
        };
      }
      return;

    case FACET_SLOT.POLYGON_VALUE:
      if (visualization.polygon) {
        visualization.polygon = {
          ...visualization.polygon,
          valueColumn: variable
        };
      }
      return;

    case FACET_SLOT.POLYGON_CATEGORY:
      if (visualization.polygon) {
        visualization.polygon = {
          ...visualization.polygon,
          categoryColumn: variable
        };
      }
      return;

    case FACET_SLOT.LINE_VALUE:
      if (visualization.line) {
        visualization.line = {
          ...visualization.line,
          valueColumn: variable
        };
      }
      return;

    case FACET_SLOT.LINE_CATEGORY:
      if (visualization.line) {
        visualization.line = {
          ...visualization.line,
          categoryColumn: variable
        };
      }
      return;

    case FACET_SLOT.LINE_SIZE:
      if (visualization.line) {
        visualization.line = {
          ...visualization.line,
          sizeColumn: variable
        };
      }
      return;

    case FACET_SLOT.TEXT_VALUE:
      if (visualization.text) {
        visualization.text = {
          ...visualization.text,
          valueColumn: variable
        };
      }
      return;

    case FACET_SLOT.TEXT_CATEGORY:
      if (visualization.text) {
        visualization.text = {
          ...visualization.text,
          categoryColumn: variable
        };
      }
      return;

    case FACET_SLOT.TEXT_BACKGROUND_VALUE:
      if (visualization.text?.background) {
        visualization.text = {
          ...visualization.text,
          background: {
            ...visualization.text.background,
            valueColumn: variable
          }
        };
      }
      return;

    case FACET_SLOT.TEXT_BACKGROUND_CATEGORY:
      if (visualization.text?.background) {
        visualization.text = {
          ...visualization.text,
          background: {
            ...visualization.text.background,
            categoryColumn: variable
          }
        };
      }
      return;

    case FACET_SLOT.TEXT_BACKGROUND_STROKE_VALUE:
      if (visualization.text?.background) {
        visualization.text = {
          ...visualization.text,
          background: {
            ...visualization.text.background,
            strokeValueColumn: variable
          }
        };
      }
      return;

    case FACET_SLOT.TEXT_BACKGROUND_STROKE_CATEGORY:
      if (visualization.text?.background) {
        visualization.text = {
          ...visualization.text,
          background: {
            ...visualization.text.background,
            strokeCategoryColumn: variable
          }
        };
      }
      return;
  }
}

function applyFacetClassificationToVisualization(
  visualization: VisualizationConfig,
  slotPath: FacetSlotPath,
  classification: VisualizationConfig['classification']
): void {
  switch (slotPath) {
    case FACET_SLOT.SYMBOL_VALUE:
    case FACET_SLOT.SYMBOL_CATEGORY:
    case FACET_SLOT.SYMBOL_SIZE:
      visualization.classification = classification;
      visualization.symbolClassification = classification;
      if (visualization.symbol) {
        visualization.symbol = {
          ...visualization.symbol,
          classification
        };
      }
      return;

    case FACET_SLOT.LINE_VALUE:
    case FACET_SLOT.LINE_CATEGORY:
    case FACET_SLOT.LINE_SIZE:
      visualization.classification = classification;
      visualization.lineClassification = classification;
      if (visualization.line) {
        visualization.line = {
          ...visualization.line,
          classification
        };
      }
      return;

    case FACET_SLOT.TEXT_VALUE:
    case FACET_SLOT.TEXT_CATEGORY:
      visualization.classification = classification;
      visualization.textClassification = classification;
      if (visualization.text) {
        visualization.text = {
          ...visualization.text,
          classification
        };
      }
      return;

    case FACET_SLOT.TEXT_BACKGROUND_VALUE:
    case FACET_SLOT.TEXT_BACKGROUND_CATEGORY:
      if (visualization.text?.background) {
        visualization.text = {
          ...visualization.text,
          background: {
            ...visualization.text.background,
            classification
          }
        };
      }
      return;

    case FACET_SLOT.TEXT_BACKGROUND_STROKE_VALUE:
    case FACET_SLOT.TEXT_BACKGROUND_STROKE_CATEGORY:
      if (visualization.text?.background) {
        visualization.text = {
          ...visualization.text,
          background: {
            ...visualization.text.background,
            strokeClassification: classification
          }
        };
      }
      return;

    case FACET_SLOT.POLYGON_VALUE:
    case FACET_SLOT.POLYGON_CATEGORY:
    default:
      visualization.classification = classification;
      if (visualization.polygon) {
        visualization.polygon = {
          ...visualization.polygon,
          classification
        };
      }
  }
}

function buildFacetClassification(
  baseViz: VisualizationConfig,
  variable: string,
  scaleMode: ScaleMode,
  slotPath: FacetSlotPath
): VisualizationConfig['classification'] {
  const baseClassification = resolveFacetClassification(baseViz, slotPath);
  if (!baseClassification) {
    return baseClassification;
  }

  if (slotPath.endsWith('.categoryColumn')) {
    return buildCategoricalFacetClassification(
      baseViz,
      variable,
      baseClassification
    );
  }

  if (!slotPath.endsWith('.valueColumn')) {
    return { ...baseClassification };
  }

  if (scaleMode === SCALE_MODE.SHARED) {
    return { ...baseClassification };
  }

  const stats = datasetsStore.getColumnStatistics(baseViz.datasetId, variable);
  if (
    !stats ||
    !('min' in stats) ||
    !('max' in stats) ||
    typeof stats.min !== 'number' ||
    typeof stats.max !== 'number' ||
    !Number.isFinite(stats.min) ||
    !Number.isFinite(stats.max)
  ) {
    return { ...baseClassification };
  }

  const classes =
    baseClassification.numClasses ?? baseClassification.classes ?? 5;
  const independentBreaks = buildEqualIntervalBreaks(
    stats.min,
    stats.max,
    classes
  );

  return {
    ...baseClassification,
    numClasses: classes,
    classes,
    breaks: independentBreaks
  };
}

export function buildFacetVisualizationUpdates({
  baseViz,
  visualization,
  variable,
  scaleMode,
  primarySlotPath
}: {
  baseViz: VisualizationConfig;
  visualization: VisualizationConfig;
  variable: string;
  scaleMode: ScaleMode;
  primarySlotPath: FacetSlotPath;
}): Partial<VisualizationConfig> {
  const nextVisualization = deepClone(visualization);

  applyFacetVariableToVisualization(
    nextVisualization,
    primarySlotPath,
    variable
  );
  applyFacetClassificationToVisualization(
    nextVisualization,
    primarySlotPath,
    buildFacetClassification(baseViz, variable, scaleMode, primarySlotPath)
  );

  return {
    name: variable,
    mapping: nextVisualization.mapping,
    classification: nextVisualization.classification,
    symbolClassification: nextVisualization.symbolClassification,
    lineClassification: nextVisualization.lineClassification,
    textClassification: nextVisualization.textClassification,
    symbol: nextVisualization.symbol,
    polygon: nextVisualization.polygon,
    line: nextVisualization.line,
    text: nextVisualization.text,
    facet: {
      baseVisualizationId: baseViz.id
    }
  };
}

export async function generateFacetVisualizations(
  baseViz: VisualizationConfig,
  variables: string[],
  scaleMode: ScaleMode,
  primarySlotPath: FacetSlotPath
): Promise<VisualizationConfig[]> {
  const tableName = baseViz.datasetId;

  if (!tableName) {
    throw new Error(m.error_facet_base_viz_no_dataset());
  }

  const facetConfigs: VisualizationConfig[] = [];

  for (const variable of variables) {
    const facetId = crypto.randomUUID();

    const cloned = deepClone(baseViz);

    const facetConfig: VisualizationConfig = {
      ...cloned,
      id: facetId,
      name: variable,
      facet: {
        baseVisualizationId: baseViz.id
      },
      ...buildFacetVisualizationUpdates({
        baseViz,
        visualization: cloned,
        variable,
        scaleMode,
        primarySlotPath
      })
    };

    facetConfigs.push(facetConfig);
  }

  return facetConfigs;
}
