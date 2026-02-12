<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { m } from '$lib/paraglide/messages';
  import { FileStorage, MagicWandFilled } from 'carbon-icons-svelte';
  import { projectionActions } from './projection.store.svelte';
  import { parseProjectionCode } from './projection-code.utils';
  import ProjectionMain from './projection-main.svelte';
  import ProjectionOther from './projection-other.svelte';
  import ProjectionSettings from './projection-settings.svelte';

  const title = m.projection_title();

  function handleProjectionCodeApply(event: CustomEvent<{ code: string }>) {
    const parsed = parseProjectionCode(event.detail.code);
    if (!parsed) {
      return;
    }

    projectionActions.setCustomCode(parsed.normalizedCode);
    projectionActions.setSelected(parsed.projectionId);
  }

  const DEFAULT_PROJECTION = 'mercator';

  function handleProjectionCodeReset() {
    projectionActions.setCustomCode(null);
    projectionActions.setSelected(DEFAULT_PROJECTION);
  }
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

      <ProjectionOther
        on:apply={handleProjectionCodeApply}
        on:reset={handleProjectionCodeReset}
      />
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
