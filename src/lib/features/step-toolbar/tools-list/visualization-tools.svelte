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
        <Button
          tooltipPosition="right"
          kind="ghost"
          iconDescription={m.tool_projection()}
          icon={Earth}
          size="small"
          isSelected={globalState.selectedTool ===
            VisualizationTools.Projection}
          onclick={() => selectTool(VisualizationTools.Projection)}
        />
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
        <Button
          tooltipPosition="right"
          kind="ghost"
          iconDescription={m.tool_facets()}
          icon={GridIcon}
          size="small"
          isSelected={globalState.selectedTool === VisualizationTools.Facets}
          onclick={() => selectTool(VisualizationTools.Facets)}
        />
      </Column>
    </Row>
  </Grid>
</ToolsListContainer>
