<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { formatActions, getFormatState } from './format.store.svelte';
  import {
    getShortcut,
    splitShortcutKeys
  } from '$lib/features/commons/utils/keyboard-shortcuts.utils';

  const gridShortcut = getShortcut('toggleGrid');

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
        <p class="helper-text shortcut-hint">
          {m.format_grid_shortcut()}
          <span class="shortcut-keys">
            {#each splitShortcutKeys(gridShortcut) as key (key)}<kbd>
                {key}
              </kbd>{/each}
          </span>
        </p>
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

  .shortcut-hint {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .shortcut-keys kbd {
    box-sizing: border-box;
    min-width: 1.125rem;
    height: 1.125rem;
    padding: 0 0.25rem;
    border: 1px solid currentColor;
    border-radius: 0.1875rem;
    font-family: inherit;
    font-size: 0.6875rem;
    line-height: 1rem;
    text-align: center;
  }
</style>
