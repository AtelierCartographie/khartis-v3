<script lang="ts">
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

  let modeIndex = $state(formatState.mode === 'preset' ? 0 : 1);
</script>

<Grid padding noGutter>
  <Row>
    <Column>
      <ToggleTabs
        items={modeItems}
        bind:activeIndex={modeIndex}
        className="format-mode-tabs"
        activeClass="active"
        fullWidthClass="full-width"
        onChange={(index) => {
          modeIndex = index;
          formatActions.setMode(index === 0 ? 'preset' : 'custom');
        }}
      />
    </Column>
  </Row>
</Grid>
