<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { m } from '$lib/paraglide/messages';
  import {
    Catalog,
    MagicWandFilled,
    SettingsAdjust
  } from 'carbon-icons-svelte';
  import { tick } from 'svelte';
  import {
    getProjectionState,
    projectionActions
  } from './projection.store.svelte';
  import type { ProjectionCodeDiagnosis } from './projection-code.utils';
  import ProjectionCurrent from './projection-current.svelte';
  import ProjectionMain from './projection-main.svelte';
  import ProjectionOther from './projection-other.svelte';
  import ProjectionSettings from './projection-settings.svelte';

  const SETTINGS_SECTION_ID = 'khartis-projection-settings-tool';

  const title = $derived(m.projection_title());

  let settingsOpen = $state(false);

  async function openSettings() {
    settingsOpen = true;
    await tick();
    document
      .getElementById(SETTINGS_SECTION_ID)
      ?.scrollIntoView({ block: 'end' });
  }

  function handleProjectionCodeApply(diagnosis: ProjectionCodeDiagnosis) {
    if (diagnosis.status === 'catalogue-equivalent') {
      projectionActions.setSelected(diagnosis.catalogueId);
      if (diagnosis.longitude !== undefined) {
        projectionActions.setCenter(
          diagnosis.longitude,
          getProjectionState().latitude
        );
      }
      return;
    }

    if (diagnosis.status !== 'valid') {
      return;
    }

    projectionActions.setSelected(diagnosis.projectionId);
    projectionActions.setCustomCode(diagnosis.normalizedCode);
  }

  const DEFAULT_PROJECTION = 'mercator';

  function handleProjectionCodeReset() {
    projectionActions.setCustomCode(null);
    projectionActions.setSelected(DEFAULT_PROJECTION);
  }
</script>

<div id="khartis-projection-tool">
  <ProjectionCurrent onopensettings={openSettings} />

  <div class="expandable-stack">
    <ExpandableSection
      title={title}
      defaultOpen={true}
      titleClass="projection-suggestions-title kh-thinking-text"
      scrollIntoViewOnOpen
    >
      {#snippet icon()}
        <MagicWandFilled size={20} class="kh-thinking-icon" />
      {/snippet}
      <ProjectionMain />
    </ExpandableSection>

    <ExpandableSection title={m.projection_other_title()} scrollIntoViewOnOpen>
      {#snippet icon()}
        <Catalog size={20} />
      {/snippet}

      <ProjectionOther
        onapply={handleProjectionCodeApply}
        onreset={handleProjectionCodeReset}
      />
    </ExpandableSection>

    <ExpandableSection
      title={m.projection_settings_title()}
      open={settingsOpen}
      onToggle={(expanded) => (settingsOpen = expanded)}
      scrollIntoViewOnOpen
    >
      {#snippet icon()}
        <SettingsAdjust size={20} />
      {/snippet}
      <ProjectionSettings />
    </ExpandableSection>
  </div>
</div>

<style lang="scss">
  #khartis-projection-tool {
    --khartis-expandable-section-body-padding: 8px 16px 24px 16px;
  }

  #khartis-projection-tool
    .expandable-stack
    :global(.section-title.projection-suggestions-title) {
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
  }

  #khartis-projection-tool .expandable-stack :global(.section-container) {
    margin-bottom: 0;
  }
</style>
