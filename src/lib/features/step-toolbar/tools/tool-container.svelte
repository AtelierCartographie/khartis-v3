<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import {
    StylingTools,
    VisualizationTools
  } from '$lib/features/commons/types/global';
  import { m } from '$lib/paraglide/messages';
  import { Button } from 'carbon-components-svelte';
  import { Close } from 'carbon-icons-svelte';
  import type { Snippet } from 'svelte';
  import { selectTool } from '../tools-list/tool-list.utils.svelte';
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
</script>

<aside class="tool-container">
  <header class="tool-header">
    <p class="tool-title">{title}</p>

    <Button
      kind="ghost"
      size="small"
      iconDescription={m.close()}
      icon={Close}
      on:click={() => selectTool(undefined)}
    />
  </header>

  {@render selectedComponent?.()}
</aside>

<style>
  .tool-header {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    padding-bottom: var(--cds-spacing-03);
    padding-left: var(--cds-spacing-05);
    padding-right: var(--cds-spacing-02);
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
</style>
