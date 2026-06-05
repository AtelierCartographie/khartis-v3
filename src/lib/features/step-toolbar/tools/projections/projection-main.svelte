<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import ProjectionCard from '$lib/features/commons/components/projection-card.svelte';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/stores/global.svelte';
  import type { ProjectionFilterId } from '$lib/features/commons/types/global';
  import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import { projectionStore as mapRenderProjectionStore } from '$lib/features/map/stores/projection.store.svelte';
  import {
    resolveProjectionAvailabilityContext,
    supportsProjectionSuggestions
  } from '$lib/features/map/utils/projection-availability.utils';
  import { m } from '$lib/paraglide/messages';
  import { MagicWandFilled } from 'carbon-icons-svelte';
  import { getNationalProjectionBadge } from './national-region-label';
  import {
    getProjectionState,
    projectionActions
  } from './projection.store.svelte';
  import type { ProjectionSuggestion } from './projection-suggest.service';

  type ProjectionShapeFilterId = Exclude<ProjectionFilterId, 'all'>;

  const INITIAL_VISIBLE_SUGGESTIONS = 3;
  const SUGGESTION_INCREMENT = 3;

  const description = m.projection_description();
  const projectionState = $derived(getProjectionState());
  const projectionContext = $derived(
    resolveProjectionAvailabilityContext({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive,
      currentStyle: basemapStyleStore.selectedStyle,
      preferredStyle: basemapStyleStore.preferredTiledStyle,
      referenceBasemapId: basemapStyleStore.referenceBasemapId,
      referenceProjectionPresetId: basemapStyleStore.referenceBasemapId
        ? (basemapService.currentMetadata?.proj_to?.preset ?? null)
        : null,
      osmBasemapBbox: osmBasemapStore.activeOSMBasemap?.bbox ?? null,
      projectionBbox: mapRenderProjectionStore.isProjectedCoordinates
        ? null
        : mapRenderProjectionStore.referenceBbox,
      projectionPresets: basemapService.projectionPresets
    })
  );
  const suggestionCardsEnabled = $derived(
    supportsProjectionSuggestions(projectionContext)
  );
  const suggestions = $derived(projectionState.suggestions);
  const suggestionItems = $derived.by(() => {
    if (!suggestions) {
      return [] satisfies ProjectionSuggestion[];
    }

    return [...suggestions.national, ...suggestions.generic];
  });
  const filterOptions: ReadonlyArray<{
    id: ProjectionFilterId;
    label: string;
  }> = [
    { id: 'all', label: m.projection_filter_all() },
    { id: 'Rectangulaire', label: m.projection_filter_rectangular() },
    { id: 'Arrondie', label: m.projection_filter_rounded() },
    { id: 'Discontinue', label: m.projection_filter_discontinuous() }
  ];
  const projectionGroups: ReadonlyArray<{
    id: ProjectionShapeFilterId;
    label: string;
    shape: string;
  }> = [
    {
      id: 'Rectangulaire',
      label: m.projection_group_rectangular(),
      shape: 'rectangular'
    },
    {
      id: 'Arrondie',
      label: m.projection_group_rounded(),
      shape: 'round'
    },
    {
      id: 'Discontinue',
      label: m.projection_group_discontinuous(),
      shape: 'discontinuous'
    }
  ];
  const availableFilterOptions = $derived(
    filterOptions.filter(
      (option) =>
        option.id === 'all' ||
        suggestionItems.some(
          (suggestion) => getSuggestionFilterId(suggestion) === option.id
        )
    )
  );
  const activeFilter = $derived.by(() => {
    const requestedFilter = globalState.projectionFilter ?? 'all';
    return availableFilterOptions.some(
      (option) => option.id === requestedFilter
    )
      ? requestedFilter
      : 'all';
  });
  const filteredListSuggestions = $derived(
    suggestionItems.filter(
      (suggestion) =>
        activeFilter === 'all' ||
        getSuggestionFilterId(suggestion) === activeFilter
    )
  );
  const suggestionResetSignature = $derived(
    `${activeFilter}:${suggestionItems
      .map((suggestion) => suggestion.id)
      .join('|')}`
  );
  let suggestionLimitState = $state({
    signature: '',
    limit: INITIAL_VISIBLE_SUGGESTIONS
  });
  const visibleSuggestionLimit = $derived(
    suggestionLimitState.signature === suggestionResetSignature
      ? suggestionLimitState.limit
      : INITIAL_VISIBLE_SUGGESTIONS
  );
  const visibleListSuggestions = $derived(
    filteredListSuggestions.slice(0, visibleSuggestionLimit)
  );
  const hasMoreListSuggestions = $derived(
    filteredListSuggestions.length > visibleSuggestionLimit
  );
  const suggestionEmptyTitle = $derived(
    suggestionCardsEnabled
      ? m.projection_suggestions_empty_title()
      : m.projection_suggestions_unavailable_title()
  );
  const suggestionEmptySubtitle = $derived(
    suggestionCardsEnabled
      ? m.projection_suggestions_empty_subtitle()
      : m.projection_suggestions_unavailable_subtitle()
  );
  function isSuggestionSelected(suggestion: ProjectionSuggestion) {
    return (
      projectionState.overrideActive === true &&
      projectionState.overrideSource === 'manual' &&
      projectionState.activeSuggestionId === suggestion.id
    );
  }

  function applySuggestion(suggestion: ProjectionSuggestion) {
    projectionActions.applySuggestion(suggestion);
  }

  function setFilter(id: ProjectionFilterId) {
    globalActions.setProjectionFilter(id);
  }

  function showMoreSuggestions() {
    suggestionLimitState = {
      signature: suggestionResetSignature,
      limit: Math.min(
        visibleSuggestionLimit + SUGGESTION_INCREMENT,
        filteredListSuggestions.length
      )
    };
  }

  function getSuggestionFilterId(
    suggestion: ProjectionSuggestion
  ): ProjectionShapeFilterId | undefined {
    switch (suggestion.shape) {
      case 'rectangular':
        return 'Rectangulaire';
      case 'round':
        return 'Arrondie';
      case 'discontinuous':
        return 'Discontinue';
      default:
        return undefined;
    }
  }

  function getSuggestionTag(suggestion: ProjectionSuggestion): string {
    if (suggestion.type === 'national') {
      return getNationalProjectionBadge(
        suggestion,
        m.projection_tag_national()
      );
    }

    const filterId = getSuggestionFilterId(suggestion);
    return (
      projectionGroups.find((group) => group.id === filterId)?.label ??
      suggestion.shape ??
      ''
    );
  }

  function getSuggestionTitle(suggestion: ProjectionSuggestion): string {
    switch (suggestion.id.toLowerCase()) {
      case 'peters':
        return m.projection_name_gall_peters();
      case 'equalearth':
        return m.projection_name_equal_earth();
      case 'equirectangular':
        return m.projection_name_equirectangular();
      case 'mercator':
        return m.projection_name_mercator();
      case 'atlantis':
        return m.projection_name_atlantis();
      case 'bonne':
        return m.projection_name_bonne();
      case 'armadillo':
        return m.projection_name_armadillo();
      case 'bertin1953':
        return m.projection_name_bertin_1953();
      case 'mollweide_interrupted':
      case 'mollweide_2_hemisphere':
      case 'mollweide_ocean':
        return m.projection_name_interrupted_mollweide();
      case 'laea':
        return m.projection_name_azimuthal_equal_area();
      default:
        return suggestion.name;
    }
  }

  function getSuggestionDescription(suggestion: ProjectionSuggestion): string {
    if (suggestion.type === 'national' && suggestion.epsg) {
      return `${m.projection_tag_national()} · EPSG:${suggestion.epsg}`;
    }

    return description;
  }
