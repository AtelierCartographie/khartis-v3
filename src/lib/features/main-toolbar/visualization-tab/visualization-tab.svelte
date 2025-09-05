<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import { Grid } from 'carbon-components-svelte';
  import clsx from 'clsx';
  import Actions from './actions.svelte';
  import ChooseVisualization from './choose-visualization.svelte';
  import ConfigureVisualization from './configure-visualization.svelte';
  import CustomizeBasemap from './customize-basemap.svelte';
</script>

<div id="khartis-viz-tab">
  <Grid
    noGutter
    fullWidth
    class={clsx(
      globalState.toolbarState === ToolbarState.Collapsed && 'collapsed-content'
    )}
  >
    <ChooseVisualization />

    <ConfigureVisualization />

    <CustomizeBasemap />

    <Actions />
  </Grid>
</div>

<style>
  :global(.collapsed-content) {
    opacity: 0.7;
    pointer-events: none;
  }
</style>
