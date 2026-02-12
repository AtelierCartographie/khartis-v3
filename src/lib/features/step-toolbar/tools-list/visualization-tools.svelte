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

  const PROJECTION_BADGE_STORAGE_KEY = 'khartis_projection_tool_opened';
  const FACETS_BADGE_STORAGE_KEY = 'khartis_facets_tool_opened';

  let hasOpenedProjectionTool = $state(
    typeof window !== 'undefined' &&
      localStorage.getItem(PROJECTION_BADGE_STORAGE_KEY) === '1'
  );
  let hasOpenedFacetsTool = $state(
    typeof window !== 'undefined' &&
      localStorage.getItem(FACETS_BADGE_STORAGE_KEY) === '1'
  );

  const showProjectionBadge = $derived(!hasOpenedProjectionTool);
  const showFacetsBadge = $derived(!hasOpenedFacetsTool);

  function handleProjectionClick() {
    hasOpenedProjectionTool = true;
    if (typeof window !== 'undefined') {
      localStorage.setItem(PROJECTION_BADGE_STORAGE_KEY, '1');
    }
    selectTool(VisualizationTools.Projection);
  }

  function handleFacetsClick() {
    hasOpenedFacetsTool = true;
    if (typeof window !== 'undefined') {
      localStorage.setItem(FACETS_BADGE_STORAGE_KEY, '1');
    }
    selectTool(VisualizationTools.Facets);
  }
</script>

<ToolsListContainer>
  <Grid noGutter padding={false} class="tools-grid">
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
        <div class="tool-button-wrapper">
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
            <span class="notification-badge"></span>
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
        <div class="tool-button-wrapper">
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
            <span class="notification-badge"></span>
          {/if}
        </div>
      </Column>
    </Row>
  </Grid>
</ToolsListContainer>

<style>
  .tool-button-wrapper {
    position: relative;
    display: inline-block;
  }

  .notification-badge {
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
