import type {
  DatasetResult,
  ProcessedDataset
} from '$lib/features/data-pipeline';
import type {
  GeometryType,
  VizSuggestion
} from '$lib/features/commons/services/viz-suggester.service';
import {
  getLinePrimitive,
  getPolygonPrimitive,
  getSymbolPrimitive,
  getTextPrimitive,
  getVisualizationOriginMode,
  type LinePrimitiveConfig,
  type PolygonPrimitiveConfig,
  type PrimitiveFilter,
  PrimitiveFilterType,
  type SymbolPrimitiveConfig,
  type TextPrimitiveConfig,
  type VisualizationPreset,
  type VisualizationConfig,
  type VisualizationOrigin,
  type VisualizationAppliedSuggestionState,
  type VisualizationRestoreSnapshot,
  type VisualizationRestoreState,
  ClassificationMethod,
  resolveVisualizationPreset,
  visualizationStore,
  VisualizationType
} from '$lib/features/commons/stores/visualization.store.svelte';
import { suggestClassificationDefaults } from '$lib/features/commons/services/classification.service';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { GEO_COLUMN_TYPE } from '$lib/features/commons/constants/data.constants';
import {
  DEFAULT_COLORS,
  ColorMode,
  FillMode,
  ProportionalType,
  SizeMode,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode,
  ThicknessMode,
  VISUALIZATION_DEFAULTS
} from '$lib/features/commons/constants/visualization.constants';
import {
  getLegendState,
  legendActions
} from '$lib/features/step-toolbar/tools/legend';
import {
  findLatestYearNumericColumn,
  findPreferredNumericColumn,
  findPreferredTextColumn
} from '$lib/features/commons/utils/visualization-columns.utils';
import {
  clampFontSize,
  CARTOGRAPHIC_FONT_FAMILY,
  normalizeFontFamily
} from '$lib/features/step-toolbar/fonts.constants';
import { getVisualizationLegendSubtitle } from '$lib/features/commons/utils/legend-subtitle.utils';

import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { deepClone } from '$lib/features/commons/utils/clone.utils';
import { SavePriority } from '$lib/features/project-management/core';
import { getSuggestionSignature } from '../utils/suggestion-selection.utils';

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

type DatasetPrimitive =
  | PrimitiveFilterType.POINT
  | PrimitiveFilterType.LINE
  | PrimitiveFilterType.POLYGON
  | null;

interface SuggestionBehavior {
  visualizationType: VisualizationType;
  primitiveFilters: VisualizationConfig['primitiveFilters'];
  mapping: VisualizationConfig['mapping'];
  modes?: Partial<VisualizationConfig['modes']>;
  style?: Partial<VisualizationConfig['style']>;
  classification?: VisualizationConfig['classification'];
  symbols?: VisualizationConfig['symbols'];
  missingData?: VisualizationConfig['missingData'];
  polygon?: Partial<PolygonPrimitiveConfig>;
  symbol?: Partial<SymbolPrimitiveConfig>;
  line?: Partial<LinePrimitiveConfig>;
  text?: Partial<TextPrimitiveConfig>;
  dataFilters?: VisualizationConfig['dataFilters'];
}

const TOP_LABELED_SYMBOLS_LIMIT = 10;

function hasGpsCoordinateDetection(
  dataset?: DatasetGeometrySource | null
): boolean {
  if (!dataset?.geoDetection?.geoColumns) {
    return false;
  }

  const hasLat = dataset.geoDetection.geoColumns.some(
    (c) => c.type === GEO_COLUMN_TYPE.LATITUDE
  );
  const hasLon = dataset.geoDetection.geoColumns.some(
    (c) => c.type === GEO_COLUMN_TYPE.LONGITUDE
  );
  return hasLat && hasLon;
}

