<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { m } from '$lib/paraglide/messages';
  import {
    Catalog,
    MagicWandFilled,
    SettingsAdjust
  } from 'carbon-icons-svelte';
  import { tick } from 'svelte';
  import { motionDuration } from '$lib/features/commons/utils/step-transition.svelte';
  import { InlineNotification } from 'carbon-components-svelte';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import { osmBasemapStore } from '$lib/features/map';
  import { shouldUseMapLibreInterleaved } from '$lib/features/map/utils/render-engine.utils';
  import {
    getProjectionState,
    projectionActions
  } from './projection.store.svelte';
  import type { ProjectionCodeDiagnosis } from './projection-code.utils';
  import ProjectionCurrent from './projection-current.svelte';
  import ProjectionMain from './projection-main.svelte';
  import ProjectionOther from './projection-other.svelte';
  import ProjectionSettings from './projection-settings.svelte';

  // A reference basemap is drawn in Web Mercator or as a globe only: the
  // catalogue and the settings do not apply to it.
  const isTiledBasemapEnabled = $derived(
    shouldUseMapLibreInterleaved({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive
    })
  );

  const SETTINGS_SECTION_ID = 'khartis-projection-settings-tool';

  const title = $derived(m.projection_title());

  let settingsOpen = $state(false);

  // The section slides open, then its header is brought to the top of the
  // panel's own scroll area: scrollIntoView would also move the floating
  // panel, whose frame does not scroll.
  const SETTINGS_REVEAL_DELAY_MS = 220;

  function findScrollArea(element: HTMLElement): HTMLElement | null {
    let parent = element.parentElement;
    while (parent) {
      const { overflowY } = getComputedStyle(parent);
      if (overflowY === 'auto' || overflowY === 'scroll') return parent;
      parent = parent.parentElement;
    }
    return null;
  }

  async function openSettings() {
    settingsOpen = true;
    await tick();
    setTimeout(() => {
      const section = document
        .getElementById(SETTINGS_SECTION_ID)
        ?.closest<HTMLElement>('.section-container');
      const scrollArea = section ? findScrollArea(section) : null;
      if (!section || !scrollArea) return;
      scrollArea.scrollTop +=
        section.getBoundingClientRect().top -
        scrollArea.getBoundingClientRect().top;
    }, motionDuration(SETTINGS_REVEAL_DELAY_MS));
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

    <ExpandableSection
      title={m.projection_other_title()}
      disabled={isTiledBasemapEnabled}
      disabledReason={m.projection_tiled_settings_unavailable()}
      scrollIntoViewOnOpen
    >
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
      <ProjectionSettings definitionOnly={isTiledBasemapEnabled} />
    </ExpandableSection>

    {#if isTiledBasemapEnabled}
      <div class="kh-notification-stack projection-tiled-notice">
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          subtitle={m.projection_tiled_settings_unavailable()}
        />
      </div>
    {/if}
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

  .projection-tiled-notice {
    padding: var(--kh-gap-inline) var(--kh-pad-panel);
  }

  #khartis-projection-tool .expandable-stack :global(.section-container) {
    margin-bottom: 0;
  }
</style>
