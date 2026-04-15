import type {
  DatasetResult,
  ProcessedDataset
} from '$lib/features/data-pipeline';
import type {
  GeometryType,
  VizSuggestion
} from '$lib/features/commons/services/viz-suggester.service';
import {
  PrimitiveFilterType,
  type VisualizationPreset,
  type VisualizationConfig,
  type VisualizationOrigin,
  resolveVisualizationPreset,
  visualizationStore,
  VisualizationType
} from '$lib/features/commons/store/visualization.store.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { GEO_COLUMN_TYPE } from '$lib/features/commons/constants/data.constants';
import {
  DEFAULT_COLORS,
  ColorMode,
  FillMode,
  ProportionalType,
  SizeMode,
  StrokeMode,
  SymbolMode,
  ThicknessMode
} from '$lib/features/main-toolbar/constants';
import {
  getLegendState,
  legendActions
} from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';

import { projectStore } from '$lib/features/commons/store/project.store.svelte';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';

interface DatasetGeometrySource {
  id?: string;
  geometry?: { type?: string | null } | string;
  sourceFileId?: string;
  joinedBasemap?: string;
  gpsMode?: boolean;
  geoDetection?: {
    geoColumns?: Array<{ type?: string }>;
  };
}

type SuggestionPrimitive =
  | PrimitiveFilterType.POINT
  | PrimitiveFilterType.LINE
  | PrimitiveFilterType.POLYGON
  | 'text'
  | 'label';

type DatasetPrimitive =
  | PrimitiveFilterType.POINT
  | PrimitiveFilterType.LINE
  | PrimitiveFilterType.POLYGON
  | null;

interface SuggestionBehavior {
  visualizationType: VisualizationType;
  primaryPrimitives: SuggestionPrimitive[];
  supportPrimitives: SuggestionPrimitive[];
  forcedOffPrimitives: SuggestionPrimitive[];
  primitiveFilters: VisualizationConfig['primitiveFilters'];
  mapping: VisualizationConfig['mapping'];
  modes?: Partial<VisualizationConfig['modes']>;
  style?: Partial<VisualizationConfig['style']>;
  classification?: VisualizationConfig['classification'];
  symbols?: VisualizationConfig['symbols'];
  missingData?: VisualizationConfig['missingData'];
}

const SUGGESTION_VISUALIZATION_TYPES = {
  symbols_uniques: VisualizationType.PROPORTIONAL,
  polygons_uniques: VisualizationType.CHOROPLETH,
  lines_uniques: VisualizationType.CHOROPLETH,
  choropleth: VisualizationType.CHOROPLETH,
  symbols_uniques_colorful_QTR: VisualizationType.CHOROPLETH,
  lines_colorful_QTR: VisualizationType.CHOROPLETH,
  symbols_proportional: VisualizationType.PROPORTIONAL,
  lines_proportional: VisualizationType.PROPORTIONAL,
  polygons_colorful_QL: VisualizationType.CATEGORICAL,
  symbols_differents: VisualizationType.CATEGORICAL,
  symbols_uniques_colorful_QL: VisualizationType.CATEGORICAL,
  lines_colorful_QL: VisualizationType.CATEGORICAL,
  polygons_colorful_QLO: VisualizationType.CATEGORICAL,
  symbols_differents_QLO: VisualizationType.CATEGORICAL,
  symbols_uniques_colorful_QLO: VisualizationType.CATEGORICAL,
  lines_colorful_QLO: VisualizationType.CATEGORICAL,
  symbols_proportional_colorful_QL: VisualizationType.BIVARIATE,
  symbols_proportional_colorful_QTR: VisualizationType.BIVARIATE,
  symbols_proportional_double: VisualizationType.BIVARIATE,
  lines_proportional_colorful_QL: VisualizationType.BIVARIATE,
  lines_proportional_colorful_QTR: VisualizationType.BIVARIATE,
  texts_colorful_QL: VisualizationType.BIVARIATE,
  texts_colorful_QTR: VisualizationType.BIVARIATE,
  texts_proportional: VisualizationType.BIVARIATE
} as const satisfies Record<string, VisualizationType>;

export const SUGGESTION_BEHAVIOR_IDS = Object.keys(
  SUGGESTION_VISUALIZATION_TYPES
);

