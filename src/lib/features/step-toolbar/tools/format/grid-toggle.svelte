<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Column, Grid, Row, Toggle } from 'carbon-components-svelte';
  import { formatState, formatActions } from './format.store.svelte';

  let grid = $state(formatState.gridEnabled);

  $effect(() => formatActions.setGridEnabled(grid));
</script>

<Grid padding noGutter>
  <Row>
    <Column>
      <Toggle
        bind:toggled={grid}
        labelText={m.format_grid()}
        labelA={m.projection_settings_no()}
        labelB={m.projection_settings_yes()}
        size="sm"
      />

      <i class="block mt-3">{m.format_grid_description()}</i>
    </Column>
  </Row>
</Grid>
