<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { m } from '$lib/paraglide/messages';
  import { FileStorage, MagicWandFilled } from 'carbon-icons-svelte';
  import ProjectionMain from './projection-main.svelte';
  import ProjectionOther from './projection-other.svelte';
  import ProjectionSettings from './projection-settings.svelte';

  const title = m.projection_title();
  let _viewMode = $derived(globalState.projectionViewMode ?? 'list');
</script>

<div id="khartis-projection-tool">
  <div class="expandable-stack">
    <ExpandableSection title={title} defaultOpen={true} on:toggle={() => {}}>
      {#snippet icon()}
        <MagicWandFilled size={20} />
      {/snippet}
      <ProjectionMain />
    </ExpandableSection>

    <ExpandableSection title="Autres projections" on:toggle={() => {}}>
      {#snippet icon()}
        <FileStorage size={20} />
      {/snippet}

      <ProjectionOther />
    </ExpandableSection>

    <ExpandableSection title="Paramètres" on:toggle={() => {}}>
      {#snippet icon()}
        <FileStorage size={20} />
      {/snippet}
      <ProjectionSettings />
    </ExpandableSection>
  </div>
</div>

<style lang="scss">
  #khartis-projection-tool .expandable-stack :global(.section-container) {
    margin-bottom: 0;
  }

  #khartis-projection-tool
    .expandable-stack
    :global(.section-container + .section-container) {
    border-top: 0;
  }
</style>