const SYMBOL_UNIQUE_SUGGESTION_IDS = new Set([
  'symbols_uniques',
  'symbols_uniques_colorful_QTR',
  'symbols_uniques_colorful_QL',
  'symbols_uniques_colorful_QLO'
]);

const SYMBOL_CATEGORY_SHAPE_IDS = new Set([
  'symbols_differents',
  'symbols_differents_QLO'
]);

const SYMBOL_PROPORTIONAL_SUGGESTION_IDS = new Set([
  'symbols_proportional',
  'symbols_proportional_colorful_QL',
  'symbols_proportional_colorful_QTR',
  'symbols_proportional_double'
]);

const LINE_SUGGESTION_IDS = new Set([
  'lines_uniques',
  'lines_colorful_QL',
  'lines_colorful_QTR',
  'lines_proportional',
  'lines_proportional_colorful_QL',
  'lines_proportional_colorful_QTR',
  'lines_colorful_QLO'
]);

const POLYGON_SUGGESTION_IDS = new Set([
  'polygons_uniques',
  'polygons_colorful_QL',
  'choropleth',
  'polygons_colorful_QLO'
]);

const TEXT_SUGGESTION_IDS = new Set([
  'texts_colorful_QL',
  'texts_colorful_QTR',
  'texts_proportional'
]);

const CATEGORY_SUGGESTION_IDS = new Set([
  'polygons_colorful_QL',
  'polygons_colorful_QLO',
  'symbols_differents',
  'symbols_uniques_colorful_QL',
  'symbols_differents_QLO',
  'symbols_uniques_colorful_QLO',
  'lines_colorful_QL',
  'lines_colorful_QLO',
  'symbols_proportional_colorful_QL',
  'lines_proportional_colorful_QL',
  'texts_colorful_QL'
]);

const CLASS_SUGGESTION_IDS = new Set([
  'choropleth',
  'symbols_uniques_colorful_QTR',
  'lines_colorful_QTR',
  'symbols_proportional_colorful_QTR',
  'lines_proportional_colorful_QTR',
  'texts_colorful_QTR'
]);

function resolveDatasetPrimitive(
  dataset?: DatasetGeometrySource | null
): DatasetPrimitive {
  const geometryType = resolveDatasetGeometryType(dataset);

  if (!geometryType) {
    return null;
  }

  const normalized = geometryType.toLowerCase();
  if (normalized.includes('polygon')) {
    return PrimitiveFilterType.POLYGON;
  }

  if (normalized.includes('line')) {
    return PrimitiveFilterType.LINE;
  }

  if (normalized.includes('point')) {
    return PrimitiveFilterType.POINT;
  }

  return null;
}

function buildClearedMapping(
  geometryColumn: string | undefined,
  updates: Partial<VisualizationConfig['mapping']> = {}
): VisualizationConfig['mapping'] {
  return {
    geometryColumn,
    valueColumn: undefined,
    categoryColumn: undefined,
    sizeColumn: undefined,
    colorColumn: undefined,
    labelColumn: undefined,
    secondaryLabelColumn: undefined,
    ...updates
  };
}

function buildDisabledMissingData(
  baseMissingData: VisualizationConfig['missingData']
): VisualizationConfig['missingData'] {
  if (!baseMissingData) {
    return undefined;
  }

  return {
    ...baseMissingData,
    show: false,
    enabled: false,
    pattern: false
  };
}

function buildSupportPolygonStyle(): Partial<VisualizationConfig['style']> {
  return {
    fillOpacity: 0,
    strokeColor: DEFAULT_COLORS.gray,
    strokeOpacity: 1
  };
}

function buildTextStyle(
  extra: Partial<VisualizationConfig['style']> = {}
): Partial<VisualizationConfig['style']> {
  return {
    textOpacity: 1,
    labelOpacity: 0,
    strokeColor: DEFAULT_COLORS.gray,
    strokeOpacity: 1,
    ...extra
  };
}

