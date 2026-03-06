<script lang="ts">
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

<div id="khartis-format-tool" class="format-sections">
  <FormatModeTabs />

  {#if isPreset}
    <ModelSelect />
  {:else}
    <CustomSize />
  {/if}

  <ColorSelector />

  <MarginsEditor />

  <GridToggle />
</div>

<style lang="scss">
  .format-sections {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  #khartis-format-tool :global(.bx--number input[type='number']) {
    min-width: 0 !important;
  }
</style>
