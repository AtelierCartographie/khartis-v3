<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { StylingTools } from '$lib/features/commons/types/global';
  import { m } from '$lib/paraglide/messages.js';
  import { Button, Column, Grid, Row } from 'carbon-components-svelte';
  import { Edit, Legend, Location, TextFont, View } from 'carbon-icons-svelte';
  import { selectTool } from './tool-list.utils.svelte';
  import ToolsListContainer from './tools-list-container.svelte';
</script>

<ToolsListContainer>
  <Grid noGutter padding={false} class="tools-grid">
    <Row>
      <Column>
        <Button
          tooltipPosition="right"
          kind="ghost"
          iconDescription={m.tool_format()}
          icon={TextFont}
          size="small"
          isSelected={globalState.selectedTool === StylingTools.Format}
          onclick={() => selectTool(StylingTools.Format)}
        />
      </Column>
    </Row>

    <Row>
      <Column>
        <Button
          tooltipPosition="right"
          kind="ghost"
          iconDescription={m.tool_legend()}
          icon={Legend}
          size="small"
          isSelected={globalState.selectedTool === StylingTools.Legend}
          onclick={() => selectTool(StylingTools.Legend)}
        />
      </Column>
    </Row>

    <Row>
      <Column>
        <Button
          tooltipPosition="right"
          kind="ghost"
          iconDescription={m.tool_geo_indications()}
          icon={Location}
          size="small"
          isSelected={globalState.selectedTool === StylingTools.GeoIndications}
          onclick={() => selectTool(StylingTools.GeoIndications)}
        />
      </Column>
    </Row>

    <Row>
      <Column>
        <Button
          tooltipPosition="right"
          kind="ghost"
          iconDescription={m.tool_annotations()}
          icon={Edit}
          size="small"
          isSelected={globalState.selectedTool === StylingTools.Annotations}
          onclick={() => selectTool(StylingTools.Annotations)}
        />
      </Column>
    </Row>

    <Row>
      <Column>
        <Button
          tooltipPosition="right"
          kind="ghost"
          iconDescription={m.tool_color_blindness()}
          icon={View}
          size="small"
          isSelected={globalState.selectedTool === StylingTools.ColorBlindness}
          onclick={() => selectTool(StylingTools.ColorBlindness)}
        />
      </Column>
    </Row>
  </Grid>
</ToolsListContainer>