</script>

<div class="projection-content">
  <div class="projection-header">
    <p class="projection-helper">{description}</p>
  </div>

  <div class="projection-tags">
    {#each availableFilterOptions as opt (opt.id)}
      <button
        type="button"
        class="projection-tag"
        class:projection-tag--selected={activeFilter === opt.id}
        onclick={() => setFilter(opt.id)}>{opt.label}</button
      >
    {/each}
  </div>

  {#if filteredListSuggestions.length > 0}
    <div class="projection-cards">
      {#each visibleListSuggestions as suggestion (suggestion.id)}
        <ProjectionCard
          title={getSuggestionTitle(suggestion)}
          subtitle=""
          tag={getSuggestionTag(suggestion)}
          ratio="1:1"
          previewLabel={m.projection_preview_label()}
          selected={isSuggestionSelected(suggestion)}
          variant="blue"
          equalArea={suggestion.equalArea}
          description={getSuggestionDescription(suggestion)}
          onclick={() => applySuggestion(suggestion)}
        />
      {/each}
    </div>
  {:else}
    <div class="projection-empty-state">
      <p class="projection-empty-title">{suggestionEmptyTitle}</p>
      <p class="projection-empty-subtitle">{suggestionEmptySubtitle}</p>
    </div>
  {/if}

  {#if hasMoreListSuggestions}
    <Button
      kind="tertiary"
      size="small"
      icon={MagicWandFilled}
      class="show-more-btn"
      disabled={!suggestionCardsEnabled}
      on:click={showMoreSuggestions}>{m.show_other_suggestions()}</Button
    >
  {/if}
</div>

<style lang="scss">
  .projection-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    width: 100%;
    min-width: 0;
  }

  .projection-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--cds-spacing-03);
  }

  .projection-helper {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    color: var(--khartis-additions-text-helper-suggestions, #0072c3);
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
  }

  .projection-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .projection-tag {
    display: inline-flex;
    align-items: center;
    padding: 1px 8px;
    border-radius: 9px;
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    cursor: pointer;
    border: 1px solid
      var(--khartis-additions-border-inverse-suggestions, #82cfff);
    background-color: var(--khartis-additions-layer-01-suggestions, #e5f6ff);
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
  }

  .projection-tag:hover:not(.projection-tag--selected) {
    background-color: var(
      --khartis-additions-layer-hover-01-suggestions,
      #cceeff
    );
  }

  .projection-tag--selected {
    border-color: transparent;
    background-color: var(--khartis-additions-focus-suggestions, #0072c3);
    color: var(--khartis-additions-text-inverse-suggestions, #ffffff);
  }

  .projection-cards {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    width: 100%;
    align-items: stretch;
  }

  .projection-content :global(.show-more-btn) {
    width: 100%;
    max-width: 100%;
    min-height: 40px;
    margin-top: 0;
  }

  .projection-empty-state {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
    padding: var(--cds-spacing-05);
    border: 1px solid
      var(--khartis-additions-border-tile-01-suggestions, #82cfff);
    background: var(--khartis-additions-layer-01-suggestions, #e5f6ff);
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
  }

  .projection-empty-title,
  .projection-empty-subtitle {
    margin: 0;
  }

  .projection-empty-title {
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.125rem;
  }

  .projection-empty-subtitle {
    font-size: 0.75rem;
    line-height: 1rem;
  }
</style>
