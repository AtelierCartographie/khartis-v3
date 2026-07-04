<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import ProjectionCard from '$lib/features/commons/components/projection-card.svelte';
  import { ViewMode } from '$lib/features/commons/constants/ui.constants';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/stores/global.svelte';
  import type { ProjectionFilterId } from '$lib/features/commons/types/global';
  import SimpleCheckbox from '$lib/features/commons/components/simple-checkbox.svelte';
  import { MAP_PROJECTION_TYPE } from '$lib/features/commons/constants';
  import { getStyleConfig } from '$lib/features/map/constants/carte-facile-layer-groups';
  import { shouldUseMapLibreInterleaved } from '$lib/features/map/utils/render-engine.utils';
  import {
    basemapService,
    mapProjectionStore,
    osmBasemapStore,
    projectionStore as mapRenderProjectionStore
  } from '$lib/features/map';
  import {
    resolveProjectionAvailabilityContext,
    supportsProjectionSuggestions
  } from '$lib/features/map/utils/projection-availability.utils';
  import { m } from '$lib/paraglide/messages';
  import { Grid, List, MagicWandFilled } from 'carbon-icons-svelte';
  import { getNationalProjectionBadge } from './national-region-label';
  import {
    getProjectionState,
    projectionActions
  } from './projection.store.svelte';
  import type { ProjectionSuggestion } from './projection-suggest.service';
  import { getCatalogueProjectionIdForSuggestion } from './projection-suggestion-catalogue.utils';
  import { getThumbnailPaths } from './projection-thumbnail';
  import {
    getThumbnailGeometrySync,
    loadThumbnailGeometry
  } from '$lib/features/commons/utils/projection-thumbnail-geometry';

  type ProjectionShapeFilterId = Exclude<ProjectionFilterId, 'all'>;

  const INITIAL_VISIBLE_SUGGESTIONS = 3;
  const SUGGESTION_INCREMENT = 3;

  const description = $derived(m.projection_description());
  const isTiledBasemapEnabled = $derived(
    shouldUseMapLibreInterleaved({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive
    })
  );
  const tiledZone = $derived(
    getStyleConfig(basemapStyleStore.selectedStyle)?.zone ?? 'monde'
  );
  const isGlobeProjectionEnabled = $derived(mapProjectionStore.isGlobe);

  function handleGlobeProjectionToggle(checked: boolean): void {
    if (!checked || tiledZone !== 'monde') {
      mapProjectionStore.setProjection(MAP_PROJECTION_TYPE.MERCATOR);
      return;
    }

    mapProjectionStore.setProjection(MAP_PROJECTION_TYPE.GLOBE, {
      explicit: true
    });
  }

  let thumbnailGeometry = $state(getThumbnailGeometrySync());

  $effect(() => {
    if (thumbnailGeometry) {
      return;
    }
    let cancelled = false;
    void loadThumbnailGeometry().then((geometry) => {
      if (!cancelled) {
        thumbnailGeometry = geometry;
      }
    });
    return () => {
      cancelled = true;
    };
  });

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
  $effect(() => {
    if (!suggestionCardsEnabled || suggestions !== undefined) {
      return;
    }

    untrack(() => projectionActions.suggestProjectionForCurrentData());
  });
  const suggestionItems = $derived.by(() => {
    if (!suggestions) {
      return [] satisfies ProjectionSuggestion[];
    }

    return [...suggestions.national, ...suggestions.generic];
  });
  const filterOptions = $derived.by(
    (): ReadonlyArray<{
      id: ProjectionFilterId;
      label: string;
    }> => [
      { id: 'all', label: m.projection_filter_all() },
      { id: 'Rectangulaire', label: m.projection_filter_rectangular() },
      { id: 'Arrondie', label: m.projection_filter_rounded() },
      { id: 'Discontinue', label: m.projection_filter_discontinuous() }
    ]
  );
  const projectionGroups = $derived.by(
    (): ReadonlyArray<{
      id: ProjectionShapeFilterId;
      label: string;
      shape: string;
    }> => [
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
    ]
  );
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
  const hasSuggestionItems = $derived(suggestionItems.length > 0);
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
  const unclassifiedGridSuggestions = $derived(
    suggestionItems.filter((suggestion) => !getSuggestionFilterId(suggestion))
  );
  const gridSuggestionGroups = $derived(
    projectionGroups
      .map((group) => ({
        ...group,
        suggestions: suggestionItems.filter(
          (suggestion) => getSuggestionFilterId(suggestion) === group.id
        )
      }))
      .filter((group) => group.suggestions.length > 0)
  );
  const viewMode = $derived(globalState.projectionViewMode ?? ViewMode.LIST);
  function isSuggestionSelected(suggestion: ProjectionSuggestion) {
    if (
      projectionState.overrideActive !== true ||
      projectionState.overrideSource !== 'manual'
    ) {
      return false;
    }

    // When a suggestion is actively applied, match ONLY by its id: distinct
    // suggestions can resolve to an identical d3Config (e.g. transverse CEA and
    // transverse Mercator both → geoTransverseMercator), so a config match would
    // light up several cards at once.
    if (projectionState.activeSuggestionId) {
      return projectionState.activeSuggestionId === suggestion.id;
    }

    if (isStoredSuggestionConfigSelected(suggestion)) {
      return true;
    }

    if (projectionState.customCode || projectionState.suggestionD3Config) {
      return false;
    }

    return (
      getCatalogueProjectionIdForSuggestion(suggestion) ===
      projectionState.selected
    );
  }

  function isStoredSuggestionConfigSelected(
    suggestion: ProjectionSuggestion
  ): boolean {
    if (
      projectionState.customCode &&
      suggestion.proj4String &&
      normalizeProjectionCode(projectionState.customCode) ===
        normalizeProjectionCode(suggestion.proj4String)
    ) {
      return true;
    }

    return areD3ConfigsEqual(
      projectionState.suggestionD3Config,
      suggestion.d3Config
    );
  }

  function normalizeProjectionCode(code: string): string {
    return code.trim().replace(/\s+/g, ' ');
  }

  function areD3ConfigsEqual(
    left: ProjectionSuggestion['d3Config'] | undefined,
    right: ProjectionSuggestion['d3Config'] | undefined
  ): boolean {
    if (!left || !right || left.projection !== right.projection) {
      return false;
    }

    return (
      arraysEqual(left.rotate, right.rotate) &&
      arraysEqual(left.center, right.center) &&
      arraysEqual(left.parallels, right.parallels) &&
      left.snippet === right.snippet
    );
  }

  function arraysEqual(
    left: readonly number[] | undefined,
    right: readonly number[] | undefined
  ): boolean {
    if (!left || !right) {
      return left === right;
    }
    if (left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => value === right[index]);
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
        return m.projection_name_interrupted_mollweide();
      case 'mollweide_2_hemisphere':
        return m.projection_name_mollweide_hemispheres();
      case 'mollweide_ocean':
        return m.projection_name_mollweide_oceans();
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

<div
  class="projection-content"
  class:projection-content--grid={viewMode === ViewMode.GRID}
>
  {#if isTiledBasemapEnabled}
    <div class="tiled-projection-section">
      <span class="tiled-projection-label">{m.map_projection_label()}</span>
      <p class="projection-helper">{m.projection_tiled_helper()}</p>
      {#if tiledZone === 'monde'}
        <SimpleCheckbox
          labelText={m.map_projection_globe()}
          checked={isGlobeProjectionEnabled}
          onchange={handleGlobeProjectionToggle}
        />
      {/if}
    </div>
  {:else}
    <div class="projection-header">
      <p class="projection-helper">{description}</p>

      <div class="projection-buttons">
        <IconButton
          kind="ghost"
          icon={List}
          size="small"
          class={viewMode === ViewMode.LIST
            ? 'projection-view-button projection-view-button--active'
            : 'projection-view-button'}
          iconDescription={m.view_list()}
          isSelected={viewMode === ViewMode.LIST}
          aria-pressed={viewMode === ViewMode.LIST}
          on:click={() => projectionActions.setViewMode(ViewMode.LIST)}
        />

        <IconButton
          kind="ghost"
          icon={Grid}
          size="small"
          class={viewMode === ViewMode.GRID
            ? 'projection-view-button projection-view-button--active'
            : 'projection-view-button'}
          iconDescription={m.view_grid()}
          isSelected={viewMode === ViewMode.GRID}
          aria-pressed={viewMode === ViewMode.GRID}
          on:click={() => projectionActions.setViewMode(ViewMode.GRID)}
        />
      </div>
    </div>

    {#if viewMode === ViewMode.LIST}
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
              previewLabel={m.projection_preview_label()}
              paths={getThumbnailPaths(suggestion, thumbnailGeometry)}
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
    {:else if hasSuggestionItems}
      {#if unclassifiedGridSuggestions.length > 0}
        <div class="projection-grid-featured">
          {#each unclassifiedGridSuggestions as suggestion (suggestion.id)}
            <ProjectionCard
              title={getSuggestionTitle(suggestion)}
              subtitle=""
              tag={getSuggestionTag(suggestion)}
              previewLabel={m.projection_preview_label()}
              paths={getThumbnailPaths(suggestion, thumbnailGeometry)}
              selected={isSuggestionSelected(suggestion)}
              variant="blue"
              equalArea={suggestion.equalArea}
              description={getSuggestionDescription(suggestion)}
              layout="vertical"
              fullWidth
              onclick={() => applySuggestion(suggestion)}
            />
          {/each}
        </div>
      {/if}

      <div class="projection-grid">
        {#each gridSuggestionGroups as group (group.id)}
          <section class="projection-grid-column" aria-label={group.label}>
            <h3>{group.label}</h3>
            <div class="projection-grid-cards">
              {#each group.suggestions as suggestion (suggestion.id)}
                <ProjectionCard
                  title={getSuggestionTitle(suggestion)}
                  subtitle=""
                  tag={getSuggestionTag(suggestion)}
                  previewLabel={m.projection_preview_label()}
                  paths={getThumbnailPaths(suggestion, thumbnailGeometry)}
                  selected={isSuggestionSelected(suggestion)}
                  variant="blue"
                  equalArea={suggestion.equalArea}
                  description={getSuggestionDescription(suggestion)}
                  layout="vertical"
                  fullWidth
                  showTag={false}
                  onclick={() => applySuggestion(suggestion)}
                />
              {/each}
            </div>
          </section>
        {/each}
      </div>
    {:else}
      <div class="projection-empty-state">
        <p class="projection-empty-title">{suggestionEmptyTitle}</p>
        <p class="projection-empty-subtitle">{suggestionEmptySubtitle}</p>
      </div>
    {/if}
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

  .projection-content--grid {
    gap: var(--cds-spacing-05);
  }

  .projection-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--cds-spacing-03);
  }

  .tiled-projection-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .tiled-projection-label {
    color: var(--cds-text-secondary, #525252);
    font-size: var(--cds-label-01-font-size, 0.75rem);
    line-height: var(--cds-label-01-line-height, 1rem);
    letter-spacing: var(--cds-label-01-letter-spacing, 0.32px);
  }

  .tiled-projection-section :global(.kh-checkbox-native) {
    width: fit-content;
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

  .projection-buttons {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 2px;
  }

  .projection-buttons :global(.projection-view-button.bx--btn) {
    width: 32px;
    min-width: 32px;
    height: 32px;
    min-height: 32px;
    padding: 8px;
    color: var(--cds-icon-primary, #161616);
  }

  .projection-buttons
    :global(.projection-view-button.projection-view-button--active.bx--btn) {
    background: var(--cds-background-active, rgba(141, 141, 141, 0.5));
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

  .projection-grid-featured,
  .projection-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(184px, 1fr));
    gap: var(--cds-spacing-05);
    width: 100%;
    align-items: start;
  }

  .projection-grid-featured {
    align-items: stretch;
  }

  .projection-grid-column {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    min-width: 0;
  }

  .projection-grid-column h3 {
    margin: 0;
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1rem;
  }

  .projection-grid-cards {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .projection-grid-featured :global(.projection-card),
  .projection-grid-cards :global(.projection-card) {
    width: 100%;
    min-height: 176px;
  }
</style>
