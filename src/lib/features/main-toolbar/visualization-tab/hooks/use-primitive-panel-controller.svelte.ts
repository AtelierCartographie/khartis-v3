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
  type TextBackgroundConfig,
  type TextPrimitiveConfig,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  findPaletteById,
  PALETTE_TYPE,
  type PaletteType
} from '$lib/features/commons/components/palette-popover/palette.constants';
import {
  findPreferredNumericColumn,
  findPreferredTextColumn,
  isHiddenTechnicalColumnName,
  isIdLikeColumnName
} from '$lib/features/commons/utils/visualization-columns.utils';
import { joinLegendSubtitleParts } from '$lib/features/commons/utils/legend-subtitle.utils';
import {
  getLegendState,
  legendActions
} from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
import {
  ColorMode,
  FillMode,
  StrokeMode,
  SymbolMode,
  ThicknessMode
} from '../../constants';
import type { FieldSelectionItem } from './use-field-selection.svelte';

export const CORE_PRIMITIVES = [
  PrimitiveFilterType.POINT,
  PrimitiveFilterType.LINE,
  PrimitiveFilterType.POLYGON
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
type VisualizationWriteOptions = { visualization?: VisualizationConfig };
type TextBackgroundUpdater = (
  background: TextPrimitiveConfig['background']
) => Partial<TextPrimitiveConfig['background']>;

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
    updates: Partial<ClassificationConfig>
  ) => void;
  updateTextPrimitive: (updates: Partial<TextPrimitiveConfig>) => void;
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
    classes: existing?.classes ?? 5,
    ...existing,
    ...updates
  };
}

