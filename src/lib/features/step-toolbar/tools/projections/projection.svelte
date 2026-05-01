<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import {
    resolveProjectionAvailabilityContext,
    supportsCustomProjectionCode
  } from '$lib/features/map/utils/projection-availability';
  import { m } from '$lib/paraglide/messages';
  import { InlineNotification } from 'carbon-components-svelte';
  import {
    Catalog,
    MagicWandFilled,
    SettingsAdjust
  } from 'carbon-icons-svelte';
  import { projectionActions } from './projection.store.svelte';
  import { parseProjectionCode } from './projection-code.utils';
  import ProjectionMain from './projection-main.svelte';
  import ProjectionOther from './projection-other.svelte';
  import ProjectionSettings from './projection-settings.svelte';

  const title = m.projection_title();
  const projectionContext = $derived(
    resolveProjectionAvailabilityContext({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive,
      currentStyle: basemapStyleStore.selectedStyle,
      preferredStyle: basemapStyleStore.preferredTiledStyle,
      referenceBasemapId: basemapStyleStore.referenceBasemapId,
      osmBasemapBbox: osmBasemapStore.activeOSMBasemap?.bbox ?? null
    })
  );
  const showOtherProjectionSection = $derived(
    supportsCustomProjectionCode(projectionContext)
  );

  let crsError = $state(false);

  function handleProjectionCodeApply(event: CustomEvent<{ code: string }>) {
    const parsed = parseProjectionCode(event.detail.code);
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
    projectionActions.setCustomCode(null);
    projectionActions.setSelected(DEFAULT_PROJECTION);
  }
</script>

<div id="khartis-projection-tool">
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

    {#if showOtherProjectionSection}
      <ExpandableSection title={m.projection_other_title()}>
        {#snippet icon()}
          <Catalog size={20} />
        {/snippet}

        <ProjectionOther
          on:apply={handleProjectionCodeApply}
          on:reset={handleProjectionCodeReset}
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
    {/if}

    <ExpandableSection title={m.projection_settings_title()}>
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
