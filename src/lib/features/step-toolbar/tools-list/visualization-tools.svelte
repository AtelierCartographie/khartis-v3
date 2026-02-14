<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { VisualizationTools } from '$lib/features/commons/types/global';
  import { m } from '$lib/paraglide/messages.js';
  import { Button, Column, Grid, Row } from 'carbon-components-svelte';
  import {
    Earth,
    EdgeNode,
    Grid as GridIcon,
    Layers,
    Search
  } from 'carbon-icons-svelte';
  import { selectTool } from './tool-list.utils.svelte';
  import ToolsListContainer from './tools-list-container.svelte';
  import { STORAGE_KEYS, CSS_CLASSES } from '../step-toolbar.constants';

  let hasOpenedProjectionTool = $state(
    typeof window !== 'undefined' &&
      localStorage.getItem(STORAGE_KEYS.PROJECTION_TOOL_OPENED) ===
        STORAGE_KEYS.STORAGE_VALUE_OPENED
  );
  let hasOpenedFacetsTool = $state(
    typeof window !== 'undefined' &&
      localStorage.getItem(STORAGE_KEYS.FACETS_TOOL_OPENED) ===
        STORAGE_KEYS.STORAGE_VALUE_OPENED
  );

  const showProjectionBadge = $derived(!hasOpenedProjectionTool);
  const showFacetsBadge = $derived(!hasOpenedFacetsTool);

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
    hasOpenedFacetsTool = true;
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
        <Button
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
        <Button
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
          <Button
            tooltipPosition="right"
            kind="ghost"
            iconDescription={m.tool_projection()}
            icon={Earth}
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
        <Button
          tooltipPosition="right"
          kind="ghost"
          iconDescription={m.tool_simplification()}
          icon={EdgeNode}
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
          <Button
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

<style>
  :global(.tool-button-wrapper) {
    position: relative;
    display: inline-block;
  }

  :global(.notification-badge) {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 8px;
    height: 8px;
    background-color: var(--cds-support-error, #da1e28);
    border-radius: 50%;
    pointer-events: none;
  }
</style>
