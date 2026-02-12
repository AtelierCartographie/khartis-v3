<script lang="ts">
  import { Grid } from 'carbon-components-svelte';
  import { formatState } from './format.store.svelte';
  import ColorSelector from './color-selector.svelte';
  import CustomSize from './custom-size.svelte';
  import FormatModeTabs from './format-mode-tabs.svelte';
  import GridToggle from './grid-toggle.svelte';
  import MarginsEditor from './margins-editor.svelte';
  import ModelSelect from './model-select.svelte';

  const PRESET_MODE = 'preset';

  const isPreset = $derived(formatState.mode === PRESET_MODE);
</script>

<div id="khartis-format-tool">
  <Grid noGutter fullWidth>
    <FormatModeTabs />

    {#if isPreset}
      <ModelSelect />
    {:else}
      <CustomSize />
    {/if}

    <ColorSelector />

    <MarginsEditor />

    <GridToggle />
  </Grid>
</div>

<style lang="scss">
  #khartis-format-tool :global(.bx--number input[type='number']) {
    min-width: 0 !important;
  }
</style>