export function resolveDatasetGeometryType(
  dataset?: DatasetGeometrySource | null
): GeometryType | null {
  if (!dataset) {
    return null;
  }

  const rawGeometry =
    typeof dataset.geometry === 'string'
      ? dataset.geometry
      : dataset.geometry?.type;
  if (typeof rawGeometry === 'string' && rawGeometry.length > 0) {
    return rawGeometry as GeometryType;
  }

  // Check dataset-level join info first (available on DatasetResult)
  if (dataset.gpsMode) {
    return 'Point';
  }
  if (dataset.joinedBasemap) {
    return 'Polygon';
  }

  // Check geoDetection for auto-detected GPS columns (before join finalization)
  if (dataset.geoDetection?.geoColumns) {
    const hasLat = dataset.geoDetection.geoColumns.some(
      (c) => c.type === GEO_COLUMN_TYPE.LATITUDE
    );
    const hasLon = dataset.geoDetection.geoColumns.some(
      (c) => c.type === GEO_COLUMN_TYPE.LONGITUDE
    );
    if (hasLat && hasLon) {
      return 'Point';
    }
  }

  if (!dataset.sourceFileId) {
    return null;
  }

  // Fallback 1: check orchestrator state (DuckDBDataset)
  const duckDataset = duckDBOrchestrator.getDatasetBySourceFile(
    dataset.sourceFileId
  );
  if (duckDataset) {
    if (duckDataset.gpsMode) {
      return 'Point';
    }
    if (duckDataset.joinedBasemap) {
      return 'Polygon';
    }
  }

  // Fallback 2: check project source files (UploadedFile persistence)
  const sourceFile = projectStore.currentProject?.data?.sourceFiles?.find(
    (f) => f.id === dataset.sourceFileId
  );
  if (sourceFile) {
    if (sourceFile.gpsMode) {
      return 'Point';
    }
    if (sourceFile.joinedBasemap) {
      return 'Polygon';
    }
  }

  // Fallback 3: infer from existing visualizations on this dataset
  const datasetId = (dataset as { id?: string }).id;
  if (datasetId) {
    const vizs = visualizationStore.getVisualizationsByDataset(datasetId);
    if (vizs.length > 0) {
      const vizType = vizs[0].type;
      if (
        vizType === VisualizationType.CHOROPLETH ||
        vizType === VisualizationType.CATEGORICAL
      ) {
        return 'Polygon';
      }
      if (vizType === VisualizationType.PROPORTIONAL) {
        return 'Point';
      }
    }
  }

  return null;
}

export function mapSuggestionToType(suggestionId: string): VisualizationType {
  return (
    SUGGESTION_VISUALIZATION_TYPES[
      suggestionId as keyof typeof SUGGESTION_VISUALIZATION_TYPES
    ] ?? VisualizationType.CHOROPLETH
  );
}

