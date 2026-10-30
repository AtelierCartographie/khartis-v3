<script lang="ts">
  import PanelHeader from '$lib/features/commons/components/panel-header.svelte';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import {
    StylingTools,
    VisualizationTools
  } from '$lib/features/commons/types/global';
  import { scrollShadows } from '$lib/features/commons/utils/scroll-shadows';
  import { m } from '$lib/paraglide/messages';
  import type { Component } from 'svelte';
  import { closeSelectedToolPanel } from '../tools-list/tool-list.utils.svelte';
  import Annotations from './annotations/annotations.svelte';
  import { getAnnotationsState } from './annotations/annotations.store.svelte';
  import ColorBlindness from './color-blindness/color-blindness.svelte';
  import Facets from './facets/facets.svelte';
  import Format from './format/format.svelte';
  import GeoIndications from './geo-indications/geo-indications.svelte';
  import Layers from './layers/layers.svelte';
  import Legend from './legend/legend.svelte';
  import Projection from './projections/projection.svelte';
  import Search from './search/search.svelte';
  import Simplification from './simplification/simplification.svelte';
  import { shouldBlockToolClose } from './tool-close-guard';

  type ToolId = StylingTools | VisualizationTools;

  const toolComponents: Record<ToolId, Component> = {
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

  const titles = $derived.by(() => ({
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
  }));

  let SelectedComponent = $derived<Component | undefined>(
    globalState.selectedTool
      ? toolComponents[globalState.selectedTool as ToolId]
      : undefined
  );

  let title = $derived<string>(
    titles[globalState.selectedTool as StylingTools & VisualizationTools] || ''
  );

  const NOTIFICATION_SELECTOR = '.bx--inline-notification';

  let toolBody = $state<HTMLDivElement | null>(null);

  // A notification added below the fold would go unnoticed. Bring each new
  // one fully into view.
  $effect(() => {
    if (!toolBody) return;

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const notification = node.matches(NOTIFICATION_SELECTOR)
            ? node
            : node.querySelector(NOTIFICATION_SELECTOR);
          notification?.scrollIntoView({ block: 'nearest' });
        }
      }
    });
    observer.observe(toolBody, { childList: true, subtree: true });
    return () => observer.disconnect();
  });

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
  <PanelHeader title={title} closeLabel={m.close()} onclose={handleClose} />

  <div class="kh-scroll-area">
    <div class="tool-body" bind:this={toolBody} use:scrollShadows>
      <div class="tool-content">
        {#if SelectedComponent}
          <SelectedComponent />
        {/if}
      </div>
    </div>
  </div>
</aside>

<style>
  /* Only the body scrolls: the title and the close button stay in view. */
  .tool-container {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    background-color: var(--cds-background, white);
  }

  .tool-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    background-color: inherit;
  }

  /* Padding on the scroller would keep sticky section headers below its
     top edge, with content showing above them. */
  .tool-content {
    padding: var(--cds-spacing-05);
  }

  /* Carbon gives inline notifications an 18rem minimum width, wider than a
     panel section once its padding is taken off. */
  .tool-body :global(.bx--inline-notification) {
    min-width: 0;
    max-width: 100%;
  }

  .tool-body :global(.expandable-stack) {
    margin: 0 calc(-1 * var(--cds-spacing-05));
    border-bottom: 1px solid var(--cds-border-subtle-00, #e0e0e0);
  }
</style>
