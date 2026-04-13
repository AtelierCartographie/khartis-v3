<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import {
    StylingTools,
    VisualizationTools
  } from '$lib/features/commons/types/global';
  import { m } from '$lib/paraglide/messages';
  import { Close } from 'carbon-icons-svelte';
  import type { Snippet } from 'svelte';
  import { selectTool } from '../tools-list/tool-list.utils.svelte';
  import { getAnnotationsState } from './annotations/annotations.store.svelte';
  import { shouldBlockToolClose } from './tool-close-guard';
  import Annotations from './annotations/annotations.svelte';
  import ColorBlindness from './color-blindness/color-blindness.svelte';
  import Facets from './facets/facets.svelte';
  import Format from './format/format.svelte';
  import GeoIndications from './geo-indications/geo-indications.svelte';
  import Layers from './layers/layers.svelte';
  import Legend from './legend/legend.svelte';
  import Projection from './projections/projection.svelte';
  import Search from './search/search.svelte';
  import Simplification from './simplification/simplification.svelte';

  const toolComponents = {
    [StylingTools.Annotations]: Annotations,
    [StylingTools.Format]: Format,
    [StylingTools.Legend]: Legend,
    [StylingTools.GeoIndications]: GeoIndications,
    [StylingTools.ColorBlindness]: ColorBlindness,
    [VisualizationTools.Search]: Search,
    [VisualizationTools.Layers]: Layers,
    [VisualizationTools.Projection]: Projection,
    [VisualizationTools.Simplification]: Simplification,
    [VisualizationTools.Facets]: Facets
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

  let selectedComponent = $derived<Snippet | undefined>(
    globalState.selectedTool
      ? toolComponents[
          globalState.selectedTool as StylingTools & VisualizationTools
        ]
      : undefined
  );

  let title = $derived<string>(
    titles[globalState.selectedTool as StylingTools & VisualizationTools] || ''
  );

  function handleClose(): void {
    if (
      shouldBlockToolClose(
        globalState.selectedTool,
        getAnnotationsState().isDrawingMode
      )
    ) {
      return;
    }

    selectTool(undefined);
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
    {@render selectedComponent?.()}
  </div>
</aside>

<style>
  .tool-header {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    padding: var(--cds-spacing-03) var(--cds-spacing-02) var(--cds-spacing-03)
      var(--cds-spacing-05);
    position: sticky;
    top: 0;
    background-color: var(--cds-background, white);
    z-index: 2;
  }

  .tool-title {
    flex: 1 0 0;
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.5rem;
    color: var(--cds-text-01, #161616);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  aside {
    position: relative;
  }

  .tool-body {
    padding: 0 var(--cds-spacing-05) var(--cds-spacing-05);
  }

  .tool-body :global(.expandable-stack) {
    margin: 0 calc(-1 * var(--cds-spacing-05));
  }
</style>