export function resolveSuggestionBehavior(
  suggestion: VizSuggestion,
  dataset: Parameters<typeof resolveVisualizationPreset>[1],
  visualization?: VisualizationConfig
): SuggestionBehavior {
  const visualizationType = mapSuggestionToType(suggestion.id);
  const preset = resolveVisualizationPreset(visualizationType, dataset);
  const categoricalPreset = resolveVisualizationPreset(
    VisualizationType.CATEGORICAL,
    dataset
  );
  const choroplethPreset = resolveVisualizationPreset(
    VisualizationType.CHOROPLETH,
    dataset
  );
  const datasetPrimitive = resolveDatasetPrimitive(dataset);
  const isPolygonDataset = datasetPrimitive === PrimitiveFilterType.POLYGON;
  const primaryColumn = suggestion.columns?.[0];
  const secondaryColumn = suggestion.columns?.[1];
  const symbolPrimitiveFilters = isPolygonDataset
    ? [PrimitiveFilterType.POINT, PrimitiveFilterType.POLYGON]
    : [PrimitiveFilterType.POINT];
  const textPrimitiveFilters = isPolygonDataset
    ? [PrimitiveFilterType.POLYGON]
    : [];

  const baseMapping = buildClearedMapping(preset.mapping.geometryColumn);
  const baseSymbols = preset.symbols
    ? {
        ...preset.symbols,
        opacity:
          visualization?.symbols?.opacity ??
          preset.symbols.opacity ??
          preset.symbols.opacity
      }
    : preset.symbols;

  if (TEXT_SUGGESTION_IDS.has(suggestion.id)) {
    if (suggestion.id === 'texts_colorful_QL') {
      return {
        visualizationType,
        primaryPrimitives: ['text'],
        supportPrimitives: isPolygonDataset
          ? [PrimitiveFilterType.POLYGON]
          : [],
        forcedOffPrimitives: [
          PrimitiveFilterType.POINT,
          PrimitiveFilterType.LINE,
          'label'
        ],
        primitiveFilters: textPrimitiveFilters,
        mapping: buildClearedMapping(preset.mapping.geometryColumn, {
          labelColumn: primaryColumn,
          categoryColumn: secondaryColumn
        }),
        modes: {
          ...preset.modes,
          color: ColorMode.CATEGORIES,
          size: SizeMode.FIXED,
          symbol: SymbolMode.UNIQUE
        },
        style: {
          ...buildTextStyle(isPolygonDataset ? buildSupportPolygonStyle() : {})
        },
        classification: categoricalPreset.classification,
        symbols: baseSymbols,
        missingData: buildDisabledMissingData(preset.missingData)
      };
    }

    if (suggestion.id === 'texts_colorful_QTR') {
      return {
        visualizationType,
        primaryPrimitives: ['text'],
        supportPrimitives: isPolygonDataset
          ? [PrimitiveFilterType.POLYGON]
          : [],
        forcedOffPrimitives: [
          PrimitiveFilterType.POINT,
          PrimitiveFilterType.LINE,
          'label'
        ],
        primitiveFilters: textPrimitiveFilters,
        mapping: buildClearedMapping(preset.mapping.geometryColumn, {
          labelColumn: primaryColumn,
          valueColumn: secondaryColumn
        }),
        modes: {
          ...preset.modes,
          color: ColorMode.CLASSES,
          size: SizeMode.FIXED,
          symbol: SymbolMode.UNIQUE
        },
        style: {
          ...buildTextStyle(isPolygonDataset ? buildSupportPolygonStyle() : {})
        },
        classification: choroplethPreset.classification,
        symbols: baseSymbols,
        missingData: buildDisabledMissingData(preset.missingData)
      };
    }

    return {
      visualizationType,
      primaryPrimitives: ['text'],
      supportPrimitives: isPolygonDataset ? [PrimitiveFilterType.POLYGON] : [],
      forcedOffPrimitives: [
        PrimitiveFilterType.POINT,
        PrimitiveFilterType.LINE,
        'label'
      ],
      primitiveFilters: textPrimitiveFilters,
      mapping: buildClearedMapping(preset.mapping.geometryColumn, {
        labelColumn: primaryColumn,
        sizeColumn: secondaryColumn
      }),
      modes: {
        ...preset.modes,
        color: ColorMode.UNIQUE,
        size: SizeMode.PROPORTIONAL,
        symbol: SymbolMode.UNIQUE
      },
      style: {
        ...buildTextStyle(isPolygonDataset ? buildSupportPolygonStyle() : {})
      },
      classification: undefined,
      symbols: baseSymbols,
      missingData: buildDisabledMissingData(preset.missingData)
    };
  }

  if (POLYGON_SUGGESTION_IDS.has(suggestion.id)) {
    if (suggestion.id === 'choropleth') {
      return {
        visualizationType,
        primaryPrimitives: [PrimitiveFilterType.POLYGON],
        supportPrimitives: [],
        forcedOffPrimitives: [
          PrimitiveFilterType.POINT,
          PrimitiveFilterType.LINE,
          'text',
          'label'
        ],
        primitiveFilters: [PrimitiveFilterType.POLYGON],
        mapping: buildClearedMapping(preset.mapping.geometryColumn, {
          valueColumn: primaryColumn
        }),
        modes: {
          ...preset.modes,
          fill: FillMode.CLASSES
        },
        style: {},
        classification: choroplethPreset.classification,
        symbols: baseSymbols,
        missingData: preset.missingData
      };
    }

    if (CATEGORY_SUGGESTION_IDS.has(suggestion.id)) {
      return {
        visualizationType,
        primaryPrimitives: [PrimitiveFilterType.POLYGON],
        supportPrimitives: [],
        forcedOffPrimitives: [
          PrimitiveFilterType.POINT,
          PrimitiveFilterType.LINE,
          'text',
          'label'
        ],
        primitiveFilters: [PrimitiveFilterType.POLYGON],
        mapping: buildClearedMapping(preset.mapping.geometryColumn, {
          categoryColumn: primaryColumn
        }),
        modes: {
          ...preset.modes,
          fill: FillMode.CATEGORIES
        },
        style: {},
        classification: categoricalPreset.classification,
        symbols: baseSymbols,
        missingData: preset.missingData
      };
    }

    return {
      visualizationType,
      primaryPrimitives: [PrimitiveFilterType.POLYGON],
      supportPrimitives: [],
      forcedOffPrimitives: [
        PrimitiveFilterType.POINT,
        PrimitiveFilterType.LINE,
        'text',
        'label'
      ],
      primitiveFilters: [PrimitiveFilterType.POLYGON],
      mapping: baseMapping,
      modes: {
        ...preset.modes,
        fill: FillMode.UNIQUE
      },
      style: {},
      classification: undefined,
      symbols: baseSymbols,
      missingData: preset.missingData
    };
  }

  if (LINE_SUGGESTION_IDS.has(suggestion.id)) {
    const isCategoricalLine = CATEGORY_SUGGESTION_IDS.has(suggestion.id);
    const isClassedLine = CLASS_SUGGESTION_IDS.has(suggestion.id);
    const isProportionalLine = [
      'lines_proportional',
      'lines_proportional_colorful_QL',
      'lines_proportional_colorful_QTR'
    ].includes(suggestion.id);

    return {
      visualizationType,
      primaryPrimitives: [PrimitiveFilterType.LINE],
      supportPrimitives: [],
      forcedOffPrimitives: [
        PrimitiveFilterType.POINT,
        PrimitiveFilterType.POLYGON,
        'text',
        'label'
      ],
      primitiveFilters: [PrimitiveFilterType.LINE],
      mapping: buildClearedMapping(preset.mapping.geometryColumn, {
        valueColumn: isClassedLine
          ? primaryColumn
          : suggestion.id === 'lines_proportional_colorful_QTR'
            ? secondaryColumn
            : undefined,
        categoryColumn: isCategoricalLine
          ? isProportionalLine
            ? secondaryColumn
            : primaryColumn
          : undefined,
        sizeColumn: isProportionalLine ? primaryColumn : undefined
      }),
      modes: {
        ...preset.modes,
        fill: FillMode.NONE,
        color: isCategoricalLine
          ? ColorMode.CATEGORIES
          : isClassedLine
            ? ColorMode.CLASSES
            : ColorMode.UNIQUE,
        thickness: isProportionalLine
          ? ThicknessMode.PROPORTIONAL
          : ThicknessMode.UNIQUE
      },
      style: {},
      classification: isCategoricalLine
        ? categoricalPreset.classification
        : isClassedLine
          ? choroplethPreset.classification
          : undefined,
      symbols: baseSymbols,
      missingData: preset.missingData
    };
  }

  const isCategoricalSymbol = CATEGORY_SUGGESTION_IDS.has(suggestion.id);
  const isClassedSymbol = CLASS_SUGGESTION_IDS.has(suggestion.id);
  const isProportionalSymbol = SYMBOL_PROPORTIONAL_SUGGESTION_IDS.has(
    suggestion.id
  );

  return {
    visualizationType,
    primaryPrimitives: [PrimitiveFilterType.POINT],
    supportPrimitives: isPolygonDataset ? [PrimitiveFilterType.POLYGON] : [],
    forcedOffPrimitives: [PrimitiveFilterType.LINE, 'text', 'label'],
    primitiveFilters: symbolPrimitiveFilters,
    mapping: buildClearedMapping(preset.mapping.geometryColumn, {
      valueColumn: isClassedSymbol
        ? primaryColumn
        : suggestion.id === 'symbols_proportional_colorful_QTR' ||
            suggestion.id === 'symbols_proportional_double'
          ? secondaryColumn
          : undefined,
      categoryColumn: isCategoricalSymbol
        ? isProportionalSymbol
          ? secondaryColumn
          : primaryColumn
        : undefined,
      sizeColumn: isProportionalSymbol ? primaryColumn : undefined
    }),
    modes: {
      ...preset.modes,
      symbol: SYMBOL_CATEGORY_SHAPE_IDS.has(suggestion.id)
        ? SymbolMode.CATEGORIES
        : SYMBOL_UNIQUE_SUGGESTION_IDS.has(suggestion.id)
          ? SymbolMode.UNIQUE
          : SymbolMode.PROPORTIONAL,
      fill: isCategoricalSymbol
        ? FillMode.CATEGORIES
        : isClassedSymbol
          ? FillMode.CLASSES
          : FillMode.UNIQUE,
      stroke:
        suggestion.id === 'symbols_proportional_double'
          ? StrokeMode.UNIQUE
          : preset.modes?.stroke,
      proportionalType:
        suggestion.id === 'symbols_proportional_double'
          ? ProportionalType.DOUBLE
          : ProportionalType.SINGLE
    },
    style: {
      ...(isPolygonDataset ? buildSupportPolygonStyle() : {}),
      ...(suggestion.id === 'symbols_proportional_double'
        ? {
            fillColorB:
              visualization?.style.fillColorB ?? DEFAULT_COLORS.secondary
          }
        : {})
    },
    classification: isCategoricalSymbol
      ? categoricalPreset.classification
      : isClassedSymbol
        ? choroplethPreset.classification
        : undefined,
    symbols: baseSymbols,
    missingData: preset.missingData
  };
}

