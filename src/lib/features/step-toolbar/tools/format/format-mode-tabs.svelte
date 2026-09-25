<script lang="ts">
  import { FormatMode } from '$lib/features/commons/constants/ui.constants';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { m } from '$lib/paraglide/messages';
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import { Document, Edit } from 'carbon-icons-svelte';
  import { formatActions, getFormatState } from './format.store.svelte';

  const formatState = $derived(getFormatState());

  const customLabel = $derived(m.format_custom());

  const modeItems = $derived([
    { icon: Document, label: m.format_predefined(), iconSize: 20 },
    { icon: Edit, label: customLabel, iconSize: 20 }
  ]);

  let modeIndex = $derived(formatState.mode === FormatMode.PRESET ? 0 : 1);
</script>

<div class="format-mode-tabs-container">
  <Grid noGutter>
    <Row>
      <Column>
        <ToggleTabs
          size="md"
          items={modeItems}
          activeIndex={modeIndex}
          className="format-mode-tabs"
          activeClass="active"
          fullWidthClass="full-width"
          onchange={(index) => {
            formatActions.setMode(
              index === 0 ? FormatMode.PRESET : FormatMode.CUSTOM
            );
          }}
        />
      </Column>
    </Row>
  </Grid>
</div>

<style>
  .format-mode-tabs-container :global(.format-mode-tabs) {
    border-color: var(--cds-border-subtle-01);
    border-radius: 4px;
  }

  .format-mode-tabs-container :global(.format-mode-tabs .toggle-tab.active) {
    background-color: var(--cds-border-subtle-01);
  }
</style>
