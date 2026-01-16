<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import clsx from 'clsx';
  import ChooseVisualization from './choose-visualization.svelte';
  import ConfigureVisualization from './configure-visualization.svelte';
  import CustomizeBasemap from './customize-basemap.svelte';

  let configureSection: HTMLElement | undefined = $state();

  function handleCreateVisualization() {
    if (configureSection) {
      configureSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
</script>

<div
  id="khartis-viz-tab"
  class={clsx(
    globalState.toolbarState === ToolbarState.Collapsed && 'collapsed-content'
  )}
>
  <ChooseVisualization onCreateVisualization={handleCreateVisualization} />

  <div bind:this={configureSection}>
    <ConfigureVisualization />
  </div>

  <CustomizeBasemap />
</div>

<style>
  #khartis-viz-tab {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-06);
    padding-bottom: var(--cds-spacing-06);
  }

  #khartis-viz-tab > :global(section) {
    border-bottom: 1px solid var(--cds-border-subtle);
    padding-bottom: var(--cds-spacing-06);
  }

  #khartis-viz-tab > :global(section:last-of-type) {
    border-bottom: none;
    padding-bottom: 0;
  }

  :global(.collapsed-content) {
    opacity: 0.7;
    pointer-events: none;
  }
</style>
