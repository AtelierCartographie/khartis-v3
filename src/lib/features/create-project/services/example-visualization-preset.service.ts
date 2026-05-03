import type {
  DatasetResult,
  EnrichedColumn
} from '$lib/features/data-pipeline';
import type {
  SemioType,
  SimplifiedGeometryType,
  VizSuggestion
} from '$lib/features/commons/services/viz-suggester.service';
import type {
  ExampleProject,
  ExampleVisualizationPreset
} from '$lib/features/commons/store/create-project.types';
import {
  ClassificationMethod,
  type ClassificationConfig,
  type VisualizationConfig,
  visualizationStore
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  FillMode,
  ShapeType,
  SymbolMode,
  ThicknessMode
} from '$lib/features/main-toolbar/constants';
import {
  applySuggestionToVisualization,
  buildSuggestionOrigin,
  mapSuggestionToType
} from '$lib/features/main-toolbar/visualization-tab/utils/suggestion.service';
import { getSuggestionSignature } from '$lib/features/main-toolbar/visualization-tab/utils/suggestion-selection';

type ExampleSuggestionId =
  | 'choropleth'
  | 'symbols_proportional'
  | 'polygons_uniques'
  | 'symbols_proportional_colorful_QTR'
  | 'lines_proportional';

const EXAMPLE_SUGGESTION_BY_TYPE: Record<
  ExampleVisualizationPreset['type'],
  ExampleSuggestionId
> = {
  choropleth: 'choropleth',
  proportional: 'symbols_proportional',
  simple: 'polygons_uniques',
  bivariate: 'symbols_proportional_colorful_QTR',
  flow: 'lines_proportional'
};

const EXAMPLE_SUGGESTION_METADATA: Record<
  ExampleSuggestionId,
  Pick<VizSuggestion, 'nbColumns' | 'semioTypes' | 'geometries'>
> = {
  choropleth: {
    nbColumns: 1,
    semioTypes: ['QTR'],
    geometries: ['polygon']
  },
  symbols_proportional: {
    nbColumns: 1,
    semioTypes: ['QTA'],
    geometries: ['point', 'polygon']
  },
  polygons_uniques: {
    nbColumns: 0,
    semioTypes: [],
    geometries: ['polygon']
  },
  symbols_proportional_colorful_QTR: {
    nbColumns: 2,
    semioTypes: ['QTA', 'QTR'],
    geometries: ['point', 'polygon']
  },
  lines_proportional: {
    nbColumns: 1,
    semioTypes: ['QTA'],
    geometries: ['line']
  }
};

const CLASSIFICATION_METHOD_ALIASES: Record<string, ClassificationMethod> = {
  equal_interval: ClassificationMethod.EQUAL_INTERVAL,
  equalinterval: ClassificationMethod.EQUAL_INTERVAL,
  kmeans: ClassificationMethod.KMEANS,
  quantile: ClassificationMethod.QUANTILES,
  quantiles: ClassificationMethod.QUANTILES
};

const PALETTE_ALIASES: Record<string, string> = {
  blues: 'blues',
  purplegreen: 'prgn',
  prgn: 'prgn'
};

