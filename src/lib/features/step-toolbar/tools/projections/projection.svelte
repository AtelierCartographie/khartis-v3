<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { m } from '$lib/paraglide/messages';
  import { FileStorage, MagicWandFilled } from 'carbon-icons-svelte';
  import ProjectionMain from './projection-main.svelte';
  import ProjectionOther from './projection-other.svelte';
  import ProjectionSettings from './projection-settings.svelte';

  const title = m.projection_title();
</script>

<div id="khartis-projection-tool">
  <div class="expandable-stack">
    <ExpandableSection title={title} defaultOpen={true}>
      {#snippet icon()}
        <MagicWandFilled size={20} />
      {/snippet}
      <ProjectionMain />
    </ExpandableSection>

    <ExpandableSection title={m.projection_other_title()}>
      {#snippet icon()}
        <FileStorage size={20} />
      {/snippet}

      <ProjectionOther />
    </ExpandableSection>

    <ExpandableSection title={m.projection_settings_title()}>
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
