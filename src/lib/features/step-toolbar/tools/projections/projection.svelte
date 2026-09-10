<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { m } from '$lib/paraglide/messages';
  import { InlineNotification } from 'carbon-components-svelte';
  import {
    Catalog,
    MagicWandFilled,
    SettingsAdjust
  } from 'carbon-icons-svelte';
  import { tick } from 'svelte';
  import { projectionActions } from './projection.store.svelte';
  import { parseProjectionCode } from './projection-code.utils';
  import ProjectionCurrent from './projection-current.svelte';
  import ProjectionMain from './projection-main.svelte';
  import ProjectionOther from './projection-other.svelte';
  import ProjectionSettings from './projection-settings.svelte';

  const SETTINGS_SECTION_ID = 'khartis-projection-settings-tool';

  const title = $derived(m.projection_title());

  let crsError = $state(false);
  let settingsOpen = $state(false);

  async function openSettings() {
    settingsOpen = true;
    await tick();
    document
      .getElementById(SETTINGS_SECTION_ID)
      ?.scrollIntoView({ block: 'end' });
  }

  function handleProjectionCodeApply({ code }: { code: string }) {
    const parsed = parseProjectionCode(code);
    if (!parsed) {
      crsError = true;
      return;
    }

    crsError = false;
    projectionActions.setSelected(parsed.projectionId);
    projectionActions.setCustomCode(parsed.normalizedCode);
  }

  const DEFAULT_PROJECTION = 'mercator';

  function handleProjectionCodeReset() {
    crsError = false;
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
      titleClass="projection-suggestions-title"
    >
      {#snippet icon()}
        <MagicWandFilled size={20} />
      {/snippet}
      <ProjectionMain />
    </ExpandableSection>

    <ExpandableSection title={m.projection_other_title()}>
      {#snippet icon()}
        <Catalog size={20} />
      {/snippet}

      <ProjectionOther
        onapply={handleProjectionCodeApply}
        onreset={handleProjectionCodeReset}
      />
      {#if crsError}
        <InlineNotification
          kind="error"
          lowContrast
          title={m.projection_code_helper()}
          on:close={() => (crsError = false)}
        />
      {/if}
    </ExpandableSection>

    <ExpandableSection
      title={m.projection_settings_title()}
      open={settingsOpen}
      onToggle={(expanded) => (settingsOpen = expanded)}
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

  #khartis-projection-tool
    .expandable-stack
    :global(.section-container + .section-container) {
    border-top: 1px solid var(--cds-border-subtle-00, #e0e0e0);
  }
</style>