function normalizeColumnReference(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function resolveExampleColumnName(
  columns: EnrichedColumn[],
  reference: string
): string | undefined {
  const normalizedReference = normalizeColumnReference(reference);
  return columns.find(
    (column) => normalizeColumnReference(column.name) === normalizedReference
  )?.name;
}

function getPresetColumnReferences(
  preset: ExampleVisualizationPreset
): string[] {
  switch (preset.type) {
    case 'choropleth':
    case 'proportional':
    case 'flow':
      return [preset.variable];
    case 'bivariate':
      return [preset.variable1, preset.variable2];
    case 'simple':
      return [];
  }
}

function resolvePresetColumns(
  preset: ExampleVisualizationPreset,
  dataset: DatasetResult
): string[] {
  return getPresetColumnReferences(preset)
    .map((reference) => resolveExampleColumnName(dataset.columns, reference))
    .filter((column): column is string => Boolean(column));
}

export function buildExampleVisualizationSuggestion(
  preset: ExampleVisualizationPreset,
  dataset: DatasetResult
): VizSuggestion | null {
  const suggestionId = EXAMPLE_SUGGESTION_BY_TYPE[preset.type];
  const metadata = EXAMPLE_SUGGESTION_METADATA[suggestionId];
  const columns = resolvePresetColumns(preset, dataset);

  if (columns.length < metadata.nbColumns) {
    return null;
  }

  return {
    id: suggestionId,
    label: suggestionId,
    nbColumns: metadata.nbColumns,
    semioTypes: metadata.semioTypes as SemioType[],
    geometries: metadata.geometries as SimplifiedGeometryType[],
    columns
  };
}

function resolveClassificationMethod(
  method: string | undefined
): ClassificationMethod | undefined {
  if (!method) {
    return undefined;
  }

  return CLASSIFICATION_METHOD_ALIASES[normalizeColumnReference(method)];
}

function resolvePaletteId(palette: string | undefined): string | undefined {
  if (!palette) {
    return undefined;
  }

  return PALETTE_ALIASES[normalizeColumnReference(palette)];
}

function mergeClassification(
  base: ClassificationConfig | undefined,
  updates: Partial<ClassificationConfig>
): ClassificationConfig {
  return {
    method: ClassificationMethod.KMEANS,
    classes: 5,
    ...base,
    ...updates
  };
}

function preserveOrigin(
  visualization: VisualizationConfig,
  updates: Partial<VisualizationConfig>
): Partial<VisualizationConfig> {
  return {
    ...updates,
    origin: visualization.origin
  };
}

function applyChoroplethOverrides(
  visualization: VisualizationConfig,
  preset: Extract<ExampleVisualizationPreset, { type: 'choropleth' }>
): void {
  const classification = mergeClassification(visualization.classification, {
    ...(resolveClassificationMethod(preset.classification)
      ? { method: resolveClassificationMethod(preset.classification) }
      : {}),
    ...(preset.classes ? { classes: preset.classes } : {}),
    ...(preset.classes ? { numClasses: preset.classes } : {}),
    ...(resolvePaletteId(preset.palette)
      ? { paletteId: resolvePaletteId(preset.palette) }
      : {})
  });

  visualizationStore.updateVisualization(
    visualization.id,
    preserveOrigin(visualization, {
      classification,
      polygon: visualization.polygon
        ? {
            ...visualization.polygon,
            classification
          }
        : undefined
    })
  );
}

function resolveShapeType(shape: string | undefined): ShapeType | undefined {
  if (!shape) {
    return undefined;
  }

  const normalizedShape = normalizeColumnReference(shape);
  return Object.values(ShapeType).find(
    (value) => normalizeColumnReference(value) === normalizedShape
  );
}

function applyProportionalOverrides(
  visualization: VisualizationConfig,
  preset: Extract<ExampleVisualizationPreset, { type: 'proportional' }>
): void {
  const nextSymbol = visualization.symbol
    ? {
        ...visualization.symbol,
        mode: SymbolMode.PROPORTIONAL,
        ...(resolveShapeType(preset.symbol)
          ? { shape: resolveShapeType(preset.symbol) }
          : {}),
        ...(preset.minSize ? { minSize: preset.minSize } : {}),
        ...(preset.maxSize ? { maxSize: preset.maxSize } : {}),
        ...(preset.color ? { fillColor: preset.color } : {})
      }
    : undefined;

  visualizationStore.updateVisualization(
    visualization.id,
    preserveOrigin(visualization, {
      symbol: nextSymbol,
      symbols: visualization.symbols
        ? {
            ...visualization.symbols,
            ...(resolveShapeType(preset.symbol)
              ? { type: resolveShapeType(preset.symbol) }
              : {}),
            ...(preset.minSize ? { minSize: preset.minSize } : {}),
            ...(preset.maxSize ? { maxSize: preset.maxSize } : {})
          }
        : undefined,
      style: {
        ...visualization.style,
        ...(preset.color ? { symbolFillColor: preset.color } : {})
      }
    })
  );
}

function applySimpleOverrides(
  visualization: VisualizationConfig,
  preset: Extract<ExampleVisualizationPreset, { type: 'simple' }>
): void {
  visualizationStore.updateVisualization(
    visualization.id,
    preserveOrigin(visualization, {
      style: {
        ...visualization.style,
        ...(preset.fillColor ? { fillColor: preset.fillColor } : {}),
        ...(preset.strokeColor ? { strokeColor: preset.strokeColor } : {}),
        ...(preset.strokeWidth !== undefined
          ? { strokeWidth: preset.strokeWidth }
          : {})
      },
      polygon: visualization.polygon
        ? {
            ...visualization.polygon,
            fillMode: FillMode.UNIQUE,
            ...(preset.fillColor ? { fillColor: preset.fillColor } : {}),
            ...(preset.strokeColor ? { strokeColor: preset.strokeColor } : {}),
            ...(preset.strokeWidth !== undefined
              ? { strokeWidth: preset.strokeWidth }
              : {})
          }
        : undefined
    })
  );
}

function applyBivariateOverrides(
  visualization: VisualizationConfig,
  preset: Extract<ExampleVisualizationPreset, { type: 'bivariate' }>
): void {
  const classification = mergeClassification(visualization.classification, {
    ...(resolvePaletteId(preset.palette)
      ? { paletteId: resolvePaletteId(preset.palette) }
      : {})
  });

  visualizationStore.updateVisualization(
    visualization.id,
    preserveOrigin(visualization, {
      classification,
      symbol: visualization.symbol
        ? {
            ...visualization.symbol,
            fillClassification: classification
          }
        : undefined
    })
  );
}

function applyFlowOverrides(
  visualization: VisualizationConfig,
  preset: Extract<ExampleVisualizationPreset, { type: 'flow' }>
): void {
  if (!preset.curved) {
    return;
  }

  visualizationStore.updateVisualization(
    visualization.id,
    preserveOrigin(visualization, {
      line: visualization.line
        ? {
            ...visualization.line,
            thicknessMode: ThicknessMode.PROPORTIONAL
          }
        : undefined
    })
  );
}

function applyDeclaredOverrides(
  visualizationId: string,
  preset: ExampleVisualizationPreset
): void {
  const visualization = visualizationStore.visualizations.find(
    (item) => item.id === visualizationId
  );
  if (!visualization) {
    return;
  }

  switch (preset.type) {
    case 'choropleth':
      applyChoroplethOverrides(visualization, preset);
      break;
    case 'proportional':
      applyProportionalOverrides(visualization, preset);
      break;
    case 'simple':
      applySimpleOverrides(visualization, preset);
      break;
    case 'bivariate':
      applyBivariateOverrides(visualization, preset);
      break;
    case 'flow':
      applyFlowOverrides(visualization, preset);
      break;
  }
}

export function applyExampleVisualizationPresets(
  example: ExampleProject,
  dataset: DatasetResult
): void {
  const presets = example.visualizations ?? [];
  if (presets.length === 0) {
    return;
  }

  const existingVisualizations = visualizationStore.getVisualizationsByDataset(
    dataset.id
  );

  presets.forEach((preset, index) => {
    const suggestion = buildExampleVisualizationSuggestion(preset, dataset);
    if (!suggestion) {
      return;
    }

    const targetVisualization =
      existingVisualizations[index] ??
      visualizationStore.createVisualization(
        mapSuggestionToType(suggestion.id),
        dataset.id,
        index === 0 ? example.title : undefined
      );
    const suggestionKey = getSuggestionSignature(suggestion);

    applySuggestionToVisualization(targetVisualization.id, suggestion, {
      origin: buildSuggestionOrigin(targetVisualization, {
        mode: 'custom',
        suggestionKey
      })
    });
    applyDeclaredOverrides(targetVisualization.id, preset);
  });
}
