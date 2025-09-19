<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Column, Grid, Row, Toggle } from 'carbon-components-svelte';
  import { formatActions, getFormatState } from './format.store.svelte';

  const formatState = $derived(getFormatState());

  let grid = $state(false);

  $effect(() => {
    grid = formatState.gridEnabled;
  });

  function handleToggle() {
    formatActions.toggleGrid();
  }
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
        on:toggle={handleToggle}
      />

      <i class="block mt-3">{m.format_grid_description()}</i>
    </Column>
  </Row>
</Grid>
