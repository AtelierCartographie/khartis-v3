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
    resetDragState
  } from './layers.utils.js';
  import SectionHeader from './section-header.svelte';
  import {
    PrimitiveFilterType,
    visualizationStore
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { basemapLayersStore } from '$lib/features/map/stores/basemap-layers.store.svelte';
  import { globalActions } from '$lib/features/commons/store/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';

  const store = layersActions;
  const currentState = $derived(layersState);

  $effect(() => {
    void visualizationStore.version;
    void basemapLayersStore.version;
    store.syncWithVisualizations();
  });

  let layers = $derived(
    currentState.layers.map((l: Layer) => ({
      ...l,
      icon:
        l.id === 'texts'
          ? Txt
          : l.primitive === PrimitiveFilterType.POINT || l.id === 'villes'
            ? Location
            : Earth
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

  const visualizationParentLayers = $derived(
    visualizationLayers.filter((layer) => !layer.isSubLayer)
  );

  const visualizationChildLayersByParent = $derived.by(() => {
    const childrenByParent: Record<string, Layer[]> = {};

    for (const layer of visualizationLayers) {
      if (!layer.isSubLayer || !layer.parentId) continue;

      if (!childrenByParent[layer.parentId]) {
        childrenByParent[layer.parentId] = [];
      }
      childrenByParent[layer.parentId].push(layer);
    }

    for (const parentId of Object.keys(childrenByParent)) {
      childrenByParent[parentId].sort((a, b) => a.order - b.order);
    }

    return childrenByParent;
  });

  const geographicLayers = $derived(filterLayersByType(layers, 'geographic'));

  const visualizationCount = $derived(
    getVisibleLayersCount(visualizationParentLayers)
  );

  const geographicCount = $derived(getVisibleLayersCount(geographicLayers));

  const sortedSections = $derived(
    [...sections].sort((a, b) => a.order - b.order)
  );

  function handleToggleVisibility(layerId: string): void {
    store.toggleLayerVisibility(layerId);
  }

  function handleOpenSettings(layerId: string): void {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== 'visualization') return;

    const targetVisualizationId = layer.isSubLayer ? layer.parentId : layer.id;
    if (!targetVisualizationId) return;

    visualizationStore.selectVisualization(targetVisualizationId);

    globalActions.setNavigationState(ToolbarStep.Visualizations);

    setTimeout(() => {
      const configureSection = document.querySelector(
        '#khartis-viz-tab > div:nth-child(2)'
      );
      configureSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function handleRenameLayer(layerId: string): void {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.isSubLayer) return;

    const newName = prompt(m.layers_rename_prompt(), layer.name);
    if (newName && newName.trim() !== '') {
      store.updateLayer(layerId, { name: newName.trim() });
    }
  }

  function handleDuplicateLayer(layerId: string): void {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.isSubLayer) return;
    store.duplicateLayer(layerId);
  }

  function handleDeleteLayer(layerId: string): void {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.isSubLayer) return;
    if (confirm(m.layers_delete_confirm())) {
      store.removeLayer(layerId);
    }
  }

  function reorderLayers(
    type: LayerType,
    dragIndex: number,
    hoverIndex: number
  ): void {
    store.reorderLayers(type, dragIndex, hoverIndex);
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
    return type === 'visualization'
      ? visualizationParentLayers
      : geographicLayers;
  }

  function getSectionCount(type: LayerType): number {
    return type === 'visualization' ? visualizationCount : geographicCount;
  }

  function getSectionChildLayers(type: LayerType): Record<string, Layer[]> {
    return type === 'visualization' ? visualizationChildLayersByParent : {};
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
          childLayersByParent={getSectionChildLayers(section.type)}
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
