import {
  DEFAULT_CATEGORICAL_COLORS,
  ClassificationMethod,
  getLinePrimitive,
  getLineThicknessClassification,
  getPolygonPrimitive,
  getPrimitiveCategoryColumn,
  getPrimitiveClassification,
  getPrimitiveSizeColumn,
  getPrimitiveValueColumn,
  getSymbolFillCategoryColumn,
  getSymbolFillClassification,
  getSymbolFillValueColumn,
  getSymbolPrimitive,
  getTextPrimitive,
  PrimitiveFilterType,
  type ClassificationConfig,
  type PrimitiveFilter,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  findPaletteById,
  PALETTE_TYPE,
  type PaletteType
} from '$lib/features/commons/components/palette-popover/palette.constants';
import {
  findLatestYearNumericColumn,
  findPreferredNumericColumn,
  findPreferredTextColumn,
  isHiddenTechnicalColumnName,
  isIdLikeColumnName
} from '$lib/features/commons/utils/visualization-columns.utils';
import { joinLegendSubtitleParts } from '$lib/features/commons/utils/legend-subtitle.utils';
import {
  getLegendState,
  legendActions
} from '$lib/features/step-toolbar/tools/legend';
import {
  ColorMode,
  DEFAULT_CLASSIFICATION_CLASS_COUNT,
  FillMode,
  StrokeMode,
  SymbolMode,
  ThicknessMode
} from '$lib/features/commons/constants/visualization.constants';
import type { FieldSelectionItem } from './use-field-selection.svelte';

export const CORE_PRIMITIVES = [
  PrimitiveFilterType.POINT,
  PrimitiveFilterType.LINE,
  PrimitiveFilterType.POLYGON,
  PrimitiveFilterType.TEXT
] as const;

export const CLASSIFIABLE_PRIMITIVES = [
  PrimitiveFilterType.POLYGON,
  PrimitiveFilterType.POINT,
  PrimitiveFilterType.LINE,
  PrimitiveFilterType.TEXT
] as const;

export type ClassifiablePrimitive = (typeof CLASSIFIABLE_PRIMITIVES)[number];

export const STROKE_CLASSIFIABLE_PRIMITIVES = [
  PrimitiveFilterType.POINT,
  PrimitiveFilterType.POLYGON
] as const;

export type StrokeClassifiablePrimitive =
  (typeof STROKE_CLASSIFIABLE_PRIMITIVES)[number];

type CorePrimitive = (typeof CORE_PRIMITIVES)[number];
type MappingUpdates = Partial<VisualizationConfig['mapping']>;
type ClassificationUpdateOptions = { preserveOrigin?: boolean };
type VisualizationWriteOptions = {
  visualization?: VisualizationConfig;
  // Auto-column assignment and default seeding are DERIVED maintenance, never a
  // user divergence: preserving the origin keeps a freshly-applied suggestion
  // from being re-tagged `custom` (which would uncheck its suggestion card).
  preserveOrigin?: boolean;
};
type ClassificationDefaultsTarget = {
  getClassification: (
    visualization: VisualizationConfig
  ) => ClassificationConfig | undefined;
  update: (updates: Partial<ClassificationConfig>) => void;
  usesBreaks: (visualization: VisualizationConfig) => boolean;
  usesCategories?: (visualization: VisualizationConfig) => boolean;
  defaultClassCount?: number;
};
type ClassificationAutoColumnsTarget = {
  usesBreaks: (visualization: VisualizationConfig) => boolean;
  getValueColumn: (visualization: VisualizationConfig) => string | undefined;
  findValueColumn: (visualization: VisualizationConfig) => string | undefined;
  applyValueColumn: (
    column: string,
    visualization: VisualizationConfig
  ) => void;
  usesCategories: (visualization: VisualizationConfig) => boolean;
  getCategoryColumn: (visualization: VisualizationConfig) => string | undefined;
  findCategoryColumn: (
    visualization: VisualizationConfig
  ) => string | undefined;
  applyCategoryColumn: (
    column: string,
    visualization: VisualizationConfig
  ) => void;
};

interface PrimitivePanelControllerOptions {
  getDataFields: () => FieldSelectionItem[];
  getVisualization: () => VisualizationConfig | undefined;
  updatePrimitiveClassification: (
    primitive: ClassifiablePrimitive,
    updates: Partial<ClassificationConfig>,
    options?: ClassificationUpdateOptions
  ) => void;
  updateLineThicknessClassification: (
    updates: Partial<ClassificationConfig>,
    options?: ClassificationUpdateOptions
  ) => void;
  updatePrimitiveStrokeClassification: (
    primitive: StrokeClassifiablePrimitive,
    updates: Partial<ClassificationConfig>,
    options?: ClassificationUpdateOptions
  ) => void;
  updateVisualization: (
    updates: Partial<VisualizationConfig>,
    afterUpdate?: (nextVisualization: VisualizationConfig) => void
  ) => void;
}

function hasOwnKey<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function mergeClassificationConfig(
  existing: ClassificationConfig | undefined,
  updates: Partial<ClassificationConfig>
): ClassificationConfig {
  return {
    method: existing?.method ?? ClassificationMethod.KMEANS,
    classes: existing?.classes ?? DEFAULT_CLASSIFICATION_CLASS_COUNT,
    ...existing,
    ...updates
  };
}

function resetClassificationComputedValues(
  classification: ClassificationConfig | undefined
): ClassificationConfig | undefined {
  if (!classification) {
    return undefined;
  }

  return {
    ...classification,
    breaks: undefined,
    counts: undefined,
    roundedMin: undefined,
    roundedMax: undefined,
    colors: undefined,
    breakpointValue: null,
    breakpointLowerClassCount: undefined
  };
}

function invertClassificationPalette(
  classification: ClassificationConfig | undefined,
  update: (updates: Partial<ClassificationConfig>) => void
): void {
  const colors = classification?.colors;
  if (!classification || !colors?.length) {
    return;
  }

  update({
    colors: [...colors].reverse(),
    inverted: !(classification.inverted ?? false)
  });
}

const DEFAULT_POLYGON_FILL_CLASS_COUNT = 4;

