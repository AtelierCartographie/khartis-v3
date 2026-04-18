<script lang="ts">
  import { untrack } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    visualizationStore,
    ALL_PRIMITIVE_FILTERS,
    ClassificationMethod,
    DEFAULT_CATEGORICAL_COLORS,
    PrimitiveFilterType,
    resolveAllowedPrimitiveFilters,
    type VisualizationConfig,
    type VisualizationModes,
    type PrimitiveFilter,
    type MissingDataConfig,
    type ClassificationConfig,
    type VizDataFilter
  } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    applyPaletteInversion,
    generateColorsForBreaks
  } from '$lib/features/commons/services/classification.service';
  import {
    findPaletteById,
    generatePaletteColors
  } from './components/palette-popover/palette.constants';
  import { getColorBlindnessState } from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte';
  import {
    getLegendState,
    legendActions
  } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
  import {
    ColorMode,
    DEFAULT_COLORS,
    FillMode,
    ProportionalType,
    StrokeMode,
    SymbolMode,
    ThicknessMode,
    VISUALIZATION_DEFAULTS
  } from '../constants';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';

  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { Duck } from '$lib/features/duckdb';
  import { COLUMN_TYPE_GEOMETRY } from '$lib/features/commons/constants/data.constants';
  import { SettingsAdjust } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import LinesConfig from './components/lines-config.svelte';
  import PolygonsConfig from './components/polygons-config.svelte';
  import SymbolsConfig from './components/symbols-config.svelte';
  import TextsConfig from './components/texts-config.svelte';
  import { useComputeBreaks } from './use-compute-breaks.svelte';

  let selectedViz = $derived(visualizationStore.selectedVisualization);
  const { compute: computeBreaksForVisualization } = useComputeBreaks(
    () => selectedViz
  );

  function usesCategoricalClassification(
    visualization: VisualizationConfig | undefined
  ): boolean {
    if (!visualization?.modes) {
      return false;
    }

    return (
      visualization.modes.fill === FillMode.CATEGORIES ||
      visualization.modes.color === ColorMode.CATEGORIES ||
      visualization.modes.symbol === SymbolMode.CATEGORIES ||
      visualization.modes.stroke === StrokeMode.CATEGORIES
    );
  }

  function usesBreakClassification(
    visualization: VisualizationConfig | undefined
  ): boolean {
    if (!visualization?.modes) {
      return false;
    }

    return (
      visualization.modes.fill === FillMode.CLASSES ||
      visualization.modes.color === ColorMode.CLASSES ||
      visualization.modes.symbol === SymbolMode.CLASSES ||
      visualization.modes.stroke === StrokeMode.CLASSES ||
      visualization.modes.thickness === ThicknessMode.CLASSES
    );
  }

  const dataFieldItems = $derived.by(() => {
    const dataset = getSelectedDataset() ?? datasetsStore.selectedDataset;
    if (!dataset?.columns) return [];
    return dataset.columns
      .filter((col) => col.type !== COLUMN_TYPE_GEOMETRY)
      .map((col, id) => ({ id, text: col.name, type: col.type }));
  });

  const hasGeometry = $derived.by(() => {
    const dataset = getSelectedDataset() ?? datasetsStore.selectedDataset;
    if (!dataset?.columns) return false;
    return (
      Boolean(dataset.geometry) ||
      dataset.columns.some((col) => col.type === COLUMN_TYPE_GEOMETRY)
    );
  });

  function getSelectedDataset() {
    if (!selectedViz?.datasetId) {
      return null;
    }

    return (
      datasetsStore.datasets.find(
        (dataset) => dataset.id === selectedViz.datasetId
      ) ?? null
    );
  }

  const availablePrimitiveFilters = $derived.by(() => {
    const dataset = getSelectedDataset();
    if (!selectedViz || !dataset) {
      return ALL_PRIMITIVE_FILTERS;
    }

    return resolveAllowedPrimitiveFilters(selectedViz.type, dataset);
  });

  const showsSymbolsConfig = $derived(
    availablePrimitiveFilters.includes(PrimitiveFilterType.POINT)
  );
  const showsPolygonsConfig = $derived(
    availablePrimitiveFilters.includes(PrimitiveFilterType.POLYGON)
  );
  const showsLinesConfig = $derived(
    availablePrimitiveFilters.includes(PrimitiveFilterType.LINE)
  );

  function fetchCategoryLabels(
    vizId: string,
    column: string,
    tableName: string,
    useUntrack = false
  ): void {
    Duck.query(
      `SELECT DISTINCT "${column}" FROM "${tableName}" WHERE "${column}" IS NOT NULL ORDER BY "${column}"`,
      { format: 'array' }
    )
      .then((rows) => {
        const labels = (rows as Array<Record<string, unknown>>).map((row) =>
          String(row[column])
        );
        if (labels.length > 0) {
          if (useUntrack) {
            untrack(() =>
              visualizationStore.updateClassification(vizId, { labels })
            );
          } else {
            visualizationStore.updateClassification(vizId, { labels });
          }
        }
      })
      .catch((e) =>
        logger.warn(
          'Failed to fetch category labels',
          LogCategory.VISUALIZATION,
          e
        )
      );
  }

  function handleInvertPalette() {
    if (selectedViz?.id) {
      visualizationStore.invertPalette(selectedViz.id);
    }
  }

  function handleStyleChange(updates: Partial<VisualizationConfig['style']>) {
    if (selectedViz?.id) {
      visualizationStore.updateVisualization(selectedViz.id, {
        style: { ...selectedViz.style, ...updates }
      });
    }
  }

  function handleModesChange(updates: Partial<VisualizationModes>) {
    if (selectedViz?.id) {
      const nextModes = {
        ...selectedViz.modes,
        ...updates
      } as VisualizationModes;
      const nextViz = {
        ...selectedViz,
        modes: nextModes
      } as VisualizationConfig;

      visualizationStore.updateModes(selectedViz.id, updates);

      if (
        selectedViz.mapping.valueColumn &&
        usesBreakClassification(nextViz) &&
        (!selectedViz.classification?.method ||
          !selectedViz.classification?.numClasses)
      ) {
        visualizationStore.updateClassification(selectedViz.id, {
          method: ClassificationMethod.QUANTILES,
          classes: 5,
          numClasses: 5
        });
        computeBreaksForVisualization('modesChange:classes');
      }

      if (
        nextViz.mapping.categoryColumn &&
        usesCategoricalClassification(nextViz)
      ) {
        const vizId = selectedViz.id;
        visualizationStore.updateClassification(vizId, {
          colors: [...DEFAULT_CATEGORICAL_COLORS],
          inverted: false,
          labels: []
        });
        const categoryColumn = nextViz.mapping.categoryColumn;
        const dataset = getSelectedDataset();
        if (categoryColumn && dataset?.tableName) {
          fetchCategoryLabels(vizId, categoryColumn, dataset.tableName);
        }
      }
    }
  }

  function handleSymbolsChange(
    updates: Partial<VisualizationConfig['symbols']>
  ) {
    if (selectedViz?.id) {
      visualizationStore.updateSymbols(selectedViz.id, updates);
    }
  }

  function handleMissingDataChange(updates: Partial<MissingDataConfig>) {
    if (selectedViz?.id) {
      visualizationStore.updateMissingData(selectedViz.id, updates);
    }
  }

  function handleClassificationChange(updates: Partial<ClassificationConfig>) {
    if (selectedViz?.id) {
      visualizationStore.updateClassification(selectedViz.id, updates);
    }
  }

  function handleMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ) {
    if (selectedViz?.id) {
      const previousAutoSubtitle =
        selectedViz.mapping.valueColumn ??
        selectedViz.mapping.sizeColumn ??
        selectedViz.mapping.categoryColumn ??
        selectedViz.mapping.colorColumn ??
        '';

      visualizationStore.updateVisualization(selectedViz.id, {
        mapping: { ...selectedViz.mapping, ...updates }
      });

      const legendItem = getLegendState().items.find(
        (item) => item.variableId === selectedViz.id
      );
      const updatedVisualization = visualizationStore.visualizations.find(
        (item) => item.id === selectedViz.id
      );
      const nextAutoSubtitle =
        updatedVisualization?.mapping.valueColumn ??
        updatedVisualization?.mapping.sizeColumn ??
        updatedVisualization?.mapping.categoryColumn ??
        updatedVisualization?.mapping.colorColumn ??
        '';
      const usesAutomaticSubtitle =
        legendItem?.subtitleMode === 'auto' ||
        (!legendItem?.subtitleMode &&
          (!legendItem?.subtitle ||
            legendItem.subtitle === previousAutoSubtitle));

      if (
        legendItem &&
        updatedVisualization &&
        usesAutomaticSubtitle &&
        legendItem.subtitle !== nextAutoSubtitle
      ) {
        legendActions.updateLegendItem(legendItem.id, {
          subtitle: nextAutoSubtitle,
          subtitleMode: 'auto'
        });
      }

      if (updates.valueColumn) {
        computeBreaksForVisualization('mapping:valueColumn');
      }
      if (updates.categoryColumn) {
        const dataset = datasetsStore.datasets.find(
          (d) => d.id === selectedViz.datasetId
        );
        if (dataset?.tableName) {
          fetchCategoryLabels(
            selectedViz.id,
            updates.categoryColumn,
            dataset.tableName
          );
        }
      }
    }
  }

  function handlePrimitiveVisibilityChange(
    primitive: PrimitiveFilter,
    visible: boolean
  ) {
    if (!selectedViz?.id) {
      return;
    }

    const activeFilters = selectedViz.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
    const isVisible = activeFilters.includes(primitive);
    if (isVisible === visible) {
      return;
    }

    if (!visible) {
      visualizationStore.togglePrimitiveFilter(selectedViz.id, primitive);
      return;
    }

    const nextFilters = [...new Set([...activeFilters, primitive])];

    if (primitive === PrimitiveFilterType.POINT) {
      visualizationStore.updateVisualization(selectedViz.id, {
        primitiveFilters: nextFilters,
        modes: {
          ...selectedViz.modes,
          symbol: SymbolMode.UNIQUE,
          fill: FillMode.UNIQUE,
          proportionalType: ProportionalType.SINGLE
        },
        style: {
          ...selectedViz.style,
          fillColor:
            (selectedViz.style.fillColor as string) ?? DEFAULT_COLORS.fill,
          strokeColor: DEFAULT_COLORS.gray,
          fillOpacity: nextFilters.includes(PrimitiveFilterType.POLYGON)
            ? 0
            : (selectedViz.style.fillOpacity ??
              VISUALIZATION_DEFAULTS.fillOpacity / 100)
        },
        symbols: selectedViz.symbols
          ? {
              ...selectedViz.symbols,
              opacity:
                selectedViz.symbols.opacity ??
                VISUALIZATION_DEFAULTS.symbolOpacity / 100
            }
          : selectedViz.symbols
      });
      return;
    }

    if (primitive === PrimitiveFilterType.POLYGON) {
      visualizationStore.updateVisualization(selectedViz.id, {
        primitiveFilters: nextFilters,
        modes: {
          ...selectedViz.modes,
          fill: FillMode.NONE
        },
        style: {
          ...selectedViz.style,
          fillOpacity: 0,
          strokeColor: DEFAULT_COLORS.gray
        }
      });
      return;
    }

    if (primitive === PrimitiveFilterType.LINE) {
      visualizationStore.updateVisualization(selectedViz.id, {
        primitiveFilters: nextFilters,
        modes: {
          ...selectedViz.modes,
          fill: FillMode.NONE,
          color: ColorMode.UNIQUE,
          thickness: ThicknessMode.UNIQUE
        },
        style: {
          ...selectedViz.style,
          lineColor: DEFAULT_COLORS.gray,
          lineOpacity:
            selectedViz.style.lineOpacity ??
            VISUALIZATION_DEFAULTS.lineOpacity / 100
        }
      });
    }
  }

  function handleAddDataFilter(
    filter: Omit<VizDataFilter, 'id'>,
    primitiveType?: PrimitiveFilter
  ) {
    if (selectedViz?.id) {
      visualizationStore.addDataFilter(selectedViz.id, {
        ...filter,
        primitiveType
      });
    }
  }

  function handleRemoveDataFilter(filterId: string) {
    if (selectedViz?.id) {
      visualizationStore.removeDataFilter(selectedViz.id, filterId);
    }
  }

  function handleClearFilters(primitive: PrimitiveFilter): void {
    for (const filter of getFiltersForPrimitive(primitive)) {
      handleRemoveDataFilter(filter.id);
    }
  }

  function getFiltersForPrimitive(
    primitiveType: PrimitiveFilter
  ): VizDataFilter[] {
    return (selectedViz?.dataFilters ?? []).filter(
      (f) => f.primitiveType === primitiveType
    );
  }

  function handleTextVisibilityChange(visible: boolean) {
    if (!selectedViz?.id) {
      return;
    }

    const currentOpacity = selectedViz.style.textOpacity;
    const nextOpacity =
      visible && (!currentOpacity || currentOpacity <= 0)
        ? 1
        : visible
          ? currentOpacity
          : 0;
    visualizationStore.updateVisualization(selectedViz.id, {
      style: {
        ...selectedViz.style,
        textOpacity: nextOpacity,
        labelOpacity: 0
      }
    });
  }

  $effect(() => {
    // datasetsVersion is read here (tracked) and passed as retryKey so that
    // computeKey changes when a new DuckDB table is registered, bypassing the
    // deduplication guard without writing to lastComputedKey from async code.
    const duckVersion = duckDBOrchestrator.datasetsVersion;
    if (
      !usesCategoricalClassification(selectedViz) &&
      selectedViz?.mapping.valueColumn &&
      selectedViz?.classification?.method &&
      !selectedViz?.classification?.breaks?.length
    ) {
      computeBreaksForVisualization(
        '$effect:missingBreaks',
        String(duckVersion)
      );
    }
  });

  $effect(() => {
    const method = selectedViz?.classification?.method;
    const numClasses = selectedViz?.classification?.numClasses;
    const valueColumn = selectedViz?.mapping.valueColumn;
    if (
      method &&
      numClasses &&
      valueColumn &&
      !usesCategoricalClassification(selectedViz)
    ) {
      computeBreaksForVisualization('$effect:classificationParamsChanged');
    }
  });

  $effect(() => {
    const viz = selectedViz;
    const col = viz?.mapping.categoryColumn;
    const isCategorical = usesCategoricalClassification(viz);
    const hasLabels = (viz?.classification?.labels?.length ?? 0) > 0;
    if (!isCategorical || !col || hasLabels) return;
    const dataset = datasetsStore.datasets.find((d) => d.id === viz!.datasetId);
    if (!dataset?.tableName) return;
    fetchCategoryLabels(viz!.id, col, dataset.tableName, true);
  });

  $effect(() => {
    const cbEnabled = getColorBlindnessState().enabled;
    const paletteId = selectedViz?.classification?.paletteId;
    const inverted = selectedViz?.classification?.inverted ?? false;
    const isCategorical = usesCategoricalClassification(selectedViz);
    const numColors = isCategorical
      ? Math.max(selectedViz?.classification?.labels?.length ?? 0, 0)
      : selectedViz?.classification?.classes;

    untrack(() => {
      const vizId = selectedViz?.id;
      if (!vizId) return;
      const contrast = cbEnabled ? ('high' as const) : undefined;
      let colors: string[];
      if (isCategorical) {
        const resolvedColorCount = Math.max(
          numColors || DEFAULT_CATEGORICAL_COLORS.length,
          1
        );
        if (paletteId) {
          const palette = findPaletteById(paletteId);
          if (!palette) return;
          colors = generatePaletteColors(palette, resolvedColorCount, contrast);
        } else {
          colors = DEFAULT_CATEGORICAL_COLORS.slice(0, resolvedColorCount);
          if (colors.length < resolvedColorCount) {
            const repeats = Array.from(
              { length: resolvedColorCount },
              (_, index) =>
                DEFAULT_CATEGORICAL_COLORS[
                  index % DEFAULT_CATEGORICAL_COLORS.length
                ]
            );
            colors = repeats;
          }
        }
      } else {
        if (!numColors) return;
        if (paletteId) {
          const palette = findPaletteById(paletteId);
          if (!palette) return;
          colors = generatePaletteColors(palette, numColors, contrast);
        } else {
          colors = generateColorsForBreaks(numColors, 'sequential', contrast);
        }
      }
      colors = applyPaletteInversion(colors, inverted);
      const existing = selectedViz?.classification?.colors;
      if (
        existing &&
        existing.length === colors.length &&
        existing.every((c, i) => c === colors[i])
      ) {
        return;
      }
      visualizationStore.updateClassification(vizId, { colors });
    });
  });