const SUGGESTION_VISUALIZATION_TYPES = {
  symbols_uniques: VisualizationType.PROPORTIONAL,
  polygons_uniques: VisualizationType.CHOROPLETH,
  lines_uniques: VisualizationType.CHOROPLETH,
  choropleth: VisualizationType.CHOROPLETH,
  choropleth_labeled: VisualizationType.CHOROPLETH,
  symbols_uniques_colorful_QTR: VisualizationType.CHOROPLETH,
  lines_colorful_QTR: VisualizationType.CHOROPLETH,
  symbols_proportional: VisualizationType.PROPORTIONAL,
  symbols_proportional_labeled: VisualizationType.PROPORTIONAL,
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

type SuggestionBehaviorId = keyof typeof SUGGESTION_VISUALIZATION_TYPES;
type SuggestionBehaviorFamily = 'symbol' | 'polygon' | 'line' | 'text';
type SuggestionClassificationKind = 'category' | 'class';
type SuggestionColumnSource =
  | 'primaryNumeric'
  | 'secondaryNumeric'
  | 'proportionalSize'
  | 'primaryText'
  | 'secondaryText';

type SuggestionBehaviorDefinition = {
  family: SuggestionBehaviorFamily;
  classification?: SuggestionClassificationKind;
  fillMode?: FillMode;
  colorMode?: ColorMode;
  sizeMode?: SizeMode;
  thicknessMode?: ThicknessMode;
  symbolMode?: SymbolMode;
  labelColumn?: SuggestionColumnSource;
  valueColumn?: SuggestionColumnSource;
  categoryColumn?: SuggestionColumnSource;
  sizeColumn?: SuggestionColumnSource;
  secondaryLabelColumn?: SuggestionColumnSource;
  doubleSymbol?: boolean;
  topLabelFilter?: boolean;
};

const SUGGESTION_BEHAVIOR_DEFINITIONS = {
  symbols_uniques: {
    family: 'symbol',
    symbolMode: SymbolMode.UNIQUE,
    fillMode: FillMode.UNIQUE
  },
  polygons_uniques: {
    family: 'polygon',
    fillMode: FillMode.UNIQUE
  },
  lines_uniques: {
    family: 'line',
    colorMode: ColorMode.UNIQUE,
    thicknessMode: ThicknessMode.UNIQUE
  },
  choropleth: {
    family: 'polygon',
    fillMode: FillMode.CLASSES,
    classification: 'class',
    valueColumn: 'primaryNumeric'
  },
  choropleth_labeled: {
    family: 'polygon',
    fillMode: FillMode.CLASSES,
    classification: 'class',
    valueColumn: 'primaryNumeric',
    labelColumn: 'secondaryText',
    topLabelFilter: true
  },
  symbols_uniques_colorful_QTR: {
    family: 'symbol',
    symbolMode: SymbolMode.UNIQUE,
    fillMode: FillMode.CLASSES,
    classification: 'class',
    valueColumn: 'primaryNumeric'
  },
  lines_colorful_QTR: {
    family: 'line',
    colorMode: ColorMode.CLASSES,
    thicknessMode: ThicknessMode.UNIQUE,
    classification: 'class',
    valueColumn: 'primaryNumeric'
  },
  symbols_proportional: {
    family: 'symbol',
    symbolMode: SymbolMode.PROPORTIONAL,
    fillMode: FillMode.UNIQUE,
    sizeColumn: 'proportionalSize'
  },
  symbols_proportional_labeled: {
    family: 'symbol',
    symbolMode: SymbolMode.PROPORTIONAL,
    fillMode: FillMode.UNIQUE,
    sizeColumn: 'proportionalSize',
    labelColumn: 'secondaryText',
    topLabelFilter: true
  },
  lines_proportional: {
    family: 'line',
    colorMode: ColorMode.UNIQUE,
    thicknessMode: ThicknessMode.PROPORTIONAL,
    sizeColumn: 'proportionalSize'
  },
  polygons_colorful_QL: {
    family: 'polygon',
    fillMode: FillMode.CATEGORIES,
    classification: 'category',
    categoryColumn: 'primaryText'
  },
  symbols_differents: {
    family: 'symbol',
    symbolMode: SymbolMode.CATEGORIES,
    fillMode: FillMode.CATEGORIES,
    classification: 'category',
    categoryColumn: 'primaryText'
  },
  symbols_uniques_colorful_QL: {
    family: 'symbol',
    symbolMode: SymbolMode.UNIQUE,
    fillMode: FillMode.CATEGORIES,
    classification: 'category',
    categoryColumn: 'primaryText'
  },
  lines_colorful_QL: {
    family: 'line',
    colorMode: ColorMode.CATEGORIES,
    thicknessMode: ThicknessMode.UNIQUE,
    classification: 'category',
    categoryColumn: 'primaryText'
  },
  polygons_colorful_QLO: {
    family: 'polygon',
    fillMode: FillMode.CATEGORIES,
    classification: 'category',
    categoryColumn: 'primaryText'
  },
  symbols_differents_QLO: {
    family: 'symbol',
    symbolMode: SymbolMode.CATEGORIES,
    fillMode: FillMode.CATEGORIES,
    classification: 'category',
    categoryColumn: 'primaryText'
  },
  symbols_uniques_colorful_QLO: {
    family: 'symbol',
    symbolMode: SymbolMode.UNIQUE,
    fillMode: FillMode.CATEGORIES,
    classification: 'category',
    categoryColumn: 'primaryText'
  },
  lines_colorful_QLO: {
    family: 'line',
    colorMode: ColorMode.CATEGORIES,
    thicknessMode: ThicknessMode.UNIQUE,
    classification: 'category',
    categoryColumn: 'primaryText'
  },
  symbols_proportional_colorful_QL: {
    family: 'symbol',
    symbolMode: SymbolMode.PROPORTIONAL,
    fillMode: FillMode.CATEGORIES,
    classification: 'category',
    categoryColumn: 'secondaryText',
    sizeColumn: 'proportionalSize'
  },
  symbols_proportional_colorful_QTR: {
    family: 'symbol',
    symbolMode: SymbolMode.PROPORTIONAL,
    fillMode: FillMode.CLASSES,
    classification: 'class',
    valueColumn: 'secondaryNumeric',
    sizeColumn: 'proportionalSize'
  },
  symbols_proportional_double: {
    family: 'symbol',
    symbolMode: SymbolMode.PROPORTIONAL,
    fillMode: FillMode.UNIQUE,
    valueColumn: 'secondaryNumeric',
    sizeColumn: 'proportionalSize',
    doubleSymbol: true
  },
  lines_proportional_colorful_QL: {
    family: 'line',
    colorMode: ColorMode.CATEGORIES,
    thicknessMode: ThicknessMode.PROPORTIONAL,
    classification: 'category',
    categoryColumn: 'secondaryText',
    sizeColumn: 'proportionalSize'
  },
  lines_proportional_colorful_QTR: {
    family: 'line',
    colorMode: ColorMode.CLASSES,
    thicknessMode: ThicknessMode.PROPORTIONAL,
    classification: 'class',
    valueColumn: 'secondaryNumeric',
    sizeColumn: 'proportionalSize'
  },
  texts_colorful_QL: {
    family: 'text',
    colorMode: ColorMode.CATEGORIES,
    sizeMode: SizeMode.FIXED,
    classification: 'category',
    labelColumn: 'primaryText',
    categoryColumn: 'secondaryText'
  },
  texts_colorful_QTR: {
    family: 'text',
    colorMode: ColorMode.CLASSES,
    sizeMode: SizeMode.FIXED,
    classification: 'class',
    labelColumn: 'primaryText',
    valueColumn: 'secondaryNumeric',
    secondaryLabelColumn: 'secondaryNumeric'
  },
  texts_proportional: {
    family: 'text',
    colorMode: ColorMode.UNIQUE,
    sizeMode: SizeMode.PROPORTIONAL,
    labelColumn: 'primaryText',
    valueColumn: 'secondaryNumeric',
    secondaryLabelColumn: 'secondaryNumeric'
  }
} as const satisfies Record<SuggestionBehaviorId, SuggestionBehaviorDefinition>;

const FALLBACK_SUGGESTION_BEHAVIOR: SuggestionBehaviorDefinition = {
  family: 'symbol',
  symbolMode: SymbolMode.PROPORTIONAL,
  fillMode: FillMode.UNIQUE
};

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

function buildTopTextDataFilter(
  column: string
): NonNullable<VisualizationConfig['dataFilters']>[number] {
  return {
    id: crypto.randomUUID(),
    column,
    operator: 'top_desc',
    value: String(TOP_LABELED_SYMBOLS_LIMIT),
    limit: TOP_LABELED_SYMBOLS_LIMIT,
    primitiveType: PrimitiveFilterType.TEXT
  };
}

function buildSupportPolygonConfig(
  preset: VisualizationPreset,
  visualization?: VisualizationConfig
): Partial<PolygonPrimitiveConfig> {
  const polygon =
    getPolygonPrimitive(visualization) ?? preset.polygon ?? undefined;

  return {
    enabled: true,
    fillMode: FillMode.UNIQUE,
    fillColor: DEFAULT_COLORS.gray,
    fillOpacity: polygon?.fillOpacity ?? 1,
    strokeMode: StrokeMode.NONE,
    strokeColor: DEFAULT_COLORS.neutralStroke,
    strokeWidth: polygon?.strokeWidth ?? 1,
    strokeOpacity: 1,
    strokeDashed: polygon?.strokeDashed ?? false
  };
}

function buildTextPrimitiveConfig(
  preset: VisualizationPreset,
  visualization?: VisualizationConfig,
  overrides: Omit<Partial<TextPrimitiveConfig>, 'secondaryLabels'> & {
    secondaryLabels?: Partial<TextPrimitiveConfig['secondaryLabels']>;
  } = {}
): Partial<TextPrimitiveConfig> {
  const text = getTextPrimitive(visualization) ?? preset.text;
  const defaultTextOpacity = VISUALIZATION_DEFAULTS.textOpacity / 100;
  const baseSecondaryLabels = {
    enabled: false,
    labelColumn: text?.secondaryLabels.labelColumn,
    fontFamily:
      normalizeFontFamily(text?.secondaryLabels.fontFamily) ??
      CARTOGRAPHIC_FONT_FAMILY,
    color: text?.secondaryLabels.color ?? DEFAULT_COLORS.text,
    opacity: text?.secondaryLabels.opacity ?? 1,
    size: clampFontSize(
      text?.secondaryLabels.size ?? VISUALIZATION_DEFAULTS.labelSize,
      VISUALIZATION_DEFAULTS.labelSize
    ),
    bold: text?.secondaryLabels.bold ?? false,
    italic: text?.secondaryLabels.italic ?? false,
    align: text?.secondaryLabels.align ?? 'center',
    halo: text?.secondaryLabels.halo ?? false,
    haloColor: text?.secondaryLabels.haloColor ?? DEFAULT_COLORS.halo,
    haloWidth:
      text?.secondaryLabels.haloWidth ?? VISUALIZATION_DEFAULTS.haloWidth,
    collisionDetection: text?.secondaryLabels.collisionDetection ?? true,
    dxpMasking: text?.secondaryLabels.dxpMasking ?? false
  };

  const baseTextConfig: Partial<TextPrimitiveConfig> = {
    enabled: true,
    colorMode: text?.colorMode ?? ColorMode.UNIQUE,
    sizeMode: text?.sizeMode ?? SizeMode.FIXED,
    fontFamily:
      normalizeFontFamily(text?.fontFamily) ?? CARTOGRAPHIC_FONT_FAMILY,
    color: text?.color ?? DEFAULT_COLORS.text,
    opacity:
      text?.opacity !== undefined && text.opacity > 0
        ? text.opacity
        : defaultTextOpacity,
    size: clampFontSize(
      text?.size ?? VISUALIZATION_DEFAULTS.textSize,
      VISUALIZATION_DEFAULTS.textSize
    ),
    bold: text?.bold ?? false,
    italic: text?.italic ?? false,
    align: text?.align ?? 'center',
    halo: text?.halo ?? false,
    haloColor: text?.haloColor ?? DEFAULT_COLORS.halo,
    haloWidth: text?.haloWidth ?? VISUALIZATION_DEFAULTS.haloWidth,
    collisionDetection: text?.collisionDetection ?? false,
    dxpMasking: text?.dxpMasking ?? false,
    missingData: buildDisabledMissingData(
      text?.missingData ?? preset.missingData
    )
  };

  return {
    ...baseTextConfig,
    ...overrides,
    secondaryLabels: {
      ...baseSecondaryLabels,
      ...(overrides.secondaryLabels ?? {})
    }
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

  if (dataset.gpsMode) {
    return 'Point';
  }
  if (hasGpsCoordinateDetection(dataset)) {
    return 'Point';
  }

  const duckDataset = dataset.sourceFileId
    ? duckDBOrchestrator.getDatasetBySourceFile(dataset.sourceFileId)
    : null;
  if (duckDataset) {
    if (duckDataset.gpsMode) {
      return 'Point';
    }
  }

  const sourceFile = dataset.sourceFileId
    ? projectStore.currentProject?.data?.sourceFiles?.find(
        (f) => f.id === dataset.sourceFileId
      )
    : undefined;
  if (sourceFile?.gpsMode) {
    return 'Point';
  }

  if (dataset.joinedBasemap) {
    return 'Polygon';
  }
  if (duckDataset) {
    if (duckDataset.joinedBasemap) {
      return 'Polygon';
    }
  }
  if (sourceFile?.joinedBasemap) {
    return 'Polygon';
  }

  const datasetId = dataset.id;
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
      if (
        vizType === VisualizationType.PROPORTIONAL ||
        vizType === VisualizationType.BIVARIATE
      ) {
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

type SuggestionColumnValues = {
  primaryNumeric: string | undefined;
  secondaryNumeric: string | undefined;
  proportionalSize: string | undefined;
  primaryText: string | undefined;
  secondaryText: string | undefined;
};

function resolveSuggestionBehaviorDefinition(
  suggestionId: string
): SuggestionBehaviorDefinition {
  return (
    SUGGESTION_BEHAVIOR_DEFINITIONS[suggestionId as SuggestionBehaviorId] ??
    FALLBACK_SUGGESTION_BEHAVIOR
  );
}

function getSuggestionColumn(
  columns: SuggestionColumnValues,
  source: SuggestionColumnSource | undefined
): string | undefined {
  return source ? columns[source] : undefined;
}

function getSuggestionClassification(
  classification: SuggestionClassificationKind | undefined,
  categoricalPreset: VisualizationPreset,
  choroplethPreset: VisualizationPreset
): VisualizationConfig['classification'] {
  if (classification === 'category') {
    return categoricalPreset.classification;
  }

  if (classification === 'class') {
    return choroplethPreset.classification;
  }

  return undefined;
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
  const primaryNumericColumn = findPreferredNumericColumn(dataset.columns, {
    preferred: suggestion.columns?.[0],
    allowIdLikeFallback: true,
    excludeLikelyCoordinates: true
  });
  const secondaryNumericColumn = findPreferredNumericColumn(dataset.columns, {
    preferred: suggestion.columns?.[1],
    allowIdLikeFallback: true,
    excludeLikelyCoordinates: true
  });
  const proportionalSizeColumn =
    findLatestYearNumericColumn(dataset.columns) ?? primaryNumericColumn;
  const primaryTextColumn = findPreferredTextColumn(dataset.columns, {
    preferred: suggestion.columns?.[0]
  });
  const secondaryTextColumn = findPreferredTextColumn(dataset.columns, {
    preferred: suggestion.columns?.[1]
  });
  const behaviorDefinition = resolveSuggestionBehaviorDefinition(suggestion.id);
  const suggestionColumns: SuggestionColumnValues = {
    primaryNumeric: primaryNumericColumn,
    secondaryNumeric: secondaryNumericColumn,
    proportionalSize: proportionalSizeColumn,
    primaryText: primaryTextColumn,
    secondaryText: secondaryTextColumn
  };
  const symbolPrimitiveFilters: PrimitiveFilter[] = [PrimitiveFilterType.POINT];
  const textPrimitiveFilters: PrimitiveFilter[] = isPolygonDataset
    ? [PrimitiveFilterType.POLYGON]
    : [];

  const baseSymbols = preset.symbols
    ? {
        ...preset.symbols,
        opacity: visualization?.symbols?.opacity ?? preset.symbols.opacity
      }
    : preset.symbols;

  if (behaviorDefinition.family === 'text') {
    const labelColumn = getSuggestionColumn(
      suggestionColumns,
      behaviorDefinition.labelColumn
    );
    const valueColumn = getSuggestionColumn(
      suggestionColumns,
      behaviorDefinition.valueColumn
    );
    const categoryColumn = getSuggestionColumn(
      suggestionColumns,
      behaviorDefinition.categoryColumn
    );
    const secondaryLabelColumn = getSuggestionColumn(
      suggestionColumns,
      behaviorDefinition.secondaryLabelColumn
    );
    const classification = getSuggestionClassification(
      behaviorDefinition.classification,
      categoricalPreset,
      choroplethPreset
    );
    const missingData = buildDisabledMissingData(preset.missingData);

    return {
      visualizationType,
      primitiveFilters: textPrimitiveFilters,
      mapping: buildClearedMapping(preset.mapping.geometryColumn, {
        labelColumn,
        valueColumn,
        categoryColumn,
        secondaryLabelColumn
      }),
      modes: {
        ...preset.modes,
        color: behaviorDefinition.colorMode ?? ColorMode.UNIQUE,
        size: behaviorDefinition.sizeMode ?? SizeMode.FIXED,
        symbol: SymbolMode.UNIQUE
      },
      style: {
        textOpacity: 1
      },
      classification,
      symbols: baseSymbols,
      missingData,
      text: buildTextPrimitiveConfig(preset, visualization, {
        labelColumn,
        valueColumn,
        categoryColumn,
        colorMode: behaviorDefinition.colorMode ?? ColorMode.UNIQUE,
        sizeMode: behaviorDefinition.sizeMode ?? SizeMode.FIXED,
        classification,
        missingData,
        secondaryLabels: {
          enabled: false,
          labelColumn: secondaryLabelColumn
        }
      }),
      symbol: {
        enabled: false
      },
      line: {
        enabled: false
      },
      ...(isPolygonDataset
        ? { polygon: buildSupportPolygonConfig(preset, visualization) }
        : {})
    };
  }

  if (behaviorDefinition.family === 'polygon') {
    const valueColumn = getSuggestionColumn(
      suggestionColumns,
      behaviorDefinition.valueColumn
    );
    const categoryColumn = getSuggestionColumn(
      suggestionColumns,
      behaviorDefinition.categoryColumn
    );
    const labelColumn = getSuggestionColumn(
      suggestionColumns,
      behaviorDefinition.labelColumn
    );
    const fillMode = behaviorDefinition.fillMode ?? FillMode.UNIQUE;
    const classification = getSuggestionClassification(
      behaviorDefinition.classification,
      categoricalPreset,
      choroplethPreset
    );
    const hasTopLabelFilter =
      behaviorDefinition.topLabelFilter === true && Boolean(labelColumn);
    const polygonPrimitiveFilters: PrimitiveFilter[] = hasTopLabelFilter
      ? [PrimitiveFilterType.POLYGON, PrimitiveFilterType.TEXT]
      : [PrimitiveFilterType.POLYGON];

    return {
      visualizationType,
      primitiveFilters: polygonPrimitiveFilters,
      mapping: buildClearedMapping(preset.mapping.geometryColumn, {
        valueColumn,
        categoryColumn,
        labelColumn: hasTopLabelFilter ? labelColumn : undefined
      }),
      modes: {
        ...preset.modes,
        fill: fillMode,
        stroke: StrokeMode.NONE
      },
      style:
        fillMode === FillMode.UNIQUE ? { fillColor: DEFAULT_COLORS.fill } : {},
      classification,
      symbols: baseSymbols,
      missingData: preset.missingData,
      polygon: {
        enabled: true,
        fillMode,
        strokeMode: StrokeMode.NONE,
        valueColumn,
        categoryColumn,
        fillColor:
          fillMode === FillMode.UNIQUE ? DEFAULT_COLORS.fill : undefined,
        classification,
        missingData: preset.missingData
      },
      symbol: {
        enabled: false
      },
      line: {
        enabled: false
      },
      text:
        hasTopLabelFilter && labelColumn
          ? buildTextPrimitiveConfig(preset, visualization, {
              labelColumn,
              colorMode: ColorMode.UNIQUE,
              sizeMode: SizeMode.FIXED,
              missingData: buildDisabledMissingData(preset.missingData),
              secondaryLabels: {
                enabled: false,
                labelColumn: undefined
              }
            })
          : {
              enabled: false
            },
      ...(hasTopLabelFilter && valueColumn
        ? { dataFilters: [buildTopTextDataFilter(valueColumn)] }
        : {})
    };
  }

  if (behaviorDefinition.family === 'line') {
    const valueColumn = getSuggestionColumn(
      suggestionColumns,
      behaviorDefinition.valueColumn
    );
    const categoryColumn = getSuggestionColumn(
      suggestionColumns,
      behaviorDefinition.categoryColumn
    );
    const sizeColumn = getSuggestionColumn(
      suggestionColumns,
      behaviorDefinition.sizeColumn
    );
    const colorMode = behaviorDefinition.colorMode ?? ColorMode.UNIQUE;
    const thicknessMode =
      behaviorDefinition.thicknessMode ?? ThicknessMode.UNIQUE;
    const isUniqueColorLine = colorMode === ColorMode.UNIQUE;
    const classification = getSuggestionClassification(
      behaviorDefinition.classification,
      categoricalPreset,
      choroplethPreset
    );

    return {
      visualizationType,
      primitiveFilters: [PrimitiveFilterType.LINE],
      mapping: buildClearedMapping(preset.mapping.geometryColumn, {
        valueColumn,
        categoryColumn,
        sizeColumn
      }),
      modes: {
        ...preset.modes,
        fill: FillMode.NONE,
        color: colorMode,
        thickness: thicknessMode
      },
      style: isUniqueColorLine ? { lineColor: DEFAULT_COLORS.fill } : {},
      classification,
      symbols: baseSymbols,
      missingData: preset.missingData,
      line: {
        enabled: true,
        colorMode,
        thicknessMode,
        valueColumn,
        categoryColumn,
        sizeColumn,
        color: isUniqueColorLine ? DEFAULT_COLORS.fill : undefined,
        classification,
        missingData: preset.missingData
      },
      symbol: {
        enabled: false
      },
      polygon: {
        enabled: false
      },
      text: {
        enabled: false
      }
    };
  }

  const symbolMode = behaviorDefinition.symbolMode ?? SymbolMode.PROPORTIONAL;
  const symbolFillMode = behaviorDefinition.fillMode ?? FillMode.UNIQUE;
  const isDoubleSymbol = behaviorDefinition.doubleSymbol === true;
  const symbolValueColumn = getSuggestionColumn(
    suggestionColumns,
    behaviorDefinition.valueColumn
  );
  const symbolCategoryColumn = getSuggestionColumn(
    suggestionColumns,
    behaviorDefinition.categoryColumn
  );
  const symbolSizeColumn = getSuggestionColumn(
    suggestionColumns,
    behaviorDefinition.sizeColumn
  );
  const symbolFillClassification = getSuggestionClassification(
    behaviorDefinition.classification,
    categoricalPreset,
    choroplethPreset
  );
  const symbolLabelColumn = getSuggestionColumn(
    suggestionColumns,
    behaviorDefinition.labelColumn
  );
  const hasTopSymbolLabelFilter =
    behaviorDefinition.topLabelFilter === true && Boolean(symbolLabelColumn);
  const activeSymbolPrimitiveFilters: PrimitiveFilter[] =
    hasTopSymbolLabelFilter
      ? [...symbolPrimitiveFilters, PrimitiveFilterType.TEXT]
      : symbolPrimitiveFilters;

  return {
    visualizationType,
    primitiveFilters: activeSymbolPrimitiveFilters,
    mapping: buildClearedMapping(preset.mapping.geometryColumn, {
      valueColumn: symbolValueColumn,
      categoryColumn: symbolCategoryColumn,
      sizeColumn: symbolSizeColumn,
      labelColumn: hasTopSymbolLabelFilter ? symbolLabelColumn : undefined
    }),
    modes: {
      ...preset.modes,
      symbol: symbolMode,
      fill: symbolFillMode,
      stroke: isDoubleSymbol ? StrokeMode.UNIQUE : preset.modes?.stroke,
      proportionalType: isDoubleSymbol
        ? ProportionalType.DOUBLE
        : ProportionalType.SINGLE
    },
    style: {
      symbolFillColor:
        visualization?.style.symbolFillColor ?? DEFAULT_COLORS.fill,
      ...(isDoubleSymbol
        ? {
            fillColorB:
              visualization?.style.fillColorB ?? DEFAULT_COLORS.secondary
          }
        : {})
    },
    classification: symbolFillClassification,
    symbols: baseSymbols,
    missingData: preset.missingData,
    symbol: {
      enabled: true,
      mode: symbolMode,
      fillMode: symbolFillMode,
      strokeMode: isDoubleSymbol
        ? StrokeMode.UNIQUE
        : preset.symbol?.strokeMode,
      proportionalType: isDoubleSymbol
        ? ProportionalType.DOUBLE
        : ProportionalType.SINGLE,
      commonScale: !isDoubleSymbol,
      positionMode: SymbolDoublePosition.OVERLAY,
      breakValueA: null,
      breakValueB: null,
      valueColumn: symbolValueColumn,
      categoryColumn: symbolCategoryColumn,
      sizeColumn: symbolSizeColumn,
      fillValueColumn:
        symbolFillMode === FillMode.CLASSES ? symbolValueColumn : undefined,
      fillCategoryColumn:
        symbolFillMode === FillMode.CATEGORIES
          ? symbolCategoryColumn
          : undefined,
      fillColor: visualization?.style.symbolFillColor ?? DEFAULT_COLORS.fill,
      fillColorB: isDoubleSymbol
        ? (visualization?.style.fillColorB ?? DEFAULT_COLORS.secondary)
        : undefined,
      classification: symbolFillClassification,
      fillClassification: symbolFillClassification,
      missingData: preset.missingData
    },
    polygon: {
      enabled: false
    },
    line: {
      enabled: false
    },
    text:
      hasTopSymbolLabelFilter && symbolLabelColumn
        ? buildTextPrimitiveConfig(preset, visualization, {
            labelColumn: symbolLabelColumn,
            colorMode: ColorMode.UNIQUE,
            sizeMode: SizeMode.FIXED,
            missingData: buildDisabledMissingData(preset.missingData),
            secondaryLabels: {
              enabled: false,
              labelColumn: undefined
            }
          })
        : {
            enabled: false
          },
    ...(hasTopSymbolLabelFilter && symbolSizeColumn
      ? { dataFilters: [buildTopTextDataFilter(symbolSizeColumn)] }
      : {})
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
    lineColor: DEFAULT_COLORS.neutralStroke,
    textFontFamily: CARTOGRAPHIC_FONT_FAMILY,
    textHalo: false,
    textCollisionDetection: false,
    textDxpMasking: false,
    labelFontFamily: CARTOGRAPHIC_FONT_FAMILY,
    labelBold: false,
    labelItalic: false,
    labelHalo: false,
    labelCollisionDetection: false,
    labelDxpMasking: false
  };

  if (blankType === VisualizationType.CHOROPLETH) {
    modes.fill = FillMode.NONE;
    style.strokeColor = DEFAULT_COLORS.neutralStroke;
  }

  if (blankType === VisualizationType.PROPORTIONAL) {
    modes.symbol = SymbolMode.UNIQUE;
    modes.proportionalType = ProportionalType.SINGLE;
    style.symbolFillColor = DEFAULT_COLORS.gray;
    style.strokeColor = DEFAULT_COLORS.neutralStroke;
  }

  const blankMissingData = preset.missingData
    ? {
        ...preset.missingData,
        show: false,
        enabled: false,
        pattern: false
      }
    : undefined;

  const polygon = preset.polygon
    ? {
        ...preset.polygon,
        enabled: blankType === VisualizationType.CHOROPLETH,
        fillMode:
          blankType === VisualizationType.CHOROPLETH
            ? FillMode.NONE
            : preset.polygon.fillMode,
        strokeColor: DEFAULT_COLORS.neutralStroke,
        missingData: blankMissingData
      }
    : undefined;

  const symbol = preset.symbol
    ? {
        ...preset.symbol,
        enabled: blankType === VisualizationType.PROPORTIONAL,
        mode:
          blankType === VisualizationType.PROPORTIONAL
            ? SymbolMode.UNIQUE
            : preset.symbol.mode,
        proportionalType:
          blankType === VisualizationType.PROPORTIONAL
            ? ProportionalType.SINGLE
            : preset.symbol.proportionalType,
        fillColor:
          blankType === VisualizationType.PROPORTIONAL
            ? DEFAULT_COLORS.gray
            : preset.symbol.fillColor,
        strokeColor: DEFAULT_COLORS.neutralStroke,
        missingData: blankMissingData
      }
    : undefined;

  const line = preset.line
    ? {
        ...preset.line,
        enabled: false,
        color: DEFAULT_COLORS.neutralStroke,
        missingData: blankMissingData
      }
    : undefined;

  const text = preset.text
    ? {
        ...preset.text,
        enabled: false,
        classification: undefined,
        missingData: blankMissingData,
        secondaryLabels: {
          ...preset.text.secondaryLabels,
          enabled: false
        }
      }
    : undefined;

  return {
    ...preset,
    modes,
    style,
    polygon,
    symbol,
    line,
    text,
    mapping: {
      geometryColumn: preset.mapping.geometryColumn
    },
    classification: undefined,
    primitiveFilters:
      blankType === VisualizationType.PROPORTIONAL
        ? [PrimitiveFilterType.POINT]
        : [PrimitiveFilterType.POLYGON],
    missingData: blankMissingData
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

function createVisualizationRestoreSnapshot(
  visualization: VisualizationConfig
): VisualizationRestoreSnapshot {
  return {
    type: visualization.type,
    modes: deepClone(visualization.modes),
    primitiveFilters: deepClone(visualization.primitiveFilters),
    primitiveOrder: deepClone(visualization.primitiveOrder),
    polygon: deepClone(visualization.polygon),
    symbol: deepClone(visualization.symbol),
    line: deepClone(visualization.line),
    text: deepClone(visualization.text),
    style: deepClone(visualization.style),
    mapping: deepClone(visualization.mapping),
    classification: deepClone(visualization.classification),
    symbols: deepClone(visualization.symbols),
    missingData: deepClone(visualization.missingData),
    density: deepClone(visualization.density),
    dataFilters: deepClone(visualization.dataFilters)
  };
}

function createVisualizationRestoreState(
  visualization: VisualizationConfig
): VisualizationRestoreState {
  return {
    origin: {
      mode: getVisualizationOriginMode(visualization),
      ...(visualization.origin?.suggestionKey
        ? { suggestionKey: visualization.origin.suggestionKey }
        : {})
    },
    visualization: createVisualizationRestoreSnapshot(visualization)
  };
}

function createVisualizationAppliedSuggestionState(
  visualization: VisualizationConfig,
  suggestionKey: string
): VisualizationAppliedSuggestionState {
  return {
    suggestionKey,
    visualization: createVisualizationRestoreSnapshot(visualization)
  };
}

export function buildSuggestionOrigin(
  visualization: VisualizationConfig,
  origin: VisualizationOrigin
): VisualizationOrigin {
  const currentMode = getVisualizationOriginMode(visualization);
  const existingRestoreState =
    (currentMode === 'auto-suggestion' ||
      currentMode === 'manual-suggestion') &&
    visualization.origin?.restoreState
      ? deepClone(visualization.origin.restoreState)
      : undefined;
  const existingAppliedSuggestionState =
    origin.suggestionKey &&
    visualization.origin?.appliedSuggestionState?.suggestionKey ===
      origin.suggestionKey
      ? deepClone(visualization.origin.appliedSuggestionState)
      : undefined;

  return {
    ...origin,
    ...(existingAppliedSuggestionState
      ? { appliedSuggestionState: existingAppliedSuggestionState }
      : {}),
    restoreState:
      existingRestoreState ?? createVisualizationRestoreState(visualization)
  };
}

export function rememberAppliedSuggestionState(
  vizId: string,
  suggestionKey: string
): void {
  const visualization = visualizationStore.visualizations.find(
    (item) => item.id === vizId
  );
  if (!visualization) {
    return;
  }

  visualizationStore.updateVisualization(
    vizId,
    {
      origin: {
        mode: getVisualizationOriginMode(visualization),
        ...(visualization.origin?.suggestionKey
          ? { suggestionKey: visualization.origin.suggestionKey }
          : { suggestionKey }),
        ...(visualization.origin?.restoreState
          ? { restoreState: deepClone(visualization.origin.restoreState) }
          : {}),
        appliedSuggestionState: createVisualizationAppliedSuggestionState(
          visualization,
          suggestionKey
        )
      }
    },
    SavePriority.IMMEDIATE
  );
}

export function restoreVisualizationFromSuggestion(vizId: string): boolean {
  const visualization = visualizationStore.visualizations.find(
    (item) => item.id === vizId
  );
  const restoreState = visualization?.origin?.restoreState;
  const appliedSuggestionState = visualization?.origin?.appliedSuggestionState;

  if (!visualization || !restoreState) {
    return false;
  }

  const restoredVisualization = {
    ...visualization,
    ...deepClone(restoreState.visualization),
    origin: undefined
  } as VisualizationConfig;
  const restoreOriginMode = restoreState.origin.mode;
  const dataset = datasetsStore.datasets.find(
    (item) => item.id === visualization.datasetId
  );

  let nextOrigin: VisualizationOrigin | undefined;
  if (
    restoreOriginMode === 'auto-suggestion' ||
    restoreOriginMode === 'manual-suggestion'
  ) {
    nextOrigin =
      dataset && isVisualizationBlank(restoredVisualization, dataset)
        ? { mode: 'manual-blank' }
        : { mode: 'custom' };
  } else if (restoreOriginMode === 'legacy') {
    nextOrigin = undefined;
  } else {
    nextOrigin = deepClone(restoreState.origin);
  }

  if (appliedSuggestionState) {
    nextOrigin = {
      ...(nextOrigin ??
        (dataset && isVisualizationBlank(restoredVisualization, dataset)
          ? { mode: 'manual-blank' as const }
          : { mode: 'custom' as const })),
      appliedSuggestionState: deepClone(appliedSuggestionState)
    };
  }

  visualizationStore.updateVisualization(vizId, {
    ...deepClone(restoreState.visualization),
    origin: nextOrigin
  });

  return true;
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

function mergePrimitiveConfig<T extends object>(
  base: T | undefined,
  updates: Partial<T> | undefined
): T | undefined {
  if (!base && !updates) {
    return undefined;
  }

  return {
    ...(base ?? ({} as T)),
    ...(updates ?? {})
  } as T;
}

function mergeTextPrimitiveConfig(
  base: TextPrimitiveConfig | undefined,
  updates: Partial<TextPrimitiveConfig> | undefined
): TextPrimitiveConfig | undefined {
  if (!base && !updates) {
    return undefined;
  }

  return {
    ...(base ?? ({} as TextPrimitiveConfig)),
    ...(updates ?? {}),
    secondaryLabels: {
      ...(base?.secondaryLabels ?? {
        enabled: false,
        fontFamily: CARTOGRAPHIC_FONT_FAMILY,
        opacity: 1,
        size: VISUALIZATION_DEFAULTS.labelSize,
        bold: false,
        italic: false,
        align: 'center',
        halo: false,
        haloColor: DEFAULT_COLORS.halo,
        haloWidth: VISUALIZATION_DEFAULTS.haloWidth,
        collisionDetection: true,
        dxpMasking: false
      }),
      ...(updates?.secondaryLabels ?? {})
    },
    background: {
      ...(base?.background ?? {
        fillMode: FillMode.NONE,
        fillOpacity: VISUALIZATION_DEFAULTS.fillOpacity / 100,
        strokeMode: StrokeMode.NONE,
        strokeWidth: VISUALIZATION_DEFAULTS.strokeWidth,
        strokeOpacity: 1,
        strokeDashed: false
      }),
      ...(updates?.background ?? {})
    }
  } as TextPrimitiveConfig;
}

export function isVisualizationBlank(
  visualization: VisualizationConfig,
  dataset: DatasetGeometrySource
): boolean {
  const blankPreset = resolveBlankVisualizationPreset(
    dataset as Parameters<typeof resolveVisualizationPreset>[1]
  );

  return (
    visualization.type === blankPreset.type &&
    matchesExpectedSubset(visualization.modes, blankPreset.modes) &&
    areVisualizationPresetValuesEqual(
      visualization.primitiveFilters,
      blankPreset.primitiveFilters
    ) &&
    matchesExpectedSubset(visualization.style, blankPreset.style) &&
    matchesExpectedSubset(visualization.mapping, blankPreset.mapping) &&
    matchesExpectedSubset(visualization.polygon, blankPreset.polygon) &&
    matchesExpectedSubset(visualization.symbol, blankPreset.symbol) &&
    matchesExpectedSubset(visualization.line, blankPreset.line) &&
    matchesExpectedSubset(visualization.text, blankPreset.text) &&
    areVisualizationPresetValuesEqual(
      normalizeClassificationForPresetComparison(visualization.classification),
      normalizeClassificationForPresetComparison(blankPreset.classification)
    ) &&
    matchesExpectedSubset(visualization.symbols, blankPreset.symbols) &&
    matchesExpectedSubset(visualization.missingData, blankPreset.missingData)
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

  const nextAutoSubtitle = getVisualizationLegendSubtitle(visualization);
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
    dataFilters: behavior.dataFilters,
    classification: behavior.classification,
    symbols: behavior.symbols,
    missingData: behavior.missingData,
    polygon: mergePrimitiveConfig(
      getPolygonPrimitive(visualization),
      behavior.polygon
    ),
    symbol: mergePrimitiveConfig(
      getSymbolPrimitive(visualization),
      behavior.symbol
    ),
    line: mergePrimitiveConfig(getLinePrimitive(visualization), behavior.line),
    text: mergeTextPrimitiveConfig(
      getTextPrimitive(visualization),
      behavior.text
    )
  };
}

function matchesExpectedSubset(
  currentValue: unknown,
  expectedValue: unknown
): boolean {
  if (expectedValue === undefined) {
    return true;
  }

  if (expectedValue === null || typeof expectedValue !== 'object') {
    return areVisualizationPresetValuesEqual(currentValue, expectedValue);
  }

  if (Array.isArray(expectedValue)) {
    return areVisualizationPresetValuesEqual(currentValue, expectedValue);
  }

  if (!currentValue || typeof currentValue !== 'object') {
    return false;
  }

  return Object.entries(expectedValue).every(([key, value]) =>
    matchesExpectedSubset((currentValue as Record<string, unknown>)[key], value)
  );
}

function isColorPalettePrefix(
  currentColors: unknown,
  expectedColors: unknown
): boolean {
  if (!Array.isArray(currentColors) || !Array.isArray(expectedColors)) {
    return areVisualizationPresetValuesEqual(currentColors, expectedColors);
  }
  if (currentColors.length > expectedColors.length) {
    return false;
  }
  return currentColors.every((color, index) =>
    areVisualizationPresetValuesEqual(color, expectedColors[index])
  );
}

/**
 * Like matchesExpectedSubset, but tolerant of the data-derived parts of a
 * primitive's classification: applying a categorical suggestion trims the
 * default palette to the number of actual categories (and adds per-category
 * labels), so the live `classification.colors` is a prefix of the suggestion's
 * full default palette and `labels` are dataset-specific. Comparing those
 * strictly would wrongly mark the suggestion as not applied.
 */
function matchesPrimitiveSubset(
  currentValue: unknown,
  expectedValue: unknown
): boolean {
  if (
    !expectedValue ||
    typeof expectedValue !== 'object' ||
    Array.isArray(expectedValue)
  ) {
    return matchesExpectedSubset(currentValue, expectedValue);
  }

  const expected = expectedValue as Record<string, unknown>;
  const current = (
    currentValue && typeof currentValue === 'object' ? currentValue : {}
  ) as Record<string, unknown>;

  return Object.entries(expected).every(([key, value]) => {
    if (key !== 'classification' || !value || typeof value !== 'object') {
      return matchesExpectedSubset(current[key], value);
    }

    const expectedClassification = value as Record<string, unknown>;
    const currentClassification = (
      current.classification && typeof current.classification === 'object'
        ? current.classification
        : {}
    ) as Record<string, unknown>;

    return Object.entries(expectedClassification).every(
      ([classificationKey, classificationValue]) => {
        if (classificationKey === 'labels') {
          return true;
        }
        if (classificationKey === 'colors') {
          return isColorPalettePrefix(
            currentClassification.colors,
            classificationValue
          );
        }
        return matchesExpectedSubset(
          currentClassification[classificationKey],
          classificationValue
        );
      }
    );
  });
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

  return (
    behavior.visualizationType === visualization.type &&
    matchesExpectedSubset(visualization.modes, behavior.modes) &&
    areVisualizationPresetValuesEqual(
      visualization.primitiveFilters,
      behavior.primitiveFilters
    ) &&
    matchesExpectedSubset(visualization.mapping, behavior.mapping) &&
    matchesPrimitiveSubset(visualization.polygon, behavior.polygon) &&
    matchesPrimitiveSubset(visualization.symbol, behavior.symbol) &&
    matchesPrimitiveSubset(visualization.line, behavior.line) &&
    matchesExpectedSubset(visualization.text, behavior.text)
  );
}

function ensureVisualizationActive(vizId: string): void {
  if (
    visualizationStore.activeVisualizations.some(
      (visualization) => visualization.id === vizId
    )
  ) {
    return;
  }

  visualizationStore.toggleVisualization(vizId);
}

function adaptSuggestedClassification(
  classification: VisualizationConfig['classification'],
  mapping: VisualizationConfig['mapping'] | undefined,
  dataset: DatasetResult | ProcessedDataset
): VisualizationConfig['classification'] {
  if (
    !classification ||
    classification.method === ClassificationMethod.MANUAL
  ) {
    return classification;
  }

  const columnName = mapping?.valueColumn ?? mapping?.colorColumn;
  const column = columnName
    ? dataset.columns?.find((col) => col.name === columnName)
    : undefined;
  const stats = (column as { stats?: { skewness?: number } } | undefined)
    ?.stats;

  const defaults = suggestClassificationDefaults({
    method: classification.method,
    classes: classification.classes,
    skewness: stats?.skewness,
    rowCount: dataset.rowCount
  });

  if (
    defaults.method === classification.method &&
    defaults.classes === classification.classes
  ) {
    return classification;
  }

  return {
    ...classification,
    method: defaults.method,
    classes: defaults.classes
  };
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
    ? getVisualizationLegendSubtitle(currentVisualization)
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
      polygon: preset.polygon ? { ...preset.polygon } : undefined,
      symbol: preset.symbol ? { ...preset.symbol } : undefined,
      line: preset.line ? { ...preset.line } : undefined,
      text: preset.text
        ? {
            ...preset.text,
            secondaryLabels: { ...preset.text.secondaryLabels }
          }
        : undefined,
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
  suggestionUpdate.classification = adaptSuggestedClassification(
    suggestionUpdate.classification,
    suggestionUpdate.mapping,
    dataset
  );
  const rememberedAppliedState = options.origin?.appliedSuggestionState;
  const suggestionKey = getSuggestionSignature(suggestion);
  const rememberedSuggestionUpdate =
    rememberedAppliedState?.suggestionKey === suggestionKey
      ? deepClone(rememberedAppliedState.visualization)
      : null;

  ensureVisualizationActive(vizId);

  visualizationStore.updateVisualization(
    vizId,
    rememberedSuggestionUpdate
      ? {
          ...rememberedSuggestionUpdate,
          origin: options.origin
        }
      : {
          ...preset,
          ...suggestionUpdate,
          origin: options.origin,
          primitiveOrder: undefined,
          dataFilters: suggestionUpdate.dataFilters
        },
    SavePriority.IMMEDIATE
  );

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
