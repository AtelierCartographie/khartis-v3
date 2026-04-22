import {
  DEFAULT_CATEGORICAL_COLORS,
  ClassificationMethod,
  getLinePrimitive,
  getPolygonPrimitive,
  getPrimitiveCategoryColumn,
  getPrimitiveClassification,
  getPrimitiveSizeColumn,
  getPrimitiveValueColumn,
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
  getLegendState,
  legendActions
} from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
import {
  ColorMode,
  FillMode,
  StrokeMode,
  SymbolMode,
  ThicknessMode
} from '../constants';
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
    method: existing?.method ?? ClassificationMethod.JENKS,
    classes: existing?.classes ?? 5,
    ...existing,
    ...updates
  };
}

export function usePrimitivePanelController({
  getDataFields,
  getVisualization,
  updatePrimitiveClassification,
  updatePrimitiveStrokeClassification,
  updateTextPrimitive,
  updateVisualization
}: PrimitivePanelControllerOptions) {
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
    const reserved = new Set(
      reservedColumns.filter((name): name is string => Boolean(name))
    );
    const isIdLikeColumn = (name: string): boolean =>
      /^(ogc_fid|fid|id|gid|objectid|oid|__id__|__feature_id__)$/i.test(
        name.trim()
      );

    return getDataFields().find(
      (item) =>
        item.type === 'number' &&
        !reserved.has(item.text) &&
        !isIdLikeColumn(item.text)
    )?.text;
  }

  function findAutoCategoryColumn(
    reservedColumns: Array<string | undefined>
  ): string | undefined {
    const reserved = new Set(
      reservedColumns.filter((name): name is string => Boolean(name))
    );

    return getDataFields().find(
      (item) => item.type === 'text' && !reserved.has(item.text)
    )?.text;
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
        const symbol = getSymbolPrimitive(visualization);
        return (
          symbol?.mode === SymbolMode.CATEGORIES ||
          symbol?.fillMode === FillMode.CATEGORIES
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
        const symbol = getSymbolPrimitive(visualization);
        return (
          symbol?.mode === SymbolMode.CLASSES ||
          symbol?.fillMode === FillMode.CLASSES
        );
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

  function updateTextBackgroundClassificationState(
    updates: Partial<ClassificationConfig>
  ): void {
    updateTextBackground((background) => ({
      classification: mergeClassificationConfig(
        background.classification,
        updates
      )
    }));
  }

  function updateTextBackgroundStrokeClassificationState(
    updates: Partial<ClassificationConfig>
  ): void {
    updateTextBackground((background) => ({
      strokeClassification: mergeClassificationConfig(
        background.strokeClassification,
        updates
      )
    }));
  }

  function applyTextBackgroundMappingUpdate(updates: MappingUpdates): void {
    updateTextBackground(() => ({
      ...(hasOwnKey(updates, 'valueColumn')
        ? { valueColumn: updates.valueColumn }
        : {}),
      ...(hasOwnKey(updates, 'categoryColumn')
        ? { categoryColumn: updates.categoryColumn }
        : {})
    }));
  }

  function applyTextBackgroundStrokeMappingUpdate(
    updates: MappingUpdates
  ): void {
    updateTextBackground(() => ({
      ...(hasOwnKey(updates, 'valueColumn')
        ? { strokeValueColumn: updates.valueColumn }
        : {}),
      ...(hasOwnKey(updates, 'categoryColumn')
        ? { strokeCategoryColumn: updates.categoryColumn }
        : {})
    }));
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

    if (usesBreakClassification(visualization, primitive)) {
      const hasIncompatiblePalette =
        currentPaletteType === PALETTE_TYPE.QUALITATIVE;
      const resetPaletteFields = hasIncompatiblePalette
        ? { paletteId: undefined, colors: [] }
        : {};
      if (!classification?.method || !classification?.numClasses) {
        updatePrimitiveClassification(primitive, {
          method: ClassificationMethod.JENKS,
          classes: 5,
          numClasses: 5,
          ...resetPaletteFields
        });
      } else if (hasIncompatiblePalette) {
        updatePrimitiveClassification(primitive, resetPaletteFields);
      }
      return;
    }

    if (usesCategoricalClassification(visualization, primitive)) {
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

  function ensureAutoColumns(
    primitive: ClassifiablePrimitive,
    visualization: VisualizationConfig
  ): void {
    const valueColumn = getPrimitiveValueColumn(visualization, primitive);
    const categoryColumn = getPrimitiveCategoryColumn(visualization, primitive);

    if (usesBreakClassification(visualization, primitive) && !valueColumn) {
      const autoValueColumn = findAutoValueColumn(
        getReservedColumnsForValue(visualization, primitive)
      );
      if (autoValueColumn) {
        applyPrimitiveMappingUpdate(primitive, {
          valueColumn: autoValueColumn
        });
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
        applyPrimitiveMappingUpdate(primitive, {
          categoryColumn: autoCategoryColumn
        });
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
          method: ClassificationMethod.JENKS,
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
      const nextValueColumn =
        getPrimitiveValueColumn(visualization, primitive) ??
        findAutoValueColumn(
          getReservedColumnsForValue(visualization, primitive)
        );
      if (nextValueColumn) {
        applyPrimitiveStrokeMappingUpdate(primitive, {
          valueColumn: nextValueColumn
        });
      }
    }

    if (
      usesStrokeCategoricalClassification(visualization, primitive) &&
      !strokeCategoryColumn
    ) {
      const nextCategoryColumn =
        getPrimitiveCategoryColumn(visualization, primitive) ??
        findAutoCategoryColumn(
          getReservedColumnsForCategory(visualization, primitive)
        );
      if (nextCategoryColumn) {
        applyPrimitiveStrokeMappingUpdate(primitive, {
          categoryColumn: nextCategoryColumn
        });
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
        updateTextBackgroundClassificationState({
          method: ClassificationMethod.JENKS,
          classes: 5,
          numClasses: 5,
          ...resetPaletteFields
        });
      } else if (hasIncompatiblePalette) {
        updateTextBackgroundClassificationState(resetPaletteFields);
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
        updateTextBackgroundClassificationState({
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
        updateTextBackgroundStrokeClassificationState({
          method: ClassificationMethod.JENKS,
          classes: 5,
          numClasses: 5,
          ...resetPaletteFields
        });
      } else if (hasIncompatiblePalette) {
        updateTextBackgroundStrokeClassificationState(resetPaletteFields);
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
        updateTextBackgroundStrokeClassificationState({
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
      const nextValueColumn =
        getTextPrimitive(visualization)?.valueColumn ??
        findAutoValueColumn(
          getReservedColumnsForValue(visualization, PrimitiveFilterType.TEXT)
        );
      if (nextValueColumn) {
        applyTextBackgroundMappingUpdate({ valueColumn: nextValueColumn });
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
        applyTextBackgroundMappingUpdate({
          categoryColumn: nextCategoryColumn
        });
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
      const nextValueColumn =
        background.valueColumn ??
        getTextPrimitive(visualization)?.valueColumn ??
        findAutoValueColumn(
          getReservedColumnsForValue(visualization, PrimitiveFilterType.TEXT)
        );
      if (nextValueColumn) {
        applyTextBackgroundStrokeMappingUpdate({
          valueColumn: nextValueColumn
        });
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
        applyTextBackgroundStrokeMappingUpdate({
          categoryColumn: nextCategoryColumn
        });
      }
    }
  }

  function getLegendSubtitleForPrimitive(
    visualization: VisualizationConfig,
    primitive: ClassifiablePrimitive
  ): string {
    switch (primitive) {
      case PrimitiveFilterType.POLYGON:
        return (
          getPrimitiveValueColumn(visualization, primitive) ??
          getPrimitiveCategoryColumn(visualization, primitive) ??
          ''
        );

      case PrimitiveFilterType.POINT:
        return (
          getPrimitiveValueColumn(visualization, primitive) ??
          getPrimitiveSizeColumn(visualization, primitive) ??
          getPrimitiveCategoryColumn(visualization, primitive) ??
          ''
        );

      case PrimitiveFilterType.LINE:
        return (
          getPrimitiveSizeColumn(visualization, primitive) ??
          getPrimitiveValueColumn(visualization, primitive) ??
          getPrimitiveCategoryColumn(visualization, primitive) ??
          ''
        );

      case PrimitiveFilterType.TEXT: {
        const text = getTextPrimitive(visualization);
        return (
          text?.valueColumn ?? text?.categoryColumn ?? text?.labelColumn ?? ''
        );
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
    updates: MappingUpdates
  ): void {
    const visualization = getVisualization();
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
                method: ClassificationMethod.JENKS,
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

        updateVisualization(
          {
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
    updates: MappingUpdates
  ): void {
    const visualization = getVisualization();
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
    applyTextBackgroundMappingUpdate,
    applyTextBackgroundStrokeMappingUpdate,
    buildNextPrimitiveFilters,
    ensureAutoColumns,
    ensurePrimitiveClassificationDefaults,
    ensurePrimitiveStrokeAutoColumns,
    ensurePrimitiveStrokeClassificationDefaults,
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
    invertTextBackgroundPalette,
    invertTextBackgroundStrokePalette,
    updateTextBackground,
    updateTextBackgroundClassificationState,
    updateTextBackgroundStrokeClassificationState,
    usesBreakClassification,
    usesCategoricalClassification,
    usesStrokeBreakClassification,
    usesStrokeCategoricalClassification,
    usesTextBackgroundBreakClassification,
    usesTextBackgroundCategoricalClassification,
    usesTextBackgroundStrokeBreakClassification,
    usesTextBackgroundStrokeCategoricalClassification
  };
}
