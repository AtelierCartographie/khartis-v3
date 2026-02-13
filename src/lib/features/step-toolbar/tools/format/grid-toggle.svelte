<script lang="ts">
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { m } from '$lib/paraglide/messages';
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import { formatActions, getFormatState } from './format.store.svelte';

  const formatState = $derived(getFormatState());

  function handleToggle(next: boolean) {
    if (next !== formatState.gridEnabled) {
      formatActions.toggleGrid();
    }
  }
</script>

<Grid padding noGutter>
  <Row>
    <Column>
      <Switch
        toggled={formatState.gridEnabled}
        labelText={m.format_grid()}
        labelA={m.projection_settings_no()}
        labelB={m.projection_settings_yes()}
        showStateLabel
        onchange={handleToggle}
      />

      <i class="block mt-3">{m.format_grid_description()}</i>
    </Column>
  </Row>
</Grid>
