<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { StrokeSection } from '../shared';
  import FillSection from '../shared/fill-section.svelte';
  import { FILL_MODES_STANDARD } from '../shared/fill-mode-presets';
  import {
    FACET_SLOT,
    type FacetSlotPath
  } from '../../adapters/facets-adapter';
  import { FillMode } from '$lib/features/commons/constants/visualization.constants';
  import type {
    ClassificationConfig,
    MissingDataConfig,
    VisualizationConfig,
    VisualizationModes
  } from '$lib/features/commons/stores/visualization.store.svelte';

  interface FieldSelectionWithHandle {
    selectedFieldId: number;
    selectedFieldName: string | undefined;
    handleSelect: (fieldId: number) => void;
  }

  interface FacetsSelectionLike {
    getSelectedFieldIds(slot: FacetSlotPath): number[];
    isActiveForSlot(slot: FacetSlotPath): boolean;
    updateVariables(column: string, slot: FacetSlotPath, ids: number[]): void;
    toggle(column: string, slot: FacetSlotPath, enabled: boolean): void;
  }

  interface Props {
    backgroundVisualization: VisualizationConfig | undefined;
    dataFields: Array<{ id: number; text: string; type?: string }>;
    selectableDataFields: Array<{ id: number; text: string; type?: string }>;
    fillMode: FillMode;
    fillColor: string;
    fillOpacity: number;
    backgroundDiscretizationLabel: string;
    backgroundStrokeDiscretizationLabel: string;
    backgroundValueFieldSelection: FieldSelectionWithHandle;
    backgroundCategoryFieldSelection: FieldSelectionWithHandle;
    backgroundFacetsSelection: FacetsSelectionLike;
    onBackgroundFillModeChange: (index: number) => void;
    onBackgroundFillColorChange: (value: string) => void;
    onBackgroundFillOpacityChange: (value: number) => void;
    onBackgroundClassificationChange?: (
      updates: Partial<ClassificationConfig>
    ) => void;
    onBackgroundInvertPalette?: () => void;
    onBackgroundStrokeInvertPalette?: () => void;
    onBackgroundStyleChange?: (
      updates: Partial<VisualizationConfig['style']>
    ) => void;
    onBackgroundModesChange?: (updates: Partial<VisualizationModes>) => void;
    onBackgroundMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onBackgroundStrokeMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onBackgroundStrokeClassificationChange: (
      updates: Partial<ClassificationConfig>
    ) => void;
    onBackgroundMissingDataChange?: (
      updates: Partial<MissingDataConfig>
    ) => void;
    openBackgroundDiscretization: () => void;
    openBackgroundStrokeDiscretization: () => void;
  }

  let {
    backgroundVisualization,
    dataFields,
    selectableDataFields,
    fillMode,
    fillColor,
    fillOpacity,
    backgroundDiscretizationLabel,
    backgroundStrokeDiscretizationLabel,
    backgroundValueFieldSelection,
    backgroundCategoryFieldSelection,
    backgroundFacetsSelection,
    onBackgroundFillModeChange,
    onBackgroundFillColorChange,
    onBackgroundFillOpacityChange,
    onBackgroundClassificationChange,
    onBackgroundInvertPalette,
    onBackgroundStrokeInvertPalette,
    onBackgroundStyleChange,
    onBackgroundModesChange,
    onBackgroundMappingChange,
    onBackgroundStrokeMappingChange,
    onBackgroundStrokeClassificationChange,
    openBackgroundDiscretization,
    openBackgroundStrokeDiscretization
  }: Props = $props();
</script>

<FillSection
  visualization={backgroundVisualization}
  dataFields={dataFields}
  availableModes={FILL_MODES_STANDARD}
  fillMode={fillMode}
  fillColor={fillColor}
  fillOpacity={fillOpacity}
  selectedValueFieldId={backgroundValueFieldSelection.selectedFieldId}
  selectedCategoryFieldId={backgroundCategoryFieldSelection.selectedFieldId}
  discretizationLabel={backgroundDiscretizationLabel}
  categoryCount={backgroundVisualization?.classification?.labels?.length ?? 0}
  facetsValueSlotPath={FACET_SLOT.TEXT_BACKGROUND_VALUE}
  facetsCategorySlotPath={FACET_SLOT.TEXT_BACKGROUND_CATEGORY}
  categoriesVariant="texts"
  showMissingDataSection={false}
  showOpacityBounds={true}
  opacityInputWidth="64px"
  sectionTitle={m.background()}
  selectableDataFields={selectableDataFields}
  getFacetsSelectedFieldIds={backgroundFacetsSelection.getSelectedFieldIds}
  isFacetsActiveForSlot={backgroundFacetsSelection.isActiveForSlot}
  onFillModeChange={(mode: FillMode) =>
    onBackgroundFillModeChange(FILL_MODES_STANDARD.indexOf(mode))}
  onFillColorChange={onBackgroundFillColorChange}
  onFillOpacityChange={onBackgroundFillOpacityChange}
  onValueFieldSelect={backgroundValueFieldSelection.handleSelect}
  onCategoryFieldSelect={backgroundCategoryFieldSelection.handleSelect}
  onFacetsVariablesChange={backgroundFacetsSelection.updateVariables}
  onFacetsToggle={backgroundFacetsSelection.toggle}
  onOpenDiscretization={openBackgroundDiscretization}
  onClassificationChange={onBackgroundClassificationChange ?? (() => {})}
  onInvertPalette={onBackgroundInvertPalette}
/>

<StrokeSection
  visualization={backgroundVisualization}
  dataFields={dataFields}
  discretizationLabel={backgroundStrokeDiscretizationLabel}
  showDashed={false}
  sliderInputWidth="64px"
  onStyleChange={onBackgroundStyleChange}
  onModesChange={onBackgroundModesChange}
  onMappingChange={onBackgroundMappingChange}
  onStrokeMappingChange={onBackgroundStrokeMappingChange}
  onInvertPalette={onBackgroundStrokeInvertPalette}
  onOpenDiscretization={openBackgroundStrokeDiscretization}
  onStrokeClassificationChange={onBackgroundStrokeClassificationChange}
  strokeClassification={backgroundVisualization?.text?.background
    ?.strokeClassification}
  strokeValueColumn={backgroundVisualization?.text?.background
    ?.strokeValueColumn}
  strokeCategoryColumn={backgroundVisualization?.text?.background
    ?.strokeCategoryColumn}
  facetsValueSlotPath={FACET_SLOT.TEXT_BACKGROUND_STROKE_VALUE}
  facetsCategorySlotPath={FACET_SLOT.TEXT_BACKGROUND_STROKE_CATEGORY}
/>
