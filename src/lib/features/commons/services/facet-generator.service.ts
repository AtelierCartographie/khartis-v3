import { m } from '$lib/paraglide/messages';
import {
  PrimitiveFilterType,
  type PrimitiveConfigKind,
  type PrimitiveFilter,
  type VisualizationConfig
} from '../stores/visualization.store.svelte';
import { datasetsStore } from '../stores/datasets.store.svelte';
import { deepClone } from '../utils/clone.utils';
import {
  FACET_SLOT,
  SCALE_MODE,
  facetSlotRecomputesIndependentBreaks,
  isFacetCategorySlot,
  type FacetSlotPath,
  type ScaleMode
} from '$lib/features/commons/constants/facets.constants';
import { DEFAULT_CLASSIFICATION_CLASS_COUNT } from '$lib/features/commons/constants/visualization.constants';
import { applyFacetVariablePatch } from '$lib/features/commons/utils/facet-visualization-updates';
import { calculateBreaks } from './classification.service';
import {
  findPaletteById,
  generatePaletteColors,
  PALETTE_TYPE,
  type Palette
} from '$lib/features/commons/components/palette-popover/palette.constants';
import { DataValidationError } from '../pipeline.errors';
import { loadDistinctCategoryLabels } from '$lib/features/commons/utils/category-labels.utils';

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

    case FACET_SLOT.SYMBOL_FILL_VALUE:
    case FACET_SLOT.SYMBOL_FILL_CATEGORY:
      return visualization.symbol?.fillClassification;

    case FACET_SLOT.SYMBOL_STROKE_VALUE:
    case FACET_SLOT.SYMBOL_STROKE_CATEGORY:
      return visualization.symbol?.strokeClassification;

    case FACET_SLOT.LINE_VALUE:
    case FACET_SLOT.LINE_CATEGORY:
      return visualization.line?.classification ?? visualization.classification;

    case FACET_SLOT.LINE_THICKNESS_VALUE:
      return visualization.line?.thicknessClassification;

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

    case FACET_SLOT.POLYGON_STROKE_VALUE:
    case FACET_SLOT.POLYGON_STROKE_CATEGORY:
      return visualization.polygon?.strokeClassification;

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