export function resolveBlankVisualizationType(
  dataset?: DatasetGeometrySource | null
): VisualizationType {
  const geometryType = resolveDatasetGeometryType(dataset);

  if (geometryType?.toLowerCase().includes('point')) {
    return VisualizationType.PROPORTIONAL;
  }

  return VisualizationType.CHOROPLETH;
}

export function resolveBlankVisualizationPreset(
  dataset: Parameters<typeof resolveVisualizationPreset>[1]
): VisualizationPreset {
  const blankType = resolveBlankVisualizationType(dataset);
  const preset = resolveVisualizationPreset(blankType, dataset);
  const modes = {
    ...preset.modes
  };
  const style = {
    ...preset.style,
    lineColor: DEFAULT_COLORS.gray,
    textHalo: false,
    textCollisionDetection: false,
    textDxpMasking: false,
    labelHalo: false,
    labelCollisionDetection: false,
    labelDxpMasking: false
  };

  if (blankType === VisualizationType.CHOROPLETH) {
    modes.fill = FillMode.NONE;
    style.strokeColor = DEFAULT_COLORS.gray;
  }

  if (blankType === VisualizationType.PROPORTIONAL) {
    modes.symbol = SymbolMode.UNIQUE;
    modes.proportionalType = ProportionalType.SINGLE;
    style.fillColor = DEFAULT_COLORS.gray;
    style.strokeColor = DEFAULT_COLORS.gray;
  }

  return {
    ...preset,
    modes,
    style,
    mapping: {
      geometryColumn: preset.mapping.geometryColumn
    },
    classification: undefined,
    missingData: preset.missingData
      ? {
          ...preset.missingData,
          show: false,
          enabled: false,
          pattern: false
        }
      : undefined
  };
}

