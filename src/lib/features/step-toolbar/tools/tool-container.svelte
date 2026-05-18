<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import {
    StylingTools,
    VisualizationTools
  } from '$lib/features/commons/types/global';
  import { m } from '$lib/paraglide/messages';
  import { Close } from 'carbon-icons-svelte';
  import type { Component } from 'svelte';
  import { closeSelectedToolPanel } from '../tools-list/tool-list.utils.svelte';
  import { getAnnotationsState } from './annotations/annotations.store.svelte';
  import { shouldBlockToolClose } from './tool-close-guard';

  type ToolId = StylingTools | VisualizationTools;

  const toolLoaders: Record<ToolId, () => Promise<{ default: Component }>> = {
    [StylingTools.Annotations]: () =>
      import('./annotations/annotations.svelte'),
    [StylingTools.Format]: () => import('./format/format.svelte'),
    [StylingTools.Legend]: () => import('./legend/legend.svelte'),
    [StylingTools.GeoIndications]: () =>
      import('./geo-indications/geo-indications.svelte'),
    [StylingTools.ColorBlindness]: () =>
      import('./color-blindness/color-blindness.svelte'),
    [VisualizationTools.Search]: () => import('./search/search.svelte'),
    [VisualizationTools.Layers]: () => import('./layers/layers.svelte'),
    [VisualizationTools.Projection]: () =>
      import('./projections/projection.svelte'),
    [VisualizationTools.Simplification]: () =>
      import('./simplification/simplification.svelte'),
    [VisualizationTools.Facets]: () => import('./facets/facets.svelte')
  };

  const titles = {
    [StylingTools.Annotations]: m.tool_annotations(),
    [StylingTools.Format]: m.tool_format(),
    [StylingTools.Legend]: m.tool_legend(),
    [StylingTools.GeoIndications]: m.tool_geo_indications(),
    [StylingTools.ColorBlindness]: m.tool_color_blindness(),
    [VisualizationTools.Search]: m.tool_search(),
    [VisualizationTools.Layers]: m.tool_layers(),
    [VisualizationTools.Projection]: m.tool_projection(),
    [VisualizationTools.Simplification]: m.tool_simplification(),
    [VisualizationTools.Facets]: m.tool_facets()
  };

  const loadedTools = $state<Partial<Record<ToolId, Component>>>({});

  function ensureToolLoaded(tool: ToolId): void {
    if (loadedTools[tool]) return;
    void toolLoaders[tool]().then((module) => {
      loadedTools[tool] = module.default;
    });
  }

  $effect(() => {
    const tool = globalState.selectedTool;
    if (tool) {
      ensureToolLoaded(tool as ToolId);
    }
  });

  let SelectedComponent = $derived<Component | undefined>(
    globalState.selectedTool
      ? loadedTools[globalState.selectedTool as ToolId]
      : undefined
  );

  let title = $derived<string>(
    titles[globalState.selectedTool as StylingTools & VisualizationTools] || ''
  );

  function handleClose(): void {
    if (
      shouldBlockToolClose(
        globalState.selectedTool,
        getAnnotationsState().creationMode !== 'idle'
      )
    ) {
      return;
    }

    closeSelectedToolPanel();
  }
</script>

<aside class="tool-container">
  <header class="tool-header">
    <p class="tool-title">{title}</p>

    <IconButton
      kind="ghost"
      size="small"
      iconDescription={m.close()}
      icon={Close}
      onclick={handleClose}
    />
  </header>

  <div class="tool-body">
    {#if SelectedComponent}
      <SelectedComponent />
    {/if}
  </div>
</aside>

<style>
  .tool-container {
    position: relative;
    background-color: var(--cds-background, white);
  }

  .tool-header {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    padding: var(--cds-spacing-05) var(--cds-spacing-02) var(--cds-spacing-04)
      var(--cds-spacing-05);
    position: sticky;
    top: 0;
    box-sizing: border-box;
    width: 100%;
    isolation: isolate;
    background: var(--cds-background, white);
    box-shadow:
      0 1px 0 var(--cds-border-subtle-01, #e0e0e0),
      0 -1px 0 var(--cds-background, white);
    z-index: 4;
  }

  .tool-header::before {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--cds-background, white);
    content: '';
    pointer-events: none;
  }

  .tool-title {
    flex: 1 0 0;
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.25rem;
    color: var(--cds-text-01, #161616);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tool-body {
    background-color: inherit;
    padding: var(--cds-spacing-05);
  }

  .tool-body :global(.expandable-stack) {
    margin: 0 calc(-1 * var(--cds-spacing-05));
  }
</style>
