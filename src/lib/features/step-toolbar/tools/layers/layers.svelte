<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import { Earth, Location, Txt } from 'carbon-icons-svelte';
  import LayersList from './layers-list.svelte';
  import { DEFAULT_SECTIONS } from './layers.constants.js';
  import { layersActions, layersState } from './layers.store.svelte';
  import type { DragState, Layer, LayerType } from './layers.types.js';
  import {
    filterLayersByType,
    getVisibleLayersCount,
    reorderLayersArray,
    resetDragState,
    toggleLayerVisibility
  } from './layers.utils.js';
  import SectionHeader from './section-header.svelte';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import { globalActions } from '$lib/features/commons/store/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';

  const store = layersActions;
  const currentState = $derived(layersState);

  let layers = $derived(
    currentState.layers.map((l: Layer) => ({
      ...l,
      icon: l.id === 'texts' ? Txt : l.id === 'symbols' ? Location : Earth
    }))
  );

  let sections = $state([...DEFAULT_SECTIONS]);

  let expandedById = $state({} as Record<string, boolean>);

  $effect(() => {
    for (const s of sections) {
      if (expandedById[s.id] === undefined) {
        expandedById[s.id] = s.order === 0;
      }
    }
  });

  function toggleSection(id: string): void {
    expandedById[id] = !expandedById[id];
  }

  let sectionDragState: DragState = $state({
    dragIndex: null,
    dragOverIndex: null
  });

  const visualizationLayers = $derived(
    filterLayersByType(layers, 'visualization')
  );

  const geographicLayers = $derived(filterLayersByType(layers, 'geographic'));

  const visualizationCount = $derived(
    getVisibleLayersCount(visualizationLayers)
  );

  const geographicCount = $derived(getVisibleLayersCount(geographicLayers));

  const sortedSections = $derived(
    [...sections].sort((a, b) => a.order - b.order)
  );

  function handleToggleVisibility(layerId: string): void {
    toggleLayerVisibility(layers, layerId);
    store.toggleLayerVisibility(layerId);
  }

  function handleOpenSettings(layerId: string): void {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== 'visualization') return;

    // For visualization layers, the layer ID matches the visualization ID
    visualizationStore.selectVisualization(layerId);

    // Navigate to Visualizations tab
    globalActions.setNavigationState(ToolbarStep.Visualizations);

    // Scroll to configure section after navigation
    setTimeout(() => {
      const configureSection = document.querySelector(
        '#khartis-viz-tab > div:nth-child(2)'
      );
      configureSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function handleRenameLayer(layerId: string): void {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return;

    const newName = prompt(m.layers_rename_prompt(), layer.name);
    if (newName && newName.trim() !== '') {
      store.updateLayer(layerId, { name: newName.trim() });
    }
  }

  function handleDuplicateLayer(layerId: string): void {
    store.duplicateLayer(layerId);
  }

  function handleDeleteLayer(layerId: string): void {
    if (confirm(m.layers_delete_confirm())) {
      store.removeLayer(layerId);
    }
  }

  function reorderLayers(
    type: LayerType,
    dragIndex: number,
    hoverIndex: number
  ): void {
    layers = reorderLayersArray(layers, type, dragIndex, hoverIndex);
    store.reorderLayers(dragIndex, hoverIndex);
  }

  function reorderVisualizationLayers(
    dragIndex: number,
    hoverIndex: number
  ): void {
    reorderLayers('visualization', dragIndex, hoverIndex);
  }

  function reorderGeographicLayers(
    dragIndex: number,
    hoverIndex: number
  ): void {
    reorderLayers('geographic', dragIndex, hoverIndex);
  }

  function handleSectionDragStart(index: number): void {
    sectionDragState.dragIndex = index;
  }

  function handleSectionDragOver(index: number): void {
    sectionDragState.dragOverIndex = index;
  }

  function handleSectionDragEnd(): void {
    const { dragIndex, dragOverIndex } = sectionDragState;

    if (
      dragIndex !== null &&
      dragOverIndex !== null &&
      dragIndex !== dragOverIndex
    ) {
      const sortedSectionsArray = [...sortedSections];
      const draggedSection = sortedSectionsArray[dragIndex];

      sortedSectionsArray.splice(dragIndex, 1);
      sortedSectionsArray.splice(dragOverIndex, 0, draggedSection);

      sortedSectionsArray.forEach((section, index) => {
        section.order = index;
      });
    }

    resetDragState((state: DragState) => (sectionDragState = state));
  }

  function handleSectionDragLeave(): void {
    sectionDragState.dragOverIndex = null;
  }

  function getSectionLayers(type: LayerType): Layer[] {
    return type === 'visualization' ? visualizationLayers : geographicLayers;
  }

  function getSectionCount(type: LayerType): number {
    return type === 'visualization' ? visualizationCount : geographicCount;
  }

  function getReorderFunction(
    type: LayerType
  ): (dragIndex: number, hoverIndex: number) => void {
    return type === 'visualization'
      ? reorderVisualizationLayers
      : reorderGeographicLayers;
  }
</script>

<div id="khartis-layers-tool">
  <Grid noGutter fullWidth>
    <Row>
      <Column>
        <p class="description">{m.layers_description()}</p>
      </Column>
    </Row>
  </Grid>

  {#each sortedSections as section, index (section.id)}
    <div class="section-wrapper">
      <SectionHeader
        title={section.title}
        count={getSectionCount(section.type)}
        sectionIndex={index}
        isDraggable={true}
        isSectionDragging={sectionDragState.dragIndex === index}
        isSectionDragOver={sectionDragState.dragOverIndex === index}
        onSectionDragStart={handleSectionDragStart}
        onSectionDragOver={handleSectionDragOver}
        onSectionDragEnd={handleSectionDragEnd}
        onSectionDragLeave={handleSectionDragLeave}
        expanded={expandedById[section.id]}
        onToggleExpand={() => toggleSection(section.id)}
      />

      {#if expandedById[section.id]}
        <LayersList
          layers={getSectionLayers(section.type)}
          isSubSection={true}
          onToggleVisibility={handleToggleVisibility}
          onOpenSettings={handleOpenSettings}
          onRenameLayer={handleRenameLayer}
          onDuplicateLayer={handleDuplicateLayer}
          onDeleteLayer={handleDeleteLayer}
          onReorderLayer={getReorderFunction(section.type)}
        />
      {/if}
    </div>
  {/each}
</div>

<style>
  .description {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    margin-bottom: var(--cds-spacing-05);
    line-height: 1.4;
  }

  .section-wrapper {
    margin-bottom: var(--cds-spacing-05);
  }
</style>