export function applyBlankVisualizationPreset(
  vizId: string,
  dataset: Parameters<typeof resolveBlankVisualizationPreset>[0],
  origin?: VisualizationOrigin
): void {
  visualizationStore.updateVisualization(vizId, {
    ...resolveBlankVisualizationPreset(dataset),
    origin,
    primitiveOrder: undefined,
    dataFilters: undefined
  });
}

function areVisualizationPresetValuesEqual(
  currentValue: unknown,
  expectedValue: unknown
): boolean {
  const normalizeValue = (value: unknown): unknown => {
    if (value === undefined || value === null) {
      return null;
    }

    if (Array.isArray(value)) {
      return value.map((item) => normalizeValue(item));
    }

    if (typeof value !== 'object') {
      return value;
    }

    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const rawValue = (value as Record<string, unknown>)[key];
        if (rawValue !== undefined) {
          acc[key] = normalizeValue(rawValue);
        }
        return acc;
      }, {});
  };

  return (
    JSON.stringify(normalizeValue(currentValue)) ===
    JSON.stringify(normalizeValue(expectedValue))
  );
}

function normalizeClassificationForPresetComparison(
  classification:
    | VisualizationConfig['classification']
    | VisualizationPreset['classification']
): Record<string, unknown> | null {
  if (!classification) {
    return null;
  }

  return {
    method: classification.method,
    paletteId: classification.paletteId,
    inverted: classification.inverted,
    breakpointValue: classification.breakpointValue,
    patternId: classification.patternId,
    patternParams: classification.patternParams
  };
}