function getDefaultPrimitiveClassCount(
  primitive: ClassifiablePrimitive
): number {
  return primitive === PrimitiveFilterType.POLYGON
    ? DEFAULT_POLYGON_FILL_CLASS_COUNT
    : DEFAULT_CLASSIFICATION_CLASS_COUNT;
}

export function usePrimitivePanelController({
  getDataFields,
  getVisualization,
  updatePrimitiveClassification,
  updateLineThicknessClassification,
  updatePrimitiveStrokeClassification,
  updateVisualization
}: PrimitivePanelControllerOptions) {
  function resolveWriteVisualization(
    options?: VisualizationWriteOptions
  ): VisualizationConfig | undefined {
    return options?.visualization ?? getVisualization();
  }

  function buildOriginPatch(
    visualization: VisualizationConfig,
    options?: VisualizationWriteOptions
  ): Partial<VisualizationConfig> {
    return options?.preserveOrigin && visualization.origin
      ? { origin: visualization.origin }
      : {};
  }

  function resolveClassificationPaletteType(
    classification: ClassificationConfig | undefined
  ): PaletteType | undefined {
    return classification?.paletteId
      ? findPaletteById(classification.paletteId)?.type
      : undefined;
  }

  function findAutoValueColumn(
    reservedColumns: Array<string | undefined>
  ): string | undefined {
    return findPreferredNumericColumn(getDataFields(), {
      exclude: reservedColumns
    });
  }

  function findFallbackNumericColumn(
    reservedColumns: Array<string | undefined>
  ): string | undefined {
    return findPreferredNumericColumn(getDataFields(), {
      exclude: reservedColumns,
      allowIdLikeFallback: true
    });
  }

  function findAutoCategoryColumn(
    reservedColumns: Array<string | undefined>
  ): string | undefined {
    return findPreferredTextColumn(getDataFields(), {
      exclude: reservedColumns,
      excludeLikelyCoordinates: true
    });
  }

  function getReservedColumnsForValue(
    visualization: VisualizationConfig,
    primitive: ClassifiablePrimitive
  ): Array<string | undefined> {
    switch (primitive) {
      case PrimitiveFilterType.POLYGON: {
        const polygon = getPolygonPrimitive(visualization);
        return [polygon?.categoryColumn];
      }

      case PrimitiveFilterType.POINT: {
        const symbol = getSymbolPrimitive(visualization);
        return [symbol?.categoryColumn, symbol?.sizeColumn];
      }

      case PrimitiveFilterType.LINE: {
        const line = getLinePrimitive(visualization);
        return [line?.categoryColumn, line?.sizeColumn];
      }

      case PrimitiveFilterType.TEXT: {
        const text = getTextPrimitive(visualization);
        return [
          text?.labelColumn,
          text?.secondaryLabels.labelColumn,
          text?.categoryColumn
        ];
      }
    }
  }

  function getReservedColumnsForCategory(
    visualization: VisualizationConfig,
    primitive: ClassifiablePrimitive
  ): Array<string | undefined> {
    switch (primitive) {
      case PrimitiveFilterType.POLYGON: {
        const polygon = getPolygonPrimitive(visualization);
        return [polygon?.valueColumn];
      }

      case PrimitiveFilterType.POINT: {
        const symbol = getSymbolPrimitive(visualization);
        return [symbol?.valueColumn, symbol?.sizeColumn];
      }

      case PrimitiveFilterType.LINE: {
        const line = getLinePrimitive(visualization);
        return [line?.valueColumn, line?.sizeColumn];
      }

      case PrimitiveFilterType.TEXT: {
        const text = getTextPrimitive(visualization);
        return [
          text?.labelColumn,
          text?.secondaryLabels.labelColumn,
          text?.valueColumn
        ];
      }
    }
  }

  function getReservedColumnsForSymbolFillValue(
    visualization: VisualizationConfig
  ): Array<string | undefined> {
    const symbol = getSymbolPrimitive(visualization);
    return [
      symbol?.fillCategoryColumn,
      symbol?.categoryColumn,
      symbol?.sizeColumn
    ];
  }

  function getReservedColumnsForSymbolFillCategory(
    visualization: VisualizationConfig
  ): Array<string | undefined> {
    const symbol = getSymbolPrimitive(visualization);
    return [symbol?.fillValueColumn, symbol?.valueColumn, symbol?.sizeColumn];
  }

  function usesCategoricalClassification(
    visualization: VisualizationConfig | undefined,
    primitive: ClassifiablePrimitive
  ): boolean {
    if (!visualization) {
      return false;
    }

    switch (primitive) {
      case PrimitiveFilterType.POLYGON: {
        return (
          getPolygonPrimitive(visualization)?.fillMode === FillMode.CATEGORIES
        );
      }

      case PrimitiveFilterType.POINT: {
        return (
          getSymbolPrimitive(visualization)?.mode === SymbolMode.CATEGORIES
        );
      }

      case PrimitiveFilterType.LINE: {
        return (
          getLinePrimitive(visualization)?.colorMode === ColorMode.CATEGORIES
        );
      }

      case PrimitiveFilterType.TEXT: {
        return (
          getTextPrimitive(visualization)?.colorMode === ColorMode.CATEGORIES
        );
      }
    }
  }

  function usesBreakClassification(
    visualization: VisualizationConfig | undefined,
    primitive: ClassifiablePrimitive
  ): boolean {
    if (!visualization) {
      return false;
    }

    switch (primitive) {
      case PrimitiveFilterType.POLYGON: {
        return (
          getPolygonPrimitive(visualization)?.fillMode === FillMode.CLASSES
        );
      }

      case PrimitiveFilterType.POINT: {
        return getSymbolPrimitive(visualization)?.mode === SymbolMode.CLASSES;
      }

      case PrimitiveFilterType.LINE: {
        const line = getLinePrimitive(visualization);
        return (
          line?.colorMode === ColorMode.CLASSES ||
          line?.thicknessMode === ThicknessMode.CLASSES
        );
      }

      case PrimitiveFilterType.TEXT: {
        return getTextPrimitive(visualization)?.colorMode === ColorMode.CLASSES;
      }
    }
  }

  function usesLineThicknessBreakClassification(
    visualization: VisualizationConfig | undefined
  ): boolean {
    return (
      getLinePrimitive(visualization)?.thicknessMode === ThicknessMode.CLASSES
    );
  }

  function usesSymbolFillBreakClassification(
    visualization: VisualizationConfig | null | undefined
  ): boolean {
    return getSymbolPrimitive(visualization)?.fillMode === FillMode.CLASSES;
  }

  function usesSymbolFillCategoricalClassification(
    visualization: VisualizationConfig | null | undefined
  ): boolean {
    return getSymbolPrimitive(visualization)?.fillMode === FillMode.CATEGORIES;
  }

  function updateSymbolFillClassificationState(
    updates: Partial<ClassificationConfig>,
    options?: VisualizationWriteOptions
  ): void {
    const visualization = resolveWriteVisualization(options);
    if (!visualization) {
      return;
    }

    const symbol = getSymbolPrimitive(visualization);
    if (!symbol) {
      return;
    }

    updateVisualization({
      ...buildOriginPatch(visualization, options),
      symbol: {
        ...symbol,
        fillClassification: mergeClassificationConfig(
          symbol.fillClassification,
          updates
        )
      }
    });
  }

  function applySymbolFillMappingUpdate(
    updates: MappingUpdates,
    options?: VisualizationWriteOptions
  ): void {
    const visualization = resolveWriteVisualization(options);
    if (!visualization) {
      return;
    }

    const symbol = getSymbolPrimitive(visualization);
    if (!symbol) {
      return;
    }

    const previousFillCategoryColumn =
      symbol.fillCategoryColumn ??
      symbol.categoryColumn ??
      visualization.mapping.categoryColumn;
    const fillCategoryColumnChanged =
      hasOwnKey(updates, 'categoryColumn') &&
      updates.categoryColumn !== previousFillCategoryColumn;
    const nextFillClassification =
      fillCategoryColumnChanged && symbol.fillClassification
        ? {
            ...symbol.fillClassification,
            labels: [],
            disabledLabels: undefined
          }
        : symbol.fillClassification;

    updateVisualization(
      {
        ...buildOriginPatch(visualization, options),
        symbol: {
          ...symbol,
          ...(hasOwnKey(updates, 'valueColumn')
            ? { fillValueColumn: updates.valueColumn }
            : {}),
          ...(hasOwnKey(updates, 'categoryColumn')
            ? { fillCategoryColumn: updates.categoryColumn }
            : {}),
          ...(nextFillClassification
            ? { fillClassification: nextFillClassification }
            : {})
        }
      },
      (nextVisualization) => {
        ensureSymbolFillClassificationDefaults(nextVisualization);
      }
    );
  }

  function invertSymbolFillPalette(): void {
    invertClassificationPalette(
      getSymbolFillClassification(getVisualization()),
      updateSymbolFillClassificationState
    );
  }

  function getPrimitiveStrokeValueColumn(
    visualization: VisualizationConfig | null | undefined,
    primitive: StrokeClassifiablePrimitive
  ): string | undefined {
    switch (primitive) {
      case PrimitiveFilterType.POLYGON:
        return getPolygonPrimitive(visualization)?.strokeValueColumn;
      case PrimitiveFilterType.POINT:
      default:
        return getSymbolPrimitive(visualization)?.strokeValueColumn;
    }
  }

  function getPrimitiveStrokeCategoryColumn(
    visualization: VisualizationConfig | null | undefined,
    primitive: StrokeClassifiablePrimitive
  ): string | undefined {
    switch (primitive) {
      case PrimitiveFilterType.POLYGON:
        return getPolygonPrimitive(visualization)?.strokeCategoryColumn;
      case PrimitiveFilterType.POINT:
      default:
        return getSymbolPrimitive(visualization)?.strokeCategoryColumn;
    }
  }

  function getPrimitiveStrokeClassification(
    visualization: VisualizationConfig | null | undefined,
    primitive: StrokeClassifiablePrimitive
  ): ClassificationConfig | undefined {
    switch (primitive) {
      case PrimitiveFilterType.POLYGON:
        return getPolygonPrimitive(visualization)?.strokeClassification;
      case PrimitiveFilterType.POINT:
      default:
        return getSymbolPrimitive(visualization)?.strokeClassification;
    }
  }

  function usesStrokeBreakClassification(
    visualization: VisualizationConfig | null | undefined,
    primitive: StrokeClassifiablePrimitive
  ): boolean {
    switch (primitive) {
      case PrimitiveFilterType.POLYGON:
        return (
          getPolygonPrimitive(visualization)?.strokeMode === StrokeMode.CLASSES
        );
      case PrimitiveFilterType.POINT:
      default:
        return (
          getSymbolPrimitive(visualization)?.strokeMode === StrokeMode.CLASSES
        );
    }
  }

  function usesStrokeCategoricalClassification(
    visualization: VisualizationConfig | null | undefined,
    primitive: StrokeClassifiablePrimitive
  ): boolean {
    switch (primitive) {
      case PrimitiveFilterType.POLYGON:
        return (
          getPolygonPrimitive(visualization)?.strokeMode ===
          StrokeMode.CATEGORIES
        );
      case PrimitiveFilterType.POINT:
      default:
        return (
          getSymbolPrimitive(visualization)?.strokeMode ===
          StrokeMode.CATEGORIES
        );
    }
  }

  function buildNextPrimitiveFilters(
    overrides: Partial<Record<CorePrimitive, boolean>> = {}
  ): PrimitiveFilter[] {
    const visualization = getVisualization();

    return CORE_PRIMITIVES.filter((primitive) => {
      const override = overrides[primitive];
      if (override !== undefined) {
        return override;
      }

      switch (primitive) {
        case PrimitiveFilterType.POINT:
          return getSymbolPrimitive(visualization)?.enabled ?? false;
        case PrimitiveFilterType.LINE:
          return getLinePrimitive(visualization)?.enabled ?? false;
        case PrimitiveFilterType.POLYGON:
          return getPolygonPrimitive(visualization)?.enabled ?? false;
        case PrimitiveFilterType.TEXT:
          return getTextPrimitive(visualization)?.enabled ?? false;
      }
    });
  }

  function invertPrimitivePalette(primitive: ClassifiablePrimitive): void {
    invertClassificationPalette(
      getPrimitiveClassification(getVisualization(), primitive),
      (updates) => updatePrimitiveClassification(primitive, updates)
    );
  }

  function invertPrimitiveStrokePalette(
    primitive: StrokeClassifiablePrimitive
  ): void {
    invertClassificationPalette(
      getPrimitiveStrokeClassification(getVisualization(), primitive),
      (updates) => updatePrimitiveStrokeClassification(primitive, updates)
    );
  }

  function ensureClassificationDefaults(
    visualization: VisualizationConfig,
    target: ClassificationDefaultsTarget
  ): void {
    const classification = target.getClassification(visualization);
    const currentPaletteType = resolveClassificationPaletteType(classification);

    if (target.usesBreaks(visualization)) {
      const hasIncompatiblePalette =
        currentPaletteType === PALETTE_TYPE.QUALITATIVE;
      const resetPaletteFields = hasIncompatiblePalette
        ? { paletteId: undefined, colors: [] }
        : {};
      if (!classification?.method || !classification?.numClasses) {
        const defaultClassCount =
          target.defaultClassCount ?? DEFAULT_CLASSIFICATION_CLASS_COUNT;
        target.update({
          method: ClassificationMethod.KMEANS,
          classes: defaultClassCount,
          numClasses: defaultClassCount,
          ...resetPaletteFields
        });
      } else if (hasIncompatiblePalette) {
        target.update(resetPaletteFields);
      }
      return;
    }

    if (target.usesCategories?.(visualization)) {
      const hasIncompatiblePalette =
        currentPaletteType !== undefined &&
        currentPaletteType !== PALETTE_TYPE.QUALITATIVE;
      const needsColors = !classification?.colors?.length;
      const needsLabels = classification?.labels === undefined;

      if (hasIncompatiblePalette || needsColors || needsLabels) {
        target.update({
          colors: needsColors
            ? [...DEFAULT_CATEGORICAL_COLORS]
            : (classification?.colors ?? []),
          inverted: classification?.inverted ?? false,
          ...(needsLabels ? { labels: [] } : {}),
          ...(hasIncompatiblePalette ? { paletteId: undefined } : {})
        });
      }
    }
  }

  function ensurePrimitiveClassificationDefaults(
    primitive: ClassifiablePrimitive,
    visualization: VisualizationConfig
  ): void {
    ensureClassificationDefaults(visualization, {
      getClassification: (currentVisualization) =>
        getPrimitiveClassification(currentVisualization, primitive),
      update: (updates) =>
        updatePrimitiveClassification(primitive, updates, {
          preserveOrigin: true
        }),
      usesBreaks: (currentVisualization) =>
        primitive === PrimitiveFilterType.LINE
          ? getLinePrimitive(currentVisualization)?.colorMode ===
            ColorMode.CLASSES
          : usesBreakClassification(currentVisualization, primitive),
      usesCategories: (currentVisualization) =>
        primitive === PrimitiveFilterType.LINE
          ? getLinePrimitive(currentVisualization)?.colorMode ===
            ColorMode.CATEGORIES
          : usesCategoricalClassification(currentVisualization, primitive),
      defaultClassCount: getDefaultPrimitiveClassCount(primitive)
    });
  }

  function ensureLineThicknessClassificationDefaults(
    visualization: VisualizationConfig
  ): void {
    ensureClassificationDefaults(visualization, {
      getClassification: getLineThicknessClassification,
      update: (updates) =>
        updateLineThicknessClassification(updates, { preserveOrigin: true }),
      usesBreaks: usesLineThicknessBreakClassification
    });
  }

  function ensureClassificationAutoColumns(
    visualization: VisualizationConfig,
    target: ClassificationAutoColumnsTarget
  ): void {
    if (
      target.usesBreaks(visualization) &&
      !target.getValueColumn(visualization)
    ) {
      const nextValueColumn = target.findValueColumn(visualization);
      if (nextValueColumn) {
        target.applyValueColumn(nextValueColumn, visualization);
      }
    }

    if (
      target.usesCategories(visualization) &&
      !target.getCategoryColumn(visualization)
    ) {
      const nextCategoryColumn = target.findCategoryColumn(visualization);
      if (nextCategoryColumn) {
        target.applyCategoryColumn(nextCategoryColumn, visualization);
      }
    }
  }

  function ensureAutoColumns(
    primitive: ClassifiablePrimitive,
    visualization: VisualizationConfig
  ): void {
    const sizeColumn = getPrimitiveSizeColumn(visualization, primitive);

    ensureClassificationAutoColumns(visualization, {
      usesBreaks: (currentVisualization) =>
        usesBreakClassification(currentVisualization, primitive),
      getValueColumn: (currentVisualization) =>
        getPrimitiveValueColumn(currentVisualization, primitive),
      findValueColumn: (currentVisualization) => {
        const reservedColumns = getReservedColumnsForValue(
          currentVisualization,
          primitive
        );
        return (
          findAutoValueColumn(reservedColumns) ??
          findFallbackNumericColumn(reservedColumns)
        );
      },
      applyValueColumn: (column, currentVisualization) =>
        applyPrimitiveMappingUpdate(
          primitive,
          { valueColumn: column },
          { visualization: currentVisualization, preserveOrigin: true }
        ),
      usesCategories: (currentVisualization) =>
        usesCategoricalClassification(currentVisualization, primitive),
      getCategoryColumn: (currentVisualization) =>
        getPrimitiveCategoryColumn(currentVisualization, primitive),
      findCategoryColumn: (currentVisualization) =>
        findAutoCategoryColumn(
          getReservedColumnsForCategory(currentVisualization, primitive)
        ),
      applyCategoryColumn: (column, currentVisualization) =>
        applyPrimitiveMappingUpdate(
          primitive,
          { categoryColumn: column },
          { visualization: currentVisualization, preserveOrigin: true }
        )
    });

    if (primitive === PrimitiveFilterType.POINT && !sizeColumn) {
      const symbol = getSymbolPrimitive(visualization);
      if (symbol?.mode === SymbolMode.PROPORTIONAL) {
        const reusableValueColumn =
          symbol.valueColumn &&
          !isHiddenTechnicalColumnName(symbol.valueColumn) &&
          (!isIdLikeColumnName(symbol.valueColumn) ||
            symbol.valueColumn === 'id')
            ? symbol.valueColumn
            : undefined;
        const latestYearColumn = findLatestYearNumericColumn(getDataFields(), [
          symbol.categoryColumn
        ]);
        const nextSizeColumn =
          latestYearColumn ??
          reusableValueColumn ??
          findAutoValueColumn([symbol.categoryColumn, symbol.valueColumn]) ??
          findFallbackNumericColumn([
            symbol.categoryColumn,
            symbol.valueColumn
          ]);
        if (nextSizeColumn) {
          applyPrimitiveMappingUpdate(
            primitive,
            {
              sizeColumn: nextSizeColumn
            },
            { visualization, preserveOrigin: true }
          );
        }
      }
    }

    if (primitive === PrimitiveFilterType.LINE && !sizeColumn) {
      const line = getLinePrimitive(visualization);
      if (line?.thicknessMode === ThicknessMode.PROPORTIONAL) {
        const reusableValueColumn =
          line.valueColumn &&
          !isHiddenTechnicalColumnName(line.valueColumn) &&
          (!isIdLikeColumnName(line.valueColumn) || line.valueColumn === 'id')
            ? line.valueColumn
            : undefined;
        const nextSizeColumn =
          reusableValueColumn ??
          findAutoValueColumn([line.categoryColumn, line.valueColumn]) ??
          findFallbackNumericColumn([line.categoryColumn, line.valueColumn]);
        if (nextSizeColumn) {
          applyPrimitiveMappingUpdate(
            primitive,
            {
              sizeColumn: nextSizeColumn
            },
            { visualization, preserveOrigin: true }
          );
        }
      }
    }
  }

  function ensurePrimitiveStrokeClassificationDefaults(
    primitive: StrokeClassifiablePrimitive,
    visualization: VisualizationConfig
  ): void {
    ensureClassificationDefaults(visualization, {
      getClassification: (currentVisualization) =>
        getPrimitiveStrokeClassification(currentVisualization, primitive),
      update: (updates) =>
        updatePrimitiveStrokeClassification(primitive, updates, {
          preserveOrigin: true
        }),
      usesBreaks: (currentVisualization) =>
        usesStrokeBreakClassification(currentVisualization, primitive),
      usesCategories: (currentVisualization) =>
        usesStrokeCategoricalClassification(currentVisualization, primitive)
    });
  }

  function ensurePrimitiveStrokeAutoColumns(
    primitive: StrokeClassifiablePrimitive,
    visualization: VisualizationConfig
  ): void {
    ensureClassificationAutoColumns(visualization, {
      usesBreaks: (currentVisualization) =>
        usesStrokeBreakClassification(currentVisualization, primitive),
      getValueColumn: (currentVisualization) =>
        getPrimitiveStrokeValueColumn(currentVisualization, primitive),
      findValueColumn: (currentVisualization) => {
        const reservedColumns = getReservedColumnsForValue(
          currentVisualization,
          primitive
        );
        return (
          (primitive === PrimitiveFilterType.POINT
            ? getSymbolFillValueColumn(currentVisualization)
            : undefined) ??
          getPrimitiveValueColumn(currentVisualization, primitive) ??
          findAutoValueColumn(reservedColumns) ??
          findFallbackNumericColumn(reservedColumns)
        );
      },
      applyValueColumn: (column, currentVisualization) =>
        applyPrimitiveStrokeMappingUpdate(
          primitive,
          { valueColumn: column },
          { visualization: currentVisualization, preserveOrigin: true }
        ),
      usesCategories: (currentVisualization) =>
        usesStrokeCategoricalClassification(currentVisualization, primitive),
      getCategoryColumn: (currentVisualization) =>
        getPrimitiveStrokeCategoryColumn(currentVisualization, primitive),
      findCategoryColumn: (currentVisualization) =>
        (primitive === PrimitiveFilterType.POINT
          ? getSymbolFillCategoryColumn(currentVisualization)
          : undefined) ??
        getPrimitiveCategoryColumn(currentVisualization, primitive) ??
        findAutoCategoryColumn(
          getReservedColumnsForCategory(currentVisualization, primitive)
        ),
      applyCategoryColumn: (column, currentVisualization) =>
        applyPrimitiveStrokeMappingUpdate(
          primitive,
          { categoryColumn: column },
          { visualization: currentVisualization, preserveOrigin: true }
        )
    });
  }

  function ensureSymbolFillClassificationDefaults(
    visualization: VisualizationConfig
  ): void {
    ensureClassificationDefaults(visualization, {
      getClassification: getSymbolFillClassification,
      update: (updates) =>
        updateSymbolFillClassificationState(updates, {
          visualization,
          preserveOrigin: true
        }),
      usesBreaks: usesSymbolFillBreakClassification,
      usesCategories: usesSymbolFillCategoricalClassification
    });
  }

  function ensureSymbolFillAutoColumns(
    visualization: VisualizationConfig
  ): void {
    ensureClassificationAutoColumns(visualization, {
      usesBreaks: usesSymbolFillBreakClassification,
      getValueColumn: getSymbolFillValueColumn,
      findValueColumn: (currentVisualization) => {
        const symbol = getSymbolPrimitive(currentVisualization);
        const reservedColumns =
          getReservedColumnsForSymbolFillValue(currentVisualization);
        return (
          symbol?.valueColumn ??
          symbol?.sizeColumn ??
          findAutoValueColumn(reservedColumns) ??
          findFallbackNumericColumn(reservedColumns)
        );
      },
      applyValueColumn: (column, currentVisualization) =>
        applySymbolFillMappingUpdate(
          { valueColumn: column },
          { visualization: currentVisualization, preserveOrigin: true }
        ),
      usesCategories: usesSymbolFillCategoricalClassification,
      getCategoryColumn: getSymbolFillCategoryColumn,
      findCategoryColumn: (currentVisualization) =>
        getSymbolPrimitive(currentVisualization)?.categoryColumn ??
        findAutoCategoryColumn(
          getReservedColumnsForSymbolFillCategory(currentVisualization)
        ),
      applyCategoryColumn: (column, currentVisualization) =>
        applySymbolFillMappingUpdate(
          { categoryColumn: column },
          { visualization: currentVisualization, preserveOrigin: true }
        )
    });
  }

  function getLegendSubtitleForPrimitive(
    visualization: VisualizationConfig,
    primitive: ClassifiablePrimitive
  ): string {
    switch (primitive) {
      case PrimitiveFilterType.POLYGON:
        return joinLegendSubtitleParts([
          getPrimitiveValueColumn(visualization, primitive),
          getPrimitiveCategoryColumn(visualization, primitive)
        ]);

      case PrimitiveFilterType.POINT:
        return joinLegendSubtitleParts([
          getPrimitiveSizeColumn(visualization, primitive),
          getPrimitiveValueColumn(visualization, primitive),
          getPrimitiveCategoryColumn(visualization, primitive)
        ]);

      case PrimitiveFilterType.LINE:
        return joinLegendSubtitleParts([
          getPrimitiveSizeColumn(visualization, primitive),
          getPrimitiveValueColumn(visualization, primitive),
          getPrimitiveCategoryColumn(visualization, primitive)
        ]);

      case PrimitiveFilterType.TEXT: {
        const text = getTextPrimitive(visualization);
        return joinLegendSubtitleParts([
          text?.valueColumn,
          text?.categoryColumn,
          text?.labelColumn
        ]);
      }
    }
  }

  function syncLegendSubtitleAfterMappingChange(
    primitive: ClassifiablePrimitive,
    previousVisualization: VisualizationConfig,
    nextVisualization: VisualizationConfig
  ): void {
    const previousAutoSubtitle = getLegendSubtitleForPrimitive(
      previousVisualization,
      primitive
    );
    const nextAutoSubtitle = getLegendSubtitleForPrimitive(
      nextVisualization,
      primitive
    );
    const legendItem = getLegendState().items.find(
      (item) => item.variableId === nextVisualization.id
    );
    const usesAutomaticSubtitle =
      legendItem?.subtitleMode === 'auto' ||
      (!legendItem?.subtitleMode &&
        (!legendItem?.subtitle ||
          legendItem.subtitle === previousAutoSubtitle));

    if (
      legendItem &&
      usesAutomaticSubtitle &&
      legendItem.subtitle !== nextAutoSubtitle
    ) {
      legendActions.updateLegendItem(legendItem.id, {
        subtitle: nextAutoSubtitle,
        subtitleMode: 'auto'
      });
    }
  }

  function applyPrimitiveMappingUpdate(
    primitive: ClassifiablePrimitive,
    updates: MappingUpdates,
    options?: VisualizationWriteOptions
  ): void {
    const visualization = resolveWriteVisualization(options);
    if (!visualization) {
      return;
    }

    const previousVisualization = visualization;
    const originPatch =
      options?.preserveOrigin && previousVisualization.origin
        ? { origin: previousVisualization.origin }
        : {};

    switch (primitive) {
      case PrimitiveFilterType.POLYGON: {
        const polygon = getPolygonPrimitive(visualization);
        if (!polygon) {
          return;
        }

        const previousCategoryColumn =
          polygon.categoryColumn ?? visualization.mapping.categoryColumn;
        const categoryColumnChanged =
          hasOwnKey(updates, 'categoryColumn') &&
          updates.categoryColumn !== previousCategoryColumn;
        const previousValueColumn =
          polygon.valueColumn ?? visualization.mapping.valueColumn;
        const valueColumnChanged =
          hasOwnKey(updates, 'valueColumn') &&
          updates.valueColumn !== previousValueColumn;
        const nextPolygonClassificationBase =
          categoryColumnChanged && polygon.classification
            ? {
                ...polygon.classification,
                labels: [],
                disabledLabels: undefined,
                categoryValues: undefined,
                colors: undefined
              }
            : polygon.classification;
        const nextPolygonClassification = valueColumnChanged
          ? resetClassificationComputedValues(nextPolygonClassificationBase)
          : nextPolygonClassificationBase;
        const nextRootPolygonClassificationBase =
          categoryColumnChanged && visualization.classification
            ? {
                ...visualization.classification,
                labels: [],
                disabledLabels: undefined,
                categoryValues: undefined,
                colors: undefined
              }
            : visualization.classification;
        const nextRootPolygonClassification = valueColumnChanged
          ? resetClassificationComputedValues(nextRootPolygonClassificationBase)
          : categoryColumnChanged
            ? nextRootPolygonClassificationBase
            : undefined;

        updateVisualization(
          {
            ...originPatch,
            ...(nextRootPolygonClassification
              ? { classification: nextRootPolygonClassification }
              : {}),
            polygon: {
              ...polygon,
              ...(hasOwnKey(updates, 'valueColumn')
                ? { valueColumn: updates.valueColumn }
                : {}),
              ...(hasOwnKey(updates, 'categoryColumn')
                ? { categoryColumn: updates.categoryColumn }
                : {}),
              ...(nextPolygonClassification
                ? { classification: nextPolygonClassification }
                : {})
            },
            mapping: { ...visualization.mapping, ...updates }
          },
          (nextVisualization) => {
            syncLegendSubtitleAfterMappingChange(
              primitive,
              previousVisualization,
              nextVisualization
            );
            ensurePrimitiveClassificationDefaults(primitive, nextVisualization);
          }
        );
        return;
      }

      case PrimitiveFilterType.POINT: {
        const symbol = getSymbolPrimitive(visualization);
        if (!symbol) {
          return;
        }

        const previousCategoryColumn =
          symbol.categoryColumn ?? visualization.mapping.categoryColumn;
        const categoryColumnChanged =
          hasOwnKey(updates, 'categoryColumn') &&
          updates.categoryColumn !== previousCategoryColumn;
        const previousValueColumn =
          symbol.valueColumn ?? visualization.mapping.valueColumn;
        const valueColumnChanged =
          hasOwnKey(updates, 'valueColumn') &&
          updates.valueColumn !== previousValueColumn;
        const shouldResetStrokeLabels =
          categoryColumnChanged &&
          (!symbol.strokeCategoryColumn ||
            symbol.strokeCategoryColumn === previousCategoryColumn);
        const nextSymbolClassificationBase = categoryColumnChanged
          ? {
              ...(symbol.classification ?? {
                method: ClassificationMethod.KMEANS,
                classes: DEFAULT_CLASSIFICATION_CLASS_COUNT
              }),
              labels: [],
              disabledLabels: undefined,
              categoryValues: undefined,
              colors: undefined,
              categoryShapes: undefined
            }
          : symbol.classification;
        const nextSymbolClassification = valueColumnChanged
          ? resetClassificationComputedValues(nextSymbolClassificationBase)
          : nextSymbolClassificationBase;
        const nextSymbolStrokeClassification =
          shouldResetStrokeLabels && symbol.strokeClassification
            ? {
                ...symbol.strokeClassification,
                labels: undefined,
                disabledLabels: undefined
              }
            : symbol.strokeClassification;
        const rootPointClassificationBase =
          visualization.symbolClassification ?? symbol.classification;
        const nextRootPointClassificationBase =
          categoryColumnChanged && rootPointClassificationBase
            ? {
                ...rootPointClassificationBase,
                labels: [],
                disabledLabels: undefined,
                categoryValues: undefined,
                colors: undefined,
                categoryShapes: undefined
              }
            : rootPointClassificationBase;
        const nextRootPointClassification = valueColumnChanged
          ? resetClassificationComputedValues(nextRootPointClassificationBase)
          : categoryColumnChanged
            ? nextRootPointClassificationBase
            : undefined;

        updateVisualization(
          {
            ...originPatch,
            ...(nextRootPointClassification
              ? { symbolClassification: nextRootPointClassification }
              : {}),
            symbol: {
              ...symbol,
              ...(hasOwnKey(updates, 'valueColumn')
                ? { valueColumn: updates.valueColumn }
                : {}),
              ...(hasOwnKey(updates, 'categoryColumn')
                ? { categoryColumn: updates.categoryColumn }
                : {}),
              ...(hasOwnKey(updates, 'sizeColumn')
                ? { sizeColumn: updates.sizeColumn }
                : {}),
              ...(nextSymbolClassification
                ? { classification: nextSymbolClassification }
                : {}),
              ...(nextSymbolStrokeClassification
                ? { strokeClassification: nextSymbolStrokeClassification }
                : {})
            },
            mapping: { ...visualization.mapping, ...updates }
          },
          (nextVisualization) => {
            syncLegendSubtitleAfterMappingChange(
              primitive,
              previousVisualization,
              nextVisualization
            );
            ensurePrimitiveClassificationDefaults(primitive, nextVisualization);
          }
        );
        return;
      }

      case PrimitiveFilterType.LINE: {
        const line = getLinePrimitive(visualization);
        if (!line) {
          return;
        }

        const previousCategoryColumn =
          line.categoryColumn ?? visualization.mapping.categoryColumn;
        const categoryColumnChanged =
          hasOwnKey(updates, 'categoryColumn') &&
          updates.categoryColumn !== previousCategoryColumn;
        const previousValueColumn =
          line.valueColumn ?? visualization.mapping.valueColumn;
        const valueColumnChanged =
          hasOwnKey(updates, 'valueColumn') &&
          updates.valueColumn !== previousValueColumn;
        const nextLineClassificationBase =
          categoryColumnChanged && line.classification
            ? {
                ...line.classification,
                labels: [],
                disabledLabels: undefined,
                categoryValues: undefined,
                colors: undefined
              }
            : line.classification;
        const nextLineClassification = valueColumnChanged
          ? resetClassificationComputedValues(nextLineClassificationBase)
          : nextLineClassificationBase;
        const rootLineClassificationBase =
          visualization.lineClassification ?? line.classification;
        const nextRootLineClassificationBase =
          categoryColumnChanged && rootLineClassificationBase
            ? {
                ...rootLineClassificationBase,
                labels: [],
                disabledLabels: undefined,
                categoryValues: undefined,
                colors: undefined
              }
            : rootLineClassificationBase;
        const nextRootLineClassification = valueColumnChanged
          ? resetClassificationComputedValues(nextRootLineClassificationBase)
          : categoryColumnChanged
            ? nextRootLineClassificationBase
            : undefined;

        updateVisualization(
          {
            ...originPatch,
            ...(nextRootLineClassification
              ? { lineClassification: nextRootLineClassification }
              : {}),
            line: {
              ...line,
              ...(hasOwnKey(updates, 'valueColumn')
                ? { valueColumn: updates.valueColumn }
                : {}),
              ...(hasOwnKey(updates, 'categoryColumn')
                ? { categoryColumn: updates.categoryColumn }
                : {}),
              ...(hasOwnKey(updates, 'sizeColumn')
                ? { sizeColumn: updates.sizeColumn }
                : {}),
              ...(nextLineClassification
                ? { classification: nextLineClassification }
                : {})
            },
            mapping: { ...visualization.mapping, ...updates }
          },
          (nextVisualization) => {
            syncLegendSubtitleAfterMappingChange(
              primitive,
              previousVisualization,
              nextVisualization
            );
            ensurePrimitiveClassificationDefaults(primitive, nextVisualization);
          }
        );
        return;
      }

      case PrimitiveFilterType.TEXT: {
        const text = getTextPrimitive(visualization);
        if (!text) {
          return;
        }

        const previousCategoryColumn =
          text.categoryColumn ?? visualization.mapping.categoryColumn;
        const categoryColumnChanged =
          hasOwnKey(updates, 'categoryColumn') &&
          updates.categoryColumn !== previousCategoryColumn;
        const previousValueColumn =
          text.valueColumn ?? visualization.mapping.valueColumn;
        const valueColumnChanged =
          hasOwnKey(updates, 'valueColumn') &&
          updates.valueColumn !== previousValueColumn;
        const nextTextClassificationBase =
          categoryColumnChanged && text.classification
            ? {
                ...text.classification,
                labels: [],
                disabledLabels: undefined,
                categoryValues: undefined,
                colors: undefined
              }
            : text.classification;
        const nextTextClassification = valueColumnChanged
          ? resetClassificationComputedValues(nextTextClassificationBase)
          : nextTextClassificationBase;
        const secondaryLabelColumnProvided = hasOwnKey(
          updates,
          'secondaryLabelColumn'
        );
        const nextSecondaryLabelColumn = secondaryLabelColumnProvided
          ? updates.secondaryLabelColumn
          : text.secondaryLabels.labelColumn;

        updateVisualization(
          {
            ...originPatch,
            text: {
              ...text,
              ...(hasOwnKey(updates, 'labelColumn')
                ? { labelColumn: updates.labelColumn }
                : {}),
              ...(hasOwnKey(updates, 'valueColumn')
                ? { valueColumn: updates.valueColumn }
                : {}),
              ...(hasOwnKey(updates, 'categoryColumn')
                ? { categoryColumn: updates.categoryColumn }
                : {}),
              ...(nextTextClassification
                ? { classification: nextTextClassification }
                : {}),
              ...(hasOwnKey(updates, 'labelColumn') &&
              updates.labelColumn === undefined
                ? {
                    secondaryLabels: {
                      ...text.secondaryLabels,
                      enabled: false,
                      labelColumn: undefined
                    }
                  }
                : secondaryLabelColumnProvided
                  ? {
                      secondaryLabels: {
                        ...text.secondaryLabels,
                        enabled:
                          text.secondaryLabels.enabled &&
                          Boolean(nextSecondaryLabelColumn),
                        labelColumn: nextSecondaryLabelColumn
                      }
                    }
                  : {})
            },
            mapping: { ...visualization.mapping, ...updates }
          },
          (nextVisualization) => {
            syncLegendSubtitleAfterMappingChange(
              primitive,
              previousVisualization,
              nextVisualization
            );
            ensurePrimitiveClassificationDefaults(primitive, nextVisualization);
          }
        );
      }
    }
  }

  function applyPrimitiveStrokeMappingUpdate(
    primitive: StrokeClassifiablePrimitive,
    updates: MappingUpdates,
    options?: VisualizationWriteOptions
  ): void {
    const visualization = resolveWriteVisualization(options);
    if (!visualization) {
      return;
    }
    const originPatch = buildOriginPatch(visualization, options);

    switch (primitive) {
      case PrimitiveFilterType.POLYGON: {
        const polygon = getPolygonPrimitive(visualization);
        if (!polygon) {
          return;
        }

        const previousStrokeCategoryColumn =
          polygon.strokeCategoryColumn ??
          polygon.categoryColumn ??
          visualization.mapping.categoryColumn;
        const strokeCategoryColumnChanged =
          hasOwnKey(updates, 'categoryColumn') &&
          updates.categoryColumn !== previousStrokeCategoryColumn;
        const nextStrokeClassification =
          strokeCategoryColumnChanged && polygon.strokeClassification
            ? {
                ...polygon.strokeClassification,
                labels: [],
                disabledLabels: undefined
              }
            : polygon.strokeClassification;

        updateVisualization(
          {
            ...originPatch,
            polygon: {
              ...polygon,
              ...(hasOwnKey(updates, 'valueColumn')
                ? { strokeValueColumn: updates.valueColumn }
                : {}),
              ...(hasOwnKey(updates, 'categoryColumn')
                ? { strokeCategoryColumn: updates.categoryColumn }
                : {}),
              ...(nextStrokeClassification
                ? { strokeClassification: nextStrokeClassification }
                : {})
            }
          },
          (nextVisualization) => {
            ensurePrimitiveStrokeClassificationDefaults(
              primitive,
              nextVisualization
            );
          }
        );
        return;
      }

      case PrimitiveFilterType.POINT:
      default: {
        const symbol = getSymbolPrimitive(visualization);
        if (!symbol) {
          return;
        }

        const previousStrokeCategoryColumn =
          symbol.strokeCategoryColumn ??
          symbol.categoryColumn ??
          visualization.mapping.categoryColumn;
        const strokeCategoryColumnChanged =
          hasOwnKey(updates, 'categoryColumn') &&
          updates.categoryColumn !== previousStrokeCategoryColumn;
        const nextStrokeClassification =
          strokeCategoryColumnChanged && symbol.strokeClassification
            ? {
                ...symbol.strokeClassification,
                labels: undefined,
                disabledLabels: undefined
              }
            : symbol.strokeClassification;

        updateVisualization(
          {
            ...originPatch,
            symbol: {
              ...symbol,
              ...(hasOwnKey(updates, 'valueColumn')
                ? { strokeValueColumn: updates.valueColumn }
                : {}),
              ...(hasOwnKey(updates, 'categoryColumn')
                ? { strokeCategoryColumn: updates.categoryColumn }
                : {}),
              ...(nextStrokeClassification
                ? { strokeClassification: nextStrokeClassification }
                : {})
            }
          },
          (nextVisualization) => {
            ensurePrimitiveStrokeClassificationDefaults(
              primitive,
              nextVisualization
            );
          }
        );
      }
    }
  }

  return {
    applyPrimitiveMappingUpdate,
    applyPrimitiveStrokeMappingUpdate,
    applySymbolFillMappingUpdate,
    buildNextPrimitiveFilters,
    ensureAutoColumns,
    ensureLineThicknessClassificationDefaults,
    ensurePrimitiveClassificationDefaults,
    ensurePrimitiveStrokeAutoColumns,
    ensurePrimitiveStrokeClassificationDefaults,
    ensureSymbolFillAutoColumns,
    ensureSymbolFillClassificationDefaults,
    getPrimitiveStrokeCategoryColumn,
    getPrimitiveStrokeClassification,
    getPrimitiveStrokeValueColumn,
    invertPrimitivePalette,
    invertPrimitiveStrokePalette,
    invertSymbolFillPalette,
    updateLineThicknessClassificationState: updateLineThicknessClassification,
    updateSymbolFillClassificationState,
    usesBreakClassification,
    usesCategoricalClassification,
    usesLineThicknessBreakClassification,
    usesStrokeBreakClassification,
    usesStrokeCategoricalClassification,
    usesSymbolFillBreakClassification,
    usesSymbolFillCategoricalClassification
  };
}
