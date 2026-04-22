<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { formatActions, getFormatState } from './format.store.svelte';

  const formatState = $derived(getFormatState());

  function handleToggle(checked: boolean): void {
    if (checked !== formatState.gridEnabled) {
      formatActions.toggleGrid();
    }
  }
</script>

<div id="khartis-grid-toggle-tool">
  <Grid noGutter>
    <Row>
      <Column>
        <Switch
          size="sm"
          labelText={m.format_grid()}
          labelA={m.projection_settings_no()}
          labelB={m.projection_settings_yes()}
          showStateLabel
          toggled={formatState.gridEnabled}
          onchange={handleToggle}
        />
        <p class="helper-text">{m.format_grid_description()}</p>
      </Column>
    </Row>
  </Grid>
</div>

<style>
  .helper-text {
    margin-top: var(--cds-spacing-03);
    font-size: var(--cds-helper-text-01-font-size, 0.75rem);
    line-height: var(--cds-helper-text-01-line-height, 1rem);
    color: var(--cds-text-helper, #6f6f6f);
    letter-spacing: var(--cds-helper-text-01-letter-spacing, 0.32px);
  }
</style>