export function isVisualizationUsingPreset(
  visualization: VisualizationConfig,
  preset: VisualizationPreset
): boolean {
  return (
    visualization.type === preset.type &&
    areVisualizationPresetValuesEqual(visualization.modes, preset.modes) &&
    areVisualizationPresetValuesEqual(
      visualization.primitiveFilters,
      preset.primitiveFilters
    ) &&
    areVisualizationPresetValuesEqual(visualization.style, preset.style) &&
    areVisualizationPresetValuesEqual(visualization.mapping, preset.mapping) &&
    areVisualizationPresetValuesEqual(
      normalizeClassificationForPresetComparison(visualization.classification),
      normalizeClassificationForPresetComparison(preset.classification)
    ) &&
    areVisualizationPresetValuesEqual(visualization.symbols, preset.symbols) &&
    areVisualizationPresetValuesEqual(
      visualization.missingData,
      preset.missingData
    )
  );
}

export function isVisualizationBlank(
  visualization: VisualizationConfig,
  dataset: DatasetGeometrySource
): boolean {
  const blankPreset = resolveBlankVisualizationPreset(
    dataset as Parameters<typeof resolveVisualizationPreset>[1]
  );

  return isVisualizationUsingPreset(visualization, blankPreset);
}

export function resolveNextSuggestionSelection(
  currentSuggestionId: string | undefined,
  nextSuggestionId: string
): string | undefined {
  return currentSuggestionId === nextSuggestionId
    ? undefined
    : nextSuggestionId;
}

function getLegendSubtitleForVisualization(
  visualization: VisualizationConfig
): string {
  if (visualization.modes?.fill === FillMode.CATEGORIES) {
    return visualization.mapping.categoryColumn ?? '';
  }

  return (
    visualization.mapping.valueColumn ??
    visualization.mapping.sizeColumn ??
    visualization.mapping.categoryColumn ??
    visualization.mapping.colorColumn ??
    ''
  );
}

function syncLegendSubtitleAfterSuggestion(
  vizId: string,
  previousAutoSubtitle: string,
  visualization: VisualizationConfig
): void {
  const legendItem = getLegendState().items.find(
    (item) => item.variableId === vizId
  );
  if (!legendItem) {
    return;
  }

  const nextAutoSubtitle = getLegendSubtitleForVisualization(visualization);
  const usesAutomaticSubtitle =
    !legendItem.subtitle || legendItem.subtitle === previousAutoSubtitle;

  if (!usesAutomaticSubtitle || legendItem.subtitle === nextAutoSubtitle) {
    return;
  }

  legendActions.updateLegendItem(legendItem.id, {
    subtitle: nextAutoSubtitle,
    subtitleMode: 'auto'
  });
}

function buildSuggestionUpdate(
  visualization: VisualizationConfig,
  dataset: Parameters<typeof resolveVisualizationPreset>[1],
  suggestion: VizSuggestion
): Partial<VisualizationConfig> {
  const behavior = resolveSuggestionBehavior(
    suggestion,
    dataset,
    visualization
  );

  return {
    mapping: behavior.mapping,
    modes: behavior.modes
      ? {
          ...visualization.modes,
          ...behavior.modes
        }
      : visualization.modes,
    style: behavior.style
      ? {
          ...visualization.style,
          ...behavior.style
        }
      : visualization.style,
    primitiveFilters: behavior.primitiveFilters,
    classification: behavior.classification,
    symbols: behavior.symbols,
    missingData: behavior.missingData
  };
}