async function buildCategoricalFacetClassification(
  baseViz: VisualizationConfig,
  variable: string,
  baseClassification: NonNullable<VisualizationConfig['classification']>
): Promise<VisualizationConfig['classification']> {
  const dataset = datasetsStore.datasets.find(
    (candidate) => candidate.id === baseViz.datasetId
  );
  const queriedLabels = await loadDistinctCategoryLabels(dataset, variable);
  const labels = (
    queriedLabels.length > 0
      ? queriedLabels
      : datasetsStore.getUniqueValues(baseViz.datasetId, variable)
  )
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
    categoryValues:
      labels.length > 0
        ? labels
        : (baseClassification.categoryValues ??
          baseClassification.labels ??
          []),
    colors
  };
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

    case FACET_SLOT.SYMBOL_FILL_VALUE:
    case FACET_SLOT.SYMBOL_FILL_CATEGORY:
      if (visualization.symbol) {
        visualization.symbol = {
          ...visualization.symbol,
          fillClassification: classification
        };
      }
      return;

    case FACET_SLOT.SYMBOL_STROKE_VALUE:
    case FACET_SLOT.SYMBOL_STROKE_CATEGORY:
      if (visualization.symbol) {
        visualization.symbol = {
          ...visualization.symbol,
          strokeClassification: classification
        };
      }
      return;

    case FACET_SLOT.LINE_VALUE:
    case FACET_SLOT.LINE_CATEGORY:
      visualization.classification = classification;
      visualization.lineClassification = classification;
      if (visualization.line) {
        visualization.line = {
          ...visualization.line,
          classification
        };
      }
      return;

    case FACET_SLOT.LINE_THICKNESS_VALUE:
      if (visualization.line) {
        visualization.line = {
          ...visualization.line,
          thicknessClassification: classification
        };
      }
      return;

    case FACET_SLOT.LINE_SIZE:
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

    case FACET_SLOT.POLYGON_STROKE_VALUE:
    case FACET_SLOT.POLYGON_STROKE_CATEGORY:
      if (visualization.polygon) {
        visualization.polygon = {
          ...visualization.polygon,
          strokeClassification: classification
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

async function buildFacetClassification(
  baseViz: VisualizationConfig,
  variable: string,
  scaleMode: ScaleMode,
  slotPath: FacetSlotPath
): Promise<VisualizationConfig['classification']> {
  const baseClassification = resolveFacetClassification(baseViz, slotPath);
  if (!baseClassification) {
    return baseClassification;
  }

  if (isFacetCategorySlot(slotPath)) {
    return await buildCategoricalFacetClassification(
      baseViz,
      variable,
      baseClassification
    );
  }

  if (!facetSlotRecomputesIndependentBreaks(slotPath)) {
    return { ...baseClassification };
  }

  if (scaleMode === SCALE_MODE.SHARED) {
    return { ...baseClassification };
  }

  if (!baseViz.datasetId) {
    return { ...baseClassification };
  }

  const classes =
    baseClassification.numClasses ??
    baseClassification.classes ??
    DEFAULT_CLASSIFICATION_CLASS_COUNT;
  const result = await calculateBreaks({
    datasetId: baseViz.datasetId,
    columnName: variable,
    method: baseClassification.method,
    numClasses: classes
  });

  if (!result) {
    return { ...baseClassification };
  }

  const actualClasses = result.counts.length || classes;

  return {
    ...baseClassification,
    numClasses: actualClasses,
    classes: actualClasses,
    breaks: result.breaks,
    counts: result.counts,
    ...(result.breakpointLowerClassCount != null
      ? { breakpointLowerClassCount: result.breakpointLowerClassCount }
      : {})
  };
}

// Build lazily because PrimitiveFilterType participates in an import cycle.
let facetPrimitiveBySlotKind: Record<
  PrimitiveConfigKind,
  PrimitiveFilter
> | null = null;

function getFacetPrimitiveBySlotKind(): Record<
  PrimitiveConfigKind,
  PrimitiveFilter
> {
  facetPrimitiveBySlotKind ??= {
    symbol: PrimitiveFilterType.POINT,
    polygon: PrimitiveFilterType.POLYGON,
    line: PrimitiveFilterType.LINE,
    text: PrimitiveFilterType.TEXT
  };
  return facetPrimitiveBySlotKind;
}

function isPrimitiveConfigKind(value: string): value is PrimitiveConfigKind {
  return value in getFacetPrimitiveBySlotKind();
}

/** Map a facet slot path to the only primitive shown by the collection. */
export function resolveFacetPrimitiveFilter(
  slotPath: FacetSlotPath
): PrimitiveFilter {
  const [kind] = slotPath.split('.');
  return isPrimitiveConfigKind(kind)
    ? getFacetPrimitiveBySlotKind()[kind]
    : PrimitiveFilterType.POLYGON;
}

export async function buildFacetSlotUpdates({
  baseViz,
  visualization,
  variable,
  scaleMode,
  slotPath
}: {
  baseViz: VisualizationConfig;
  visualization: VisualizationConfig;
  variable: string;
  scaleMode: ScaleMode;
  slotPath: FacetSlotPath;
}): Promise<Partial<VisualizationConfig>> {
  const nextVisualization = deepClone(visualization);

  applyFacetVariablePatch(nextVisualization, slotPath, variable);
  const classification = await buildFacetClassification(
    baseViz,
    variable,
    scaleMode,
    slotPath
  );
  applyFacetClassificationToVisualization(
    nextVisualization,
    slotPath,
    classification
  );

  return {
    mapping: nextVisualization.mapping,
    classification: nextVisualization.classification,
    symbolClassification: nextVisualization.symbolClassification,
    lineClassification: nextVisualization.lineClassification,
    textClassification: nextVisualization.textClassification,
    symbol: nextVisualization.symbol,
    polygon: nextVisualization.polygon,
    line: nextVisualization.line,
    text: nextVisualization.text
  };
}

export async function buildFacetVisualizationUpdates({
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
}): Promise<Partial<VisualizationConfig>> {
  const slotUpdates = await buildFacetSlotUpdates({
    baseViz,
    visualization,
    variable,
    scaleMode,
    slotPath: primarySlotPath
  });

  return {
    ...slotUpdates,
    name: variable,
    primitiveFilters: [resolveFacetPrimitiveFilter(primarySlotPath)],
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
    throw new DataValidationError(
      m.error_facet_base_viz_no_dataset(),
      'datasetId',
      { visualizationId: baseViz.id }
    );
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
      ...(await buildFacetVisualizationUpdates({
        baseViz,
        visualization: cloned,
        variable,
        scaleMode,
        primarySlotPath
      }))
    };

    facetConfigs.push(facetConfig);
  }

  return facetConfigs;
}