</script>

<section id="configure-visualization">
  <MainToolBarHeader
    title={m.step2_title()}
    icon={SettingsAdjust}
    showDivider
  />

  <div class="content-area">
    <p class="kh-help">
      {m.step2_description()}
    </p>
  </div>

  <div class="config-accordion">
    <SymbolsConfig
      dataFields={dataFieldItems}
      visualization={selectedViz}
      disabled={!showsSymbolsConfig}
      filters={getFiltersForPrimitive(PrimitiveFilterType.POINT)}
      onStyleChange={handleStyleChange}
      onModesChange={handleModesChange}
      onSymbolsChange={handleSymbolsChange}
      onMappingChange={handleMappingChange}
      onMissingDataChange={handleMissingDataChange}
      onClassificationChange={handleClassificationChange}
      onInvertPalette={handleInvertPalette}
      onToggleVisibility={(checked) =>
        handlePrimitiveVisibilityChange(PrimitiveFilterType.POINT, checked)}
      onAddFilter={(f) => handleAddDataFilter(f, PrimitiveFilterType.POINT)}
      onRemoveFilter={handleRemoveDataFilter}
      onClearFilters={() => handleClearFilters(PrimitiveFilterType.POINT)}
    />

    <PolygonsConfig
      dataFields={dataFieldItems}
      visualization={selectedViz}
      disabled={!showsPolygonsConfig}
      filters={getFiltersForPrimitive(PrimitiveFilterType.POLYGON)}
      onStyleChange={handleStyleChange}
      onModesChange={handleModesChange}
      onMissingDataChange={handleMissingDataChange}
      onClassificationChange={handleClassificationChange}
      onMappingChange={handleMappingChange}
      onInvertPalette={handleInvertPalette}
      onToggleVisibility={(checked) =>
        handlePrimitiveVisibilityChange(PrimitiveFilterType.POLYGON, checked)}
      onAddFilter={(f) => handleAddDataFilter(f, PrimitiveFilterType.POLYGON)}
      onRemoveFilter={handleRemoveDataFilter}
      onClearFilters={() => handleClearFilters(PrimitiveFilterType.POLYGON)}
    />

    <LinesConfig
      dataFields={dataFieldItems}
      visualization={selectedViz}
      disabled={!showsLinesConfig}
      filters={getFiltersForPrimitive(PrimitiveFilterType.LINE)}
      onStyleChange={handleStyleChange}
      onModesChange={handleModesChange}
      onMissingDataChange={handleMissingDataChange}
      onClassificationChange={handleClassificationChange}
      onMappingChange={handleMappingChange}
      onInvertPalette={handleInvertPalette}
      onToggleVisibility={(checked) =>
        handlePrimitiveVisibilityChange(PrimitiveFilterType.LINE, checked)}
      onAddFilter={(f) => handleAddDataFilter(f, PrimitiveFilterType.LINE)}
      onRemoveFilter={handleRemoveDataFilter}
      onClearFilters={() => handleClearFilters(PrimitiveFilterType.LINE)}
    />

    <TextsConfig
      dataFields={dataFieldItems}
      visualization={selectedViz}
      disabled={!hasGeometry}
      filters={getFiltersForPrimitive(PrimitiveFilterType.TEXT)}
      onStyleChange={handleStyleChange}
      onModesChange={handleModesChange}
      onMissingDataChange={handleMissingDataChange}
      onClassificationChange={handleClassificationChange}
      onMappingChange={handleMappingChange}
      onInvertPalette={handleInvertPalette}
      onToggleVisibility={handleTextVisibilityChange}
      onAddFilter={(f) => handleAddDataFilter(f, PrimitiveFilterType.TEXT)}
      onRemoveFilter={handleRemoveDataFilter}
      onClearFilters={() => handleClearFilters(PrimitiveFilterType.TEXT)}
    />
  </div>
</section>

<style lang="scss">
  #configure-visualization {
    display: flex;
    flex-direction: column;
    padding: 16px 0;
  }

  .content-area {
    padding: 16px 16px 8px 16px;
  }

  .kh-help {
    color: var(--cds-text-helper, #6f6f6f);
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
  }

  .config-accordion {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--cds-border-subtle-01, #c6c6c6);
  }
</style>
