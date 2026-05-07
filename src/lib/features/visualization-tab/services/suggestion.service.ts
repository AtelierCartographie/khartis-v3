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
  type VisualizationRestoreSnapshot,
  type VisualizationRestoreState,
  resolveVisualizationPreset,
  visualizationStore,
  VisualizationType
} from '$lib/features/commons/stores/visualization.store.svelte';
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
  polygon?: Partial<PolygonPrimitiveConfig>;
  symbol?: Partial<SymbolPrimitiveConfig>;
  line?: Partial<LinePrimitiveConfig>;
  text?: Partial<TextPrimitiveConfig>;
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
    strokeMode: StrokeMode.UNIQUE,
    strokeColor: DEFAULT_COLORS.gray,
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
  if (dataset.joinedBasemap) {
    return 'Polygon';
  }

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
  const symbolPrimitiveFilters = isPolygonDataset
    ? [PrimitiveFilterType.POINT, PrimitiveFilterType.POLYGON]
    : [PrimitiveFilterType.POINT];
  const textPrimitiveFilters: PrimitiveFilter[] = isPolygonDataset
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
          labelColumn: primaryTextColumn,
          categoryColumn: secondaryTextColumn
        }),
        modes: {
          ...preset.modes,
          color: ColorMode.CATEGORIES,
          size: SizeMode.FIXED,
          symbol: SymbolMode.UNIQUE
        },
        style: {
          textOpacity: 1
        },
        classification: categoricalPreset.classification,
        symbols: baseSymbols,
        missingData: buildDisabledMissingData(preset.missingData),
        text: buildTextPrimitiveConfig(preset, visualization, {
          labelColumn: primaryTextColumn,
          categoryColumn: secondaryTextColumn,
          colorMode: ColorMode.CATEGORIES,
          sizeMode: SizeMode.FIXED,
          classification: categoricalPreset.classification,
          missingData: buildDisabledMissingData(preset.missingData),
          secondaryLabels: {
            enabled: false,
            labelColumn: undefined
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
          labelColumn: primaryTextColumn,
          valueColumn: secondaryNumericColumn,
          secondaryLabelColumn: secondaryNumericColumn
        }),
        modes: {
          ...preset.modes,
          color: ColorMode.CLASSES,
          size: SizeMode.FIXED,
          symbol: SymbolMode.UNIQUE
        },
        style: {
          textOpacity: 1
        },
        classification: choroplethPreset.classification,
        symbols: baseSymbols,
        missingData: buildDisabledMissingData(preset.missingData),
        text: buildTextPrimitiveConfig(preset, visualization, {
          labelColumn: primaryTextColumn,
          valueColumn: secondaryNumericColumn,
          colorMode: ColorMode.CLASSES,
          sizeMode: SizeMode.FIXED,
          classification: choroplethPreset.classification,
          missingData: buildDisabledMissingData(preset.missingData),
          secondaryLabels: {
            enabled: false,
            labelColumn: secondaryNumericColumn
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
        labelColumn: primaryTextColumn,
        valueColumn: secondaryNumericColumn,
        secondaryLabelColumn: secondaryNumericColumn
      }),
      modes: {
        ...preset.modes,
        color: ColorMode.UNIQUE,
        size: SizeMode.PROPORTIONAL,
        symbol: SymbolMode.UNIQUE
      },
      style: {
        textOpacity: 1
      },
      classification: undefined,
      symbols: baseSymbols,
      missingData: buildDisabledMissingData(preset.missingData),
      text: buildTextPrimitiveConfig(preset, visualization, {
        labelColumn: primaryTextColumn,
        valueColumn: secondaryNumericColumn,
        colorMode: ColorMode.UNIQUE,
        sizeMode: SizeMode.PROPORTIONAL,
        classification: undefined,
        missingData: buildDisabledMissingData(preset.missingData),
        secondaryLabels: {
          enabled: false,
          labelColumn: secondaryNumericColumn
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
          valueColumn: primaryNumericColumn
        }),
        modes: {
          ...preset.modes,
          fill: FillMode.CLASSES
        },
        style: {},
        classification: choroplethPreset.classification,
        symbols: baseSymbols,
        missingData: preset.missingData,
        polygon: {
          enabled: true,
          fillMode: FillMode.CLASSES,
          valueColumn: primaryNumericColumn,
          classification: choroplethPreset.classification,
          missingData: preset.missingData
        },
        symbol: {
          enabled: false
        },
        line: {
          enabled: false
        },
        text: {
          enabled: false
        }
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
          categoryColumn: primaryTextColumn
        }),
        modes: {
          ...preset.modes,
          fill: FillMode.CATEGORIES
        },
        style: {},
        classification: categoricalPreset.classification,
        symbols: baseSymbols,
        missingData: preset.missingData,
        polygon: {
          enabled: true,
          fillMode: FillMode.CATEGORIES,
          categoryColumn: primaryTextColumn,
          classification: categoricalPreset.classification,
          missingData: preset.missingData
        },
        symbol: {
          enabled: false
        },
        line: {
          enabled: false
        },
        text: {
          enabled: false
        }
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
      style: { fillColor: DEFAULT_COLORS.fill },
      classification: undefined,
      symbols: baseSymbols,
      missingData: preset.missingData,
      polygon: {
        enabled: true,
        fillMode: FillMode.UNIQUE,
        fillColor: DEFAULT_COLORS.fill,
        classification: undefined,
        missingData: preset.missingData
      },
      symbol: {
        enabled: false
      },
      line: {
        enabled: false
      },
      text: {
        enabled: false
      }
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
          ? primaryNumericColumn
          : suggestion.id === 'lines_proportional_colorful_QTR'
            ? secondaryNumericColumn
            : undefined,
        categoryColumn: isCategoricalLine
          ? isProportionalLine
            ? secondaryTextColumn
            : primaryTextColumn
          : undefined,
        sizeColumn: isProportionalLine ? proportionalSizeColumn : undefined
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
      style:
        !isCategoricalLine && !isClassedLine
          ? { lineColor: DEFAULT_COLORS.fill }
          : {},
      classification: isCategoricalLine
        ? categoricalPreset.classification
        : isClassedLine
          ? choroplethPreset.classification
          : undefined,
      symbols: baseSymbols,
      missingData: preset.missingData,
      line: {
        enabled: true,
        colorMode: isCategoricalLine
          ? ColorMode.CATEGORIES
          : isClassedLine
            ? ColorMode.CLASSES
            : ColorMode.UNIQUE,
        thicknessMode: isProportionalLine
          ? ThicknessMode.PROPORTIONAL
          : ThicknessMode.UNIQUE,
        valueColumn: isClassedLine
          ? primaryNumericColumn
          : suggestion.id === 'lines_proportional_colorful_QTR'
            ? secondaryNumericColumn
            : undefined,
        categoryColumn: isCategoricalLine
          ? isProportionalLine
            ? secondaryTextColumn
            : primaryTextColumn
          : undefined,
        sizeColumn: isProportionalLine ? proportionalSizeColumn : undefined,
        color:
          !isCategoricalLine && !isClassedLine
            ? DEFAULT_COLORS.fill
            : undefined,
        classification: isCategoricalLine
          ? categoricalPreset.classification
          : isClassedLine
            ? choroplethPreset.classification
            : undefined,
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

  const isCategoricalSymbol = CATEGORY_SUGGESTION_IDS.has(suggestion.id);
  const isClassedSymbol = CLASS_SUGGESTION_IDS.has(suggestion.id);
  const isProportionalSymbol = SYMBOL_PROPORTIONAL_SUGGESTION_IDS.has(
    suggestion.id
  );
  const symbolValueColumn = isClassedSymbol
    ? primaryNumericColumn
    : suggestion.id === 'symbols_proportional_colorful_QTR' ||
        suggestion.id === 'symbols_proportional_double'
      ? secondaryNumericColumn
      : undefined;
  const symbolCategoryColumn = isCategoricalSymbol
    ? isProportionalSymbol
      ? secondaryTextColumn
      : primaryTextColumn
    : undefined;
  const symbolFillClassification = isCategoricalSymbol
    ? categoricalPreset.classification
    : isClassedSymbol
      ? choroplethPreset.classification
      : undefined;

  return {
    visualizationType,
    primaryPrimitives: [PrimitiveFilterType.POINT],
    supportPrimitives: isPolygonDataset ? [PrimitiveFilterType.POLYGON] : [],
    forcedOffPrimitives: [PrimitiveFilterType.LINE, 'text', 'label'],
    primitiveFilters: symbolPrimitiveFilters,
    mapping: buildClearedMapping(preset.mapping.geometryColumn, {
      valueColumn: symbolValueColumn,
      categoryColumn: symbolCategoryColumn,
      sizeColumn: isProportionalSymbol ? proportionalSizeColumn : undefined
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
      symbolFillColor:
        visualization?.style.symbolFillColor ?? DEFAULT_COLORS.fill,
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
    missingData: preset.missingData,
    symbol: {
      enabled: true,
      mode: SYMBOL_CATEGORY_SHAPE_IDS.has(suggestion.id)
        ? SymbolMode.CATEGORIES
        : SYMBOL_UNIQUE_SUGGESTION_IDS.has(suggestion.id)
          ? SymbolMode.UNIQUE
          : SymbolMode.PROPORTIONAL,
      fillMode: isCategoricalSymbol
        ? FillMode.CATEGORIES
        : isClassedSymbol
          ? FillMode.CLASSES
          : FillMode.UNIQUE,
      strokeMode:
        suggestion.id === 'symbols_proportional_double'
          ? StrokeMode.UNIQUE
          : preset.symbol?.strokeMode,
      proportionalType:
        suggestion.id === 'symbols_proportional_double'
          ? ProportionalType.DOUBLE
          : ProportionalType.SINGLE,
      commonScale: suggestion.id !== 'symbols_proportional_double',
      positionMode:
        suggestion.id === 'symbols_proportional_double'
          ? SymbolDoublePosition.OVERLAY
          : SymbolDoublePosition.OVERLAY,
      breakValueA: null,
      breakValueB: null,
      valueColumn: isClassedSymbol ? primaryNumericColumn : symbolValueColumn,
      categoryColumn: symbolCategoryColumn,
      sizeColumn: isProportionalSymbol ? proportionalSizeColumn : undefined,
      fillValueColumn: isClassedSymbol ? symbolValueColumn : undefined,
      fillCategoryColumn: isCategoricalSymbol
        ? symbolCategoryColumn
        : undefined,
      fillColor: visualization?.style.symbolFillColor ?? DEFAULT_COLORS.fill,
      fillColorB:
        suggestion.id === 'symbols_proportional_double'
          ? (visualization?.style.fillColorB ?? DEFAULT_COLORS.secondary)
          : undefined,
      classification: isCategoricalSymbol
        ? categoricalPreset.classification
        : isClassedSymbol
          ? choroplethPreset.classification
          : undefined,
      fillClassification: symbolFillClassification,
      missingData: preset.missingData
    },
    ...(isPolygonDataset
      ? { polygon: buildSupportPolygonConfig(preset, visualization) }
      : {}),
    line: {
      enabled: false
    },
    text: {
      enabled: false
    }
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
    style.strokeColor = DEFAULT_COLORS.gray;
  }

  if (blankType === VisualizationType.PROPORTIONAL) {
    modes.symbol = SymbolMode.UNIQUE;
    modes.proportionalType = ProportionalType.SINGLE;
    style.symbolFillColor = DEFAULT_COLORS.gray;
    style.strokeColor = DEFAULT_COLORS.gray;
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
        strokeColor: DEFAULT_COLORS.gray,
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
        strokeColor: DEFAULT_COLORS.gray,
        missingData: blankMissingData
      }
    : undefined;

  const line = preset.line
    ? {
        ...preset.line,
        enabled: false,
        color: DEFAULT_COLORS.gray,
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
    yearFilter: deepClone(visualization.yearFilter),
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

  return {
    ...origin,
    restoreState:
      existingRestoreState ?? createVisualizationRestoreState(visualization)
  };
}

export function restoreVisualizationFromSuggestion(vizId: string): boolean {
  const visualization = visualizationStore.visualizations.find(
    (item) => item.id === vizId
  );
  const restoreState = visualization?.origin?.restoreState;

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

function getLegendSubtitleForVisualization(
  visualization: VisualizationConfig
): string {
  return getVisualizationLegendSubtitle(visualization);
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
    matchesExpectedSubset(visualization.polygon, behavior.polygon) &&
    matchesExpectedSubset(visualization.symbol, behavior.symbol) &&
    matchesExpectedSubset(visualization.line, behavior.line) &&
    matchesExpectedSubset(visualization.text, behavior.text)
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
