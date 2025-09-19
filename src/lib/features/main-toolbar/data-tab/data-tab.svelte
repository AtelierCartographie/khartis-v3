<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import { Grid } from 'carbon-components-svelte';
  import clsx from 'clsx';
  import BasemapJoinStep from './basemap-join-step.svelte';
  import DataControlStep from './data-control-step.svelte';
  import GeolocationStep from './geolocation-step.svelte';
</script>

<div id="khartis-data-tab">
  <Grid
    noGutter
    fullWidth
    class={clsx(
      globalState.toolbarState === ToolbarState.Collapsed && 'collapsed-content'
    )}
  >
    <DataControlStep />

    <GeolocationStep />

    <BasemapJoinStep />
  </Grid>
</div>

<style>
  #khartis-data-tab :global(.bx--grid) {
    gap: var(--cds-spacing-07);
  }

  #khartis-data-tab :global(.bx--grid) > :global(*) {
    margin-bottom: var(--cds-spacing-07);
  }

  #khartis-data-tab :global(.bx--grid) > :global(*:last-child) {
    margin-bottom: 0;
  }

  :global(.collapsed-content) {
    opacity: 0.7;
    pointer-events: none;
  }
</style>