export function usePrimitivePanelController({
  getDataFields,
  getVisualization,
  updatePrimitiveClassification,
  updateLineThicknessClassification,
  updatePrimitiveStrokeClassification,
  updateTextPrimitive,
  updateVisualization
}: PrimitivePanelControllerOptions) {
  function resolveWriteVisualization(
    options?: VisualizationWriteOptions
  ): VisualizationConfig | undefined {
    return options?.visualization ?? getVisualization();
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

  function resolveYearColumnName(name: string): number | undefined {
    const normalized = name.trim().replace(/^_+/, '');
    if (!/^\d{4}$/.test(normalized)) {
      return undefined;
    }

    const year = Number(normalized);
    return year >= 1800 && year <= 2200 ? year : undefined;
  }

  function findLatestYearNumericColumn(
    reservedColumns: Array<string | undefined>
  ): string | undefined {
    const reserved = new Set(
      reservedColumns.filter((name): name is string => Boolean(name))
    );
    const latestYearColumn = getDataFields().reduce<
      { name: string; year: number } | undefined
    >((latest, column) => {
      const name = column.text;
      if (
        !name ||
        column.type !== 'number' ||
        reserved.has(name) ||
        isHiddenTechnicalColumnName(name)
      ) {
        return latest;
      }

      const year = resolveYearColumnName(name);
      if (year === undefined) {
        return latest;
      }

      return latest && latest.year >= year ? latest : { name, year };
    }, undefined);

    return latestYearColumn?.name;
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
    const symbol = getSymbolPrimitive(visualization);
    if (!symbol) {
      return;
    }

    updateVisualization({
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
    const classification = getSymbolFillClassification(getVisualization());
    const colors = classification?.colors;
    if (!classification || !colors?.length) {
      return;
    }

    updateSymbolFillClassificationState({
      colors: [...colors].reverse(),
      inverted: !(classification.inverted ?? false)
    });
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

  function getTextBackgroundConfig(
    visualization: VisualizationConfig | null | undefined
  ): TextBackgroundConfig | undefined {
    return getTextPrimitive(visualization)?.background;
  }

  function usesTextBackgroundBreakClassification(
    visualization: VisualizationConfig | null | undefined
  ): boolean {
    return (
      getTextBackgroundConfig(visualization)?.fillMode === FillMode.CLASSES
    );
  }

  function usesTextBackgroundCategoricalClassification(
    visualization: VisualizationConfig | null | undefined
  ): boolean {
    return (
      getTextBackgroundConfig(visualization)?.fillMode === FillMode.CATEGORIES
    );
  }

  function usesTextBackgroundStrokeBreakClassification(
    visualization: VisualizationConfig | null | undefined
  ): boolean {
    return (
      getTextBackgroundConfig(visualization)?.strokeMode === StrokeMode.CLASSES
    );
  }

  function usesTextBackgroundStrokeCategoricalClassification(
    visualization: VisualizationConfig | null | undefined
  ): boolean {
    return (
      getTextBackgroundConfig(visualization)?.strokeMode ===
      StrokeMode.CATEGORIES
    );
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
      }
    });
  }

  function invertPrimitivePalette(primitive: ClassifiablePrimitive): void {
    const classification = getPrimitiveClassification(
      getVisualization(),
      primitive
    );
    if (!classification?.colors?.length) {
      return;
    }

    updatePrimitiveClassification(primitive, {
      colors: [...classification.colors].reverse(),
      inverted: !(classification.inverted ?? false)
    });
  }

  function updateLineThicknessClassificationState(
    updates: Partial<ClassificationConfig>,
    options?: ClassificationUpdateOptions
  ): void {
    updateLineThicknessClassification(updates, options);
  }

  function invertPrimitiveStrokePalette(
    primitive: StrokeClassifiablePrimitive
  ): void {
    const classification = getPrimitiveStrokeClassification(
      getVisualization(),
      primitive
    );
    if (!classification?.colors?.length) {
      return;
    }

    updatePrimitiveStrokeClassification(primitive, {
      colors: [...classification.colors].reverse(),
      inverted: !(classification.inverted ?? false)
    });
  }

  function updateTextBackground(updater: TextBackgroundUpdater): void {
    const text = getTextPrimitive(getVisualization());
    if (!text) {
      return;
    }

    updateTextPrimitive({
      background: {
        ...text.background,
        ...updater(text.background)
      }
    });
  }

  function updateTextBackgroundFromVisualization(
    updater: TextBackgroundUpdater,
    options?: VisualizationWriteOptions
  ): void {
    const visualization = resolveWriteVisualization(options);
    const text = getTextPrimitive(visualization);
    if (!text) {
      return;
    }

    updateVisualization({
      text: {
        ...text,
        background: {
          ...text.background,
          ...updater(text.background)
        }
      }
    });
  }

  function updateTextBackgroundClassificationState(
    updates: Partial<ClassificationConfig>,
    options?: VisualizationWriteOptions
  ): void {
    updateTextBackgroundFromVisualization(
      (background) => ({
        classification: mergeClassificationConfig(
          background.classification,
          updates
        )
      }),
      options
    );
  }

  function updateTextBackgroundStrokeClassificationState(
    updates: Partial<ClassificationConfig>,
    options?: VisualizationWriteOptions
  ): void {
    updateTextBackgroundFromVisualization(
      (background) => ({
        strokeClassification: mergeClassificationConfig(
          background.strokeClassification,
          updates
        )
      }),
      options
    );
  }

  function applyTextBackgroundMappingUpdate(
    updates: MappingUpdates,
    options?: VisualizationWriteOptions
  ): void {
    updateTextBackgroundFromVisualization(
      () => ({
        ...(hasOwnKey(updates, 'valueColumn')
          ? { valueColumn: updates.valueColumn }
          : {}),
        ...(hasOwnKey(updates, 'categoryColumn')
          ? { categoryColumn: updates.categoryColumn }
          : {})
      }),
      options
    );
  }

  function applyTextBackgroundStrokeMappingUpdate(
    updates: MappingUpdates,
    options?: VisualizationWriteOptions
  ): void {
    updateTextBackgroundFromVisualization(
      () => ({
        ...(hasOwnKey(updates, 'valueColumn')
          ? { strokeValueColumn: updates.valueColumn }
          : {}),
        ...(hasOwnKey(updates, 'categoryColumn')
          ? { strokeCategoryColumn: updates.categoryColumn }
          : {})
      }),
      options
    );
  }

  function invertTextBackgroundPalette(): void {
    const classification =
      getTextPrimitive(getVisualization())?.background.classification;
    const colors = classification?.colors;
    if (!classification || !colors?.length) {
      return;
    }

    updateTextBackgroundClassificationState({
      colors: [...colors].reverse(),
      inverted: !(classification.inverted ?? false)
    });
  }

  function invertTextBackgroundStrokePalette(): void {
    const classification =
      getTextPrimitive(getVisualization())?.background.strokeClassification;
    const colors = classification?.colors;
    if (!classification || !colors?.length) {
      return;
    }

    updateTextBackgroundStrokeClassificationState({
      colors: [...colors].reverse(),
      inverted: !(classification.inverted ?? false)
    });
  }

  function ensurePrimitiveClassificationDefaults(
    primitive: ClassifiablePrimitive,
    visualization: VisualizationConfig
  ): void {
    const classification = getPrimitiveClassification(visualization, primitive);
    const currentPaletteType = resolveClassificationPaletteType(classification);
    const line = getLinePrimitive(visualization);

    const usesBreaks =
      primitive === PrimitiveFilterType.LINE
        ? line?.colorMode === ColorMode.CLASSES
        : usesBreakClassification(visualization, primitive);

    if (usesBreaks) {
      const hasIncompatiblePalette =
        currentPaletteType === PALETTE_TYPE.QUALITATIVE;
      const resetPaletteFields = hasIncompatiblePalette
        ? { paletteId: undefined, colors: [] }
        : {};
      if (!classification?.method || !classification?.numClasses) {
        updatePrimitiveClassification(primitive, {
          method: ClassificationMethod.KMEANS,
          classes: 5,
          numClasses: 5,
          ...resetPaletteFields
        });
      } else if (hasIncompatiblePalette) {
        updatePrimitiveClassification(primitive, resetPaletteFields);
      }
      return;
    }

    const usesCategories =
      primitive === PrimitiveFilterType.LINE
        ? line?.colorMode === ColorMode.CATEGORIES
        : usesCategoricalClassification(visualization, primitive);

    if (usesCategories) {
      const hasIncompatiblePalette =
        currentPaletteType !== undefined &&
        currentPaletteType !== PALETTE_TYPE.QUALITATIVE;
      const needsColors = !classification?.colors?.length;
      const needsLabels = classification?.labels === undefined;

      if (hasIncompatiblePalette || needsColors || needsLabels) {
        updatePrimitiveClassification(
          primitive,
          {
            colors: needsColors
              ? [...DEFAULT_CATEGORICAL_COLORS]
              : (classification?.colors ?? []),
            inverted: classification?.inverted ?? false,
            ...(needsLabels ? { labels: [] } : {}),
            ...(hasIncompatiblePalette ? { paletteId: undefined } : {})
          },
          { preserveOrigin: true }
        );
      }
    }
  }

  function ensureLineThicknessClassificationDefaults(
    visualization: VisualizationConfig
  ): void {
    if (!usesLineThicknessBreakClassification(visualization)) {
      return;
    }

    const classification = getLineThicknessClassification(visualization);
    const currentPaletteType = resolveClassificationPaletteType(classification);
    const hasIncompatiblePalette =
      currentPaletteType === PALETTE_TYPE.QUALITATIVE;
    const resetPaletteFields = hasIncompatiblePalette
      ? { paletteId: undefined, colors: [] }
      : {};

    if (!classification?.method || !classification?.numClasses) {
      updateLineThicknessClassification({
        method: ClassificationMethod.KMEANS,
        classes: 5,
        numClasses: 5,
        ...resetPaletteFields
      });
      return;
    }

    if (hasIncompatiblePalette) {
      updateLineThicknessClassification(resetPaletteFields);
    }
  }

  function ensureAutoColumns(
    primitive: ClassifiablePrimitive,
    visualization: VisualizationConfig
  ): void {
    const valueColumn = getPrimitiveValueColumn(visualization, primitive);
    const categoryColumn = getPrimitiveCategoryColumn(visualization, primitive);
    const sizeColumn = getPrimitiveSizeColumn(visualization, primitive);

    if (usesBreakClassification(visualization, primitive) && !valueColumn) {
      const reservedColumns = getReservedColumnsForValue(
        visualization,
        primitive
      );
      const autoValueColumn =
        findAutoValueColumn(reservedColumns) ??
        findFallbackNumericColumn(reservedColumns);
      if (autoValueColumn) {
        applyPrimitiveMappingUpdate(
          primitive,
          {
            valueColumn: autoValueColumn
          },
          { visualization }
        );
      }
    }

    if (
      usesCategoricalClassification(visualization, primitive) &&
      !categoryColumn
    ) {
      const autoCategoryColumn = findAutoCategoryColumn(
        getReservedColumnsForCategory(visualization, primitive)
      );
      if (autoCategoryColumn) {
        applyPrimitiveMappingUpdate(
          primitive,
          {
            categoryColumn: autoCategoryColumn
          },
          { visualization }
        );
      }
    }

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
        const latestYearColumn = findLatestYearNumericColumn([
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
            { visualization }
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
            { visualization }
          );
        }
      }
    }
  }

  function ensurePrimitiveStrokeClassificationDefaults(
    primitive: StrokeClassifiablePrimitive,
    visualization: VisualizationConfig
  ): void {
    const classification = getPrimitiveStrokeClassification(
      visualization,
      primitive
    );
    const currentPaletteType = resolveClassificationPaletteType(classification);

    if (usesStrokeBreakClassification(visualization, primitive)) {
      const hasIncompatiblePalette =
        currentPaletteType === PALETTE_TYPE.QUALITATIVE;
      const resetPaletteFields = hasIncompatiblePalette
        ? { paletteId: undefined, colors: [] }
        : {};
      if (!classification?.method || !classification?.numClasses) {
        updatePrimitiveStrokeClassification(primitive, {
          method: ClassificationMethod.KMEANS,
          classes: 5,
          numClasses: 5,
          ...resetPaletteFields
        });
      } else if (hasIncompatiblePalette) {
        updatePrimitiveStrokeClassification(primitive, resetPaletteFields);
      }
      return;
    }

    if (usesStrokeCategoricalClassification(visualization, primitive)) {
      const hasIncompatiblePalette =
        currentPaletteType !== undefined &&
        currentPaletteType !== PALETTE_TYPE.QUALITATIVE;
      const needsColors = !classification?.colors?.length;
      const needsLabels = classification?.labels === undefined;

      if (hasIncompatiblePalette || needsColors || needsLabels) {
        updatePrimitiveStrokeClassification(primitive, {
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

  function ensurePrimitiveStrokeAutoColumns(
    primitive: StrokeClassifiablePrimitive,
    visualization: VisualizationConfig
  ): void {
    const strokeValueColumn = getPrimitiveStrokeValueColumn(
      visualization,
      primitive
    );
    const strokeCategoryColumn = getPrimitiveStrokeCategoryColumn(
      visualization,
      primitive
    );

    if (
      usesStrokeBreakClassification(visualization, primitive) &&
      !strokeValueColumn
    ) {
      const reservedColumns = getReservedColumnsForValue(
        visualization,
        primitive
      );
      const nextValueColumn =
        (primitive === PrimitiveFilterType.POINT
          ? getSymbolFillValueColumn(visualization)
          : undefined) ??
        getPrimitiveValueColumn(visualization, primitive) ??
        findAutoValueColumn(reservedColumns) ??
        findFallbackNumericColumn(reservedColumns);
      if (nextValueColumn) {
        applyPrimitiveStrokeMappingUpdate(
          primitive,
          {
            valueColumn: nextValueColumn
          },
          { visualization }
        );
      }
    }

    if (
      usesStrokeCategoricalClassification(visualization, primitive) &&
      !strokeCategoryColumn
    ) {
      const nextCategoryColumn =
        (primitive === PrimitiveFilterType.POINT
          ? getSymbolFillCategoryColumn(visualization)
          : undefined) ??
        getPrimitiveCategoryColumn(visualization, primitive) ??
        findAutoCategoryColumn(
          getReservedColumnsForCategory(visualization, primitive)
        );
      if (nextCategoryColumn) {
        applyPrimitiveStrokeMappingUpdate(
          primitive,
          {
            categoryColumn: nextCategoryColumn
          },
          { visualization }
        );
      }
    }
  }

  function ensureSymbolFillClassificationDefaults(
    visualization: VisualizationConfig
  ): void {
    const classification = getSymbolFillClassification(visualization);
    const currentPaletteType = resolveClassificationPaletteType(classification);

    if (usesSymbolFillBreakClassification(visualization)) {
      const hasIncompatiblePalette =
        currentPaletteType === PALETTE_TYPE.QUALITATIVE;
      const resetPaletteFields = hasIncompatiblePalette
        ? { paletteId: undefined, colors: [] }
        : {};
      if (!classification?.method || !classification?.numClasses) {
        updateSymbolFillClassificationState(
          {
            method: ClassificationMethod.KMEANS,
            classes: 5,
            numClasses: 5,
            ...resetPaletteFields
          },
          { visualization }
        );
      } else if (hasIncompatiblePalette) {
        updateSymbolFillClassificationState(resetPaletteFields, {
          visualization
        });
      }
      return;
    }

    if (usesSymbolFillCategoricalClassification(visualization)) {
      const hasIncompatiblePalette =
        currentPaletteType !== undefined &&
        currentPaletteType !== PALETTE_TYPE.QUALITATIVE;
      const needsColors = !classification?.colors?.length;
      const needsLabels = classification?.labels === undefined;

      if (hasIncompatiblePalette || needsColors || needsLabels) {
        updateSymbolFillClassificationState(
          {
            colors: needsColors
              ? [...DEFAULT_CATEGORICAL_COLORS]
              : (classification?.colors ?? []),
            inverted: classification?.inverted ?? false,
            ...(needsLabels ? { labels: [] } : {}),
            ...(hasIncompatiblePalette ? { paletteId: undefined } : {})
          },
          { visualization }
        );
      }
    }
  }

  function ensureSymbolFillAutoColumns(
    visualization: VisualizationConfig
  ): void {
    if (
      usesSymbolFillBreakClassification(visualization) &&
      !getSymbolFillValueColumn(visualization)
    ) {
      const symbol = getSymbolPrimitive(visualization);
      const reservedColumns =
        getReservedColumnsForSymbolFillValue(visualization);
      const nextValueColumn =
        symbol?.valueColumn ??
        symbol?.sizeColumn ??
        findAutoValueColumn(reservedColumns) ??
        findFallbackNumericColumn(reservedColumns);
      if (nextValueColumn) {
        applySymbolFillMappingUpdate(
          { valueColumn: nextValueColumn },
          { visualization }
        );
      }
    }

    if (
      usesSymbolFillCategoricalClassification(visualization) &&
      !getSymbolFillCategoryColumn(visualization)
    ) {
      const symbol = getSymbolPrimitive(visualization);
      const nextCategoryColumn =
        symbol?.categoryColumn ??
        findAutoCategoryColumn(
          getReservedColumnsForSymbolFillCategory(visualization)
        );
      if (nextCategoryColumn) {
        applySymbolFillMappingUpdate(
          {
            categoryColumn: nextCategoryColumn
          },
          { visualization }
        );
      }
    }
  }

  function ensureTextBackgroundClassificationDefaults(
    visualization: VisualizationConfig
  ): void {
    const background = getTextBackgroundConfig(visualization);
    const classification = background?.classification;
    const currentPaletteType = resolveClassificationPaletteType(classification);

    if (usesTextBackgroundBreakClassification(visualization)) {
      const hasIncompatiblePalette =
        currentPaletteType === PALETTE_TYPE.QUALITATIVE;
      const resetPaletteFields = hasIncompatiblePalette
        ? { paletteId: undefined, colors: [] }
        : {};
      if (!classification?.method || !classification?.numClasses) {
        updateTextBackgroundClassificationState(
          {
            method: ClassificationMethod.KMEANS,
            classes: 5,
            numClasses: 5,
            ...resetPaletteFields
          },
          { visualization }
        );
      } else if (hasIncompatiblePalette) {
        updateTextBackgroundClassificationState(resetPaletteFields, {
          visualization
        });
      }
      return;
    }

    if (usesTextBackgroundCategoricalClassification(visualization)) {
      const hasIncompatiblePalette =
        currentPaletteType !== undefined &&
        currentPaletteType !== PALETTE_TYPE.QUALITATIVE;
      const needsColors = !classification?.colors?.length;
      const needsLabels = classification?.labels === undefined;

      if (hasIncompatiblePalette || needsColors || needsLabels) {
        updateTextBackgroundClassificationState(
          {
            colors: needsColors
              ? [...DEFAULT_CATEGORICAL_COLORS]
              : (classification?.colors ?? []),
            inverted: classification?.inverted ?? false,
            ...(needsLabels ? { labels: [] } : {}),
            ...(hasIncompatiblePalette ? { paletteId: undefined } : {})
          },
          { visualization }
        );
      }
    }
  }

  function ensureTextBackgroundStrokeClassificationDefaults(
    visualization: VisualizationConfig
  ): void {
    const background = getTextBackgroundConfig(visualization);
    const classification = background?.strokeClassification;
    const currentPaletteType = resolveClassificationPaletteType(classification);

    if (usesTextBackgroundStrokeBreakClassification(visualization)) {
      const hasIncompatiblePalette =
        currentPaletteType === PALETTE_TYPE.QUALITATIVE;
      const resetPaletteFields = hasIncompatiblePalette
        ? { paletteId: undefined, colors: [] }
        : {};
      if (!classification?.method || !classification?.numClasses) {
        updateTextBackgroundStrokeClassificationState(
          {
            method: ClassificationMethod.KMEANS,
            classes: 5,
            numClasses: 5,
            ...resetPaletteFields
          },
          { visualization }
        );
      } else if (hasIncompatiblePalette) {
        updateTextBackgroundStrokeClassificationState(resetPaletteFields, {
          visualization
        });
      }
      return;
    }

    if (usesTextBackgroundStrokeCategoricalClassification(visualization)) {
      const hasIncompatiblePalette =
        currentPaletteType !== undefined &&
        currentPaletteType !== PALETTE_TYPE.QUALITATIVE;
      const needsColors = !classification?.colors?.length;
      const needsLabels = classification?.labels === undefined;

      if (hasIncompatiblePalette || needsColors || needsLabels) {
        updateTextBackgroundStrokeClassificationState(
          {
            colors: needsColors
              ? [...DEFAULT_CATEGORICAL_COLORS]
              : (classification?.colors ?? []),
            inverted: classification?.inverted ?? false,
            ...(needsLabels ? { labels: [] } : {}),
            ...(hasIncompatiblePalette ? { paletteId: undefined } : {})
          },
          { visualization }
        );
      }
    }
  }

  function ensureTextBackgroundAutoColumns(
    visualization: VisualizationConfig
  ): void {
    const background = getTextBackgroundConfig(visualization);
    if (!background) {
      return;
    }

    if (
      usesTextBackgroundBreakClassification(visualization) &&
      !background.valueColumn
    ) {
      const reservedColumns = getReservedColumnsForValue(
        visualization,
        PrimitiveFilterType.TEXT
      );
      const nextValueColumn =
        getTextPrimitive(visualization)?.valueColumn ??
        findAutoValueColumn(reservedColumns) ??
        findFallbackNumericColumn(reservedColumns);
      if (nextValueColumn) {
        applyTextBackgroundMappingUpdate(
          { valueColumn: nextValueColumn },
          { visualization }
        );
      }
    }

    if (
      usesTextBackgroundCategoricalClassification(visualization) &&
      !background.categoryColumn
    ) {
      const nextCategoryColumn =
        getTextPrimitive(visualization)?.categoryColumn ??
        findAutoCategoryColumn(
          getReservedColumnsForCategory(visualization, PrimitiveFilterType.TEXT)
        );
      if (nextCategoryColumn) {
        applyTextBackgroundMappingUpdate(
          {
            categoryColumn: nextCategoryColumn
          },
          { visualization }
        );
      }
    }
  }

  function ensureTextBackgroundStrokeAutoColumns(
    visualization: VisualizationConfig
  ): void {
    const background = getTextBackgroundConfig(visualization);
    if (!background) {
      return;
    }

    if (
      usesTextBackgroundStrokeBreakClassification(visualization) &&
      !background.strokeValueColumn
    ) {
      const reservedColumns = getReservedColumnsForValue(
        visualization,
        PrimitiveFilterType.TEXT
      );
      const nextValueColumn =
        background.valueColumn ??
        getTextPrimitive(visualization)?.valueColumn ??
        findAutoValueColumn(reservedColumns) ??
        findFallbackNumericColumn(reservedColumns);
      if (nextValueColumn) {
        applyTextBackgroundStrokeMappingUpdate(
          {
            valueColumn: nextValueColumn
          },
          { visualization }
        );
      }
    }

    if (
      usesTextBackgroundStrokeCategoricalClassification(visualization) &&
      !background.strokeCategoryColumn
    ) {
      const nextCategoryColumn =
        background.categoryColumn ??
        getTextPrimitive(visualization)?.categoryColumn ??
        findAutoCategoryColumn(
          getReservedColumnsForCategory(visualization, PrimitiveFilterType.TEXT)
        );
      if (nextCategoryColumn) {
        applyTextBackgroundStrokeMappingUpdate(
          {
            categoryColumn: nextCategoryColumn
          },
          { visualization }
        );
      }
    }
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

    switch (primitive) {
      case PrimitiveFilterType.POLYGON: {
        const polygon = getPolygonPrimitive(visualization);
        if (!polygon) {
          return;
        }

        updateVisualization(
          {
            polygon: {
              ...polygon,
              ...(hasOwnKey(updates, 'valueColumn')
                ? { valueColumn: updates.valueColumn }
                : {}),
              ...(hasOwnKey(updates, 'categoryColumn')
                ? { categoryColumn: updates.categoryColumn }
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
        const shouldResetStrokeLabels =
          categoryColumnChanged &&
          (!symbol.strokeCategoryColumn ||
            symbol.strokeCategoryColumn === previousCategoryColumn);
        const nextSymbolClassification = categoryColumnChanged
          ? {
              ...(symbol.classification ?? {
                method: ClassificationMethod.KMEANS,
                classes: 5
              }),
              labels: [],
              disabledLabels: undefined,
              categoryShapes: undefined
            }
          : symbol.classification;
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
        const nextRootPointClassification =
          categoryColumnChanged && rootPointClassificationBase
            ? {
                ...rootPointClassificationBase,
                labels: [],
                disabledLabels: undefined,
                categoryShapes: undefined
              }
            : undefined;

        updateVisualization(
          {
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
        const nextLineClassification =
          categoryColumnChanged && line.classification
            ? {
                ...line.classification,
                labels: [],
                disabledLabels: undefined
              }
            : line.classification;
        const rootLineClassificationBase =
          visualization.lineClassification ?? line.classification;
        const nextRootLineClassification =
          categoryColumnChanged && rootLineClassificationBase
            ? {
                ...rootLineClassificationBase,
                labels: [],
                disabledLabels: undefined
              }
            : undefined;

        updateVisualization(
          {
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

        const secondaryLabelColumnProvided = hasOwnKey(
          updates,
          'secondaryLabelColumn'
        );
        const nextSecondaryLabelColumn = secondaryLabelColumnProvided
          ? updates.secondaryLabelColumn
          : text.secondaryLabels.labelColumn;

        updateVisualization(
          {
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

    switch (primitive) {
      case PrimitiveFilterType.POLYGON: {
        const polygon = getPolygonPrimitive(visualization);
        if (!polygon) {
          return;
        }

        updateVisualization(
          {
            polygon: {
              ...polygon,
              ...(hasOwnKey(updates, 'valueColumn')
                ? { strokeValueColumn: updates.valueColumn }
                : {}),
              ...(hasOwnKey(updates, 'categoryColumn')
                ? { strokeCategoryColumn: updates.categoryColumn }
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
    applyTextBackgroundMappingUpdate,
    applyTextBackgroundStrokeMappingUpdate,
    buildNextPrimitiveFilters,
    ensureAutoColumns,
    ensureLineThicknessClassificationDefaults,
    ensurePrimitiveClassificationDefaults,
    ensurePrimitiveStrokeAutoColumns,
    ensurePrimitiveStrokeClassificationDefaults,
    ensureSymbolFillAutoColumns,
    ensureSymbolFillClassificationDefaults,
    ensureTextBackgroundAutoColumns,
    ensureTextBackgroundClassificationDefaults,
    ensureTextBackgroundStrokeAutoColumns,
    ensureTextBackgroundStrokeClassificationDefaults,
    getPrimitiveStrokeCategoryColumn,
    getPrimitiveStrokeClassification,
    getPrimitiveStrokeValueColumn,
    getTextBackgroundConfig,
    invertPrimitivePalette,
    invertPrimitiveStrokePalette,
    invertSymbolFillPalette,
    invertTextBackgroundPalette,
    invertTextBackgroundStrokePalette,
    updateSymbolFillClassificationState,
    updateLineThicknessClassificationState,
    updateTextBackground,
    updateTextBackgroundClassificationState,
    updateTextBackgroundStrokeClassificationState,
    usesBreakClassification,
    usesCategoricalClassification,
    usesLineThicknessBreakClassification,
    usesStrokeBreakClassification,
    usesStrokeCategoricalClassification,
    usesSymbolFillBreakClassification,
    usesSymbolFillCategoricalClassification,
    usesTextBackgroundBreakClassification,
    usesTextBackgroundCategoricalClassification,
    usesTextBackgroundStrokeBreakClassification,
    usesTextBackgroundStrokeCategoricalClassification
  };
}