export function isVisualizationMatchingSuggestion(
  visualization: VisualizationConfig,
  dataset: ProcessedDataset | DatasetResult,
  suggestion: VizSuggestion
): boolean {
  const behavior = resolveSuggestionBehavior(
    suggestion,
    dataset,
    visualization
  );
  const preset = resolveVisualizationPreset(
    behavior.visualizationType,
    dataset
  );
  const expectedVisualization: VisualizationConfig = {
    ...visualization,
    ...preset,
    mapping: { ...preset.mapping },
    style: { ...preset.style },
    modes: preset.modes ? { ...preset.modes } : undefined,
    classification: preset.classification
      ? { ...preset.classification }
      : undefined,
    symbols: preset.symbols ? { ...preset.symbols } : undefined,
    missingData: preset.missingData ? { ...preset.missingData } : undefined
  };

  const suggestionUpdate = buildSuggestionUpdate(
    expectedVisualization,
    dataset,
    suggestion
  );

  expectedVisualization.mapping = suggestionUpdate.mapping
    ? {
        ...expectedVisualization.mapping,
        ...suggestionUpdate.mapping
      }
    : expectedVisualization.mapping;
  expectedVisualization.modes = suggestionUpdate.modes
    ? {
        ...expectedVisualization.modes,
        ...suggestionUpdate.modes
      }
    : expectedVisualization.modes;
  expectedVisualization.style = suggestionUpdate.style
    ? {
        ...expectedVisualization.style,
        ...suggestionUpdate.style
      }
    : expectedVisualization.style;
  expectedVisualization.primitiveFilters =
    suggestionUpdate.primitiveFilters ?? expectedVisualization.primitiveFilters;
  if (
    Object.prototype.hasOwnProperty.call(suggestionUpdate, 'classification')
  ) {
    expectedVisualization.classification = suggestionUpdate.classification;
  }
  if (Object.prototype.hasOwnProperty.call(suggestionUpdate, 'symbols')) {
    expectedVisualization.symbols = suggestionUpdate.symbols;
  }
  if (Object.prototype.hasOwnProperty.call(suggestionUpdate, 'missingData')) {
    expectedVisualization.missingData = suggestionUpdate.missingData;
  }

  return (
    behavior.visualizationType === visualization.type &&
    areVisualizationPresetValuesEqual(
      expectedVisualization.modes,
      visualization.modes
    ) &&
    areVisualizationPresetValuesEqual(
      expectedVisualization.primitiveFilters,
      visualization.primitiveFilters
    ) &&
    areVisualizationPresetValuesEqual(
      expectedVisualization.style,
      visualization.style
    ) &&
    areVisualizationPresetValuesEqual(
      expectedVisualization.mapping,
      visualization.mapping
    ) &&
    areVisualizationPresetValuesEqual(
      normalizeClassificationForPresetComparison(
        expectedVisualization.classification
      ),
      normalizeClassificationForPresetComparison(visualization.classification)
    ) &&
    areVisualizationPresetValuesEqual(
      expectedVisualization.symbols,
      visualization.symbols
    ) &&
    areVisualizationPresetValuesEqual(
      expectedVisualization.missingData,
      visualization.missingData
    )
  );
}

export function applySuggestionToVisualization(
  vizId: string,
  suggestion: VizSuggestion,
  options: { origin?: VisualizationOrigin } = {}
): VisualizationType | null {
  const currentVisualization = visualizationStore.visualizations.find(
    (item) => item.id === vizId
  );
  const previousAutoSubtitle = currentVisualization
    ? getLegendSubtitleForVisualization(currentVisualization)
    : '';
  if (!currentVisualization) {
    return null;
  }

  const dataset = datasetsStore.datasets.find(
    (item) => item.id === currentVisualization.datasetId
  );
  if (!dataset) {
    return null;
  }

  const behavior = resolveSuggestionBehavior(
    suggestion,
    dataset,
    currentVisualization
  );
  const preset = resolveVisualizationPreset(
    behavior.visualizationType,
    dataset
  );
  const suggestionUpdate = buildSuggestionUpdate(
    {
      ...currentVisualization,
      ...preset,
      mapping: { ...preset.mapping },
      style: { ...preset.style },
      modes: preset.modes ? { ...preset.modes } : undefined,
      classification: preset.classification
        ? { ...preset.classification }
        : undefined,
      symbols: preset.symbols ? { ...preset.symbols } : undefined,
      missingData: preset.missingData ? { ...preset.missingData } : undefined
    },
    dataset,
    suggestion
  );

  visualizationStore.updateVisualization(vizId, {
    ...preset,
    ...suggestionUpdate,
    origin: options.origin,
    primitiveOrder: undefined,
    dataFilters: undefined
  });

  const updatedVisualization = visualizationStore.visualizations.find(
    (item) => item.id === vizId
  );
  if (updatedVisualization) {
    syncLegendSubtitleAfterSuggestion(
      vizId,
      previousAutoSubtitle,
      updatedVisualization
    );
  }

  return behavior.visualizationType;
}
