<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { VisualizationTools } from '$lib/features/commons/types/global';
  import { m } from '$lib/paraglide/messages';
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import {
    Globe,
    Grid as GridIcon,
    Layers,
    Search,
    WatsonHealthScalpelSelect
  } from 'carbon-icons-svelte';
  import { selectTool } from './tool-list.utils.svelte';
  import ToolsListContainer from './tools-list-container.svelte';
  import { STORAGE_KEYS, CSS_CLASSES } from '../step-toolbar.constants';
  import { untrack } from 'svelte';
  import { facetsStore } from '../tools/facets';

  let hasOpenedProjectionTool = $state(
    typeof window !== 'undefined' &&
      localStorage.getItem(STORAGE_KEYS.PROJECTION_TOOL_OPENED) ===
        STORAGE_KEYS.STORAGE_VALUE_OPENED
  );
  let facetsBadgeSeen = $state(
    typeof window !== 'undefined' &&
      localStorage.getItem(STORAGE_KEYS.FACETS_TOOL_OPENED) ===
        STORAGE_KEYS.STORAGE_VALUE_OPENED
  );
  let collectionWasEnabled = $state(facetsStore.enabled);

  $effect(() => {
    const isEnabled = facetsStore.enabled;
    if (isEnabled && !untrack(() => collectionWasEnabled)) {
      facetsBadgeSeen = false;
    }
    collectionWasEnabled = isEnabled;
  });

  const showProjectionBadge = $derived(!hasOpenedProjectionTool);
  const showFacetsBadge = $derived(!facetsBadgeSeen);

  function handleProjectionClick() {
    hasOpenedProjectionTool = true;
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        STORAGE_KEYS.PROJECTION_TOOL_OPENED,
        STORAGE_KEYS.STORAGE_VALUE_OPENED
      );
    }
    selectTool(VisualizationTools.Projection);
  }

  function handleFacetsClick() {
    facetsBadgeSeen = true;
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        STORAGE_KEYS.FACETS_TOOL_OPENED,
        STORAGE_KEYS.STORAGE_VALUE_OPENED
      );
    }
    selectTool(VisualizationTools.Facets);
  }
</script>

<ToolsListContainer>
  <Grid noGutter padding={false} class={CSS_CLASSES.TOOLS_GRID}>
    <Row>
      <Column>
        <IconButton
          kind="ghost"
          iconDescription={m.tool_search()}
          tooltipPosition="right"
          icon={Search}
          size="small"
          isSelected={globalState.selectedTool === VisualizationTools.Search}
          onclick={() => selectTool(VisualizationTools.Search)}
        />
      </Column>
    </Row>

    <Row>
      <Column>
        <IconButton
          tooltipPosition="right"
          kind="ghost"
          iconDescription={m.tool_layers()}
          icon={Layers}
          size="small"
          isSelected={globalState.selectedTool === VisualizationTools.Layers}
          onclick={() => selectTool(VisualizationTools.Layers)}
        />
      </Column>
    </Row>

    <Row>
      <Column>
        <div class={CSS_CLASSES.TOOL_BUTTON_WRAPPER}>
          <IconButton
            tooltipPosition="right"
            kind="ghost"
            iconDescription={m.tool_projection()}
            icon={Globe}
            size="small"
            isSelected={globalState.selectedTool ===
              VisualizationTools.Projection}
            onclick={handleProjectionClick}
          />
          {#if showProjectionBadge}
            <span class={CSS_CLASSES.NOTIFICATION_BADGE}></span>
          {/if}
        </div>
      </Column>
    </Row>

    <Row>
      <Column>
        <IconButton
          tooltipPosition="right"
          kind="ghost"
          iconDescription={m.tool_simplification()}
          icon={WatsonHealthScalpelSelect}
          size="small"
          isSelected={globalState.selectedTool ===
            VisualizationTools.Simplification}
          onclick={() => selectTool(VisualizationTools.Simplification)}
        />
      </Column>
    </Row>

    <Row>
      <Column>
        <div class={CSS_CLASSES.TOOL_BUTTON_WRAPPER}>
          <IconButton
            tooltipPosition="right"
            kind="ghost"
            iconDescription={m.tool_facets()}
            icon={GridIcon}
            size="small"
            isSelected={globalState.selectedTool === VisualizationTools.Facets}
            onclick={handleFacetsClick}
          />
          {#if showFacetsBadge}
            <span class={CSS_CLASSES.NOTIFICATION_BADGE}></span>
          {/if}
        </div>
      </Column>
    </Row>
  </Grid>
</ToolsListContainer>
