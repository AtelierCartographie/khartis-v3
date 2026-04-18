<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import ProjectionCard from '$lib/features/commons/components/projection-card.svelte';
  import { ViewMode } from '$lib/features/commons/constants/ui.constants';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
  import type { ProjectionFilterId } from '$lib/features/commons/types/global';
  import { mapProjectionStore } from '$lib/features/map/stores/map-projection.store.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import {
    getAvailableProjectionIds,
    resolveDisplayedProjectionId,
    resolveProjectionAvailabilityContext,
    supportsProjectionSuggestions
  } from '$lib/features/map/utils/projection-availability';
  import { m } from '$lib/paraglide/messages';
  import { Grid, List, MagicWandFilled } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import { GROUPS, PROJECTIONS } from './data';
  import {
    getProjectionState,
    projectionActions
  } from './projection.store.svelte';
  import type { ProjectionSuggestion } from './projection-suggest.service';
  import { getNationalProjectionBadge } from './national-region-label';

  const description = m.projection_description();

  const projections = PROJECTIONS;

  const projectionState = $derived(getProjectionState());
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
  const suggestionCardsEnabled = $derived(
    supportsProjectionSuggestions(projectionContext)
  );
  const suggestions = $derived(
    suggestionCardsEnabled ? projectionState.suggestions : undefined
  );
  const hasSuggestions = $derived(
    Boolean(
      suggestions &&
      (suggestions.national.length > 0 || suggestions.generic.length > 0)
    )
  );
  const hasCustomProjection = $derived(
    Boolean(projectionState.customCode?.trim())
  );
  const filterOptions: ReadonlyArray<{
    id: ProjectionFilterId;
    label: string;
  }> = [
    { id: 'all', label: m.projection_filter_all() },
    { id: 'Rectangulaire', label: m.projection_filter_rectangular() },
    { id: 'Arrondie', label: m.projection_filter_rounded() },
    { id: 'Discontinue', label: m.projection_filter_discontinuous() }
  ];
  const availableProjectionIds = $derived(
    new Set(
      getAvailableProjectionIds(
        projectionContext,
        projections.map((projection) => projection.projectionId)
      )
    )
  );
  const compatibleProjections = $derived(
    projections.filter((projection) =>
      availableProjectionIds.has(projection.projectionId)
    )
  );
  const availableFilterOptions = $derived(
    filterOptions.filter(
      (option) =>
        option.id === 'all' ||
        compatibleProjections.some((projection) => projection.tag === option.id)
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
  const visibleProjections = $derived(
    compatibleProjections.filter(
      (projection) => activeFilter === 'all' || projection.tag === activeFilter
    )
  );

  const selectedCardId = $derived.by(() => {
    if (hasCustomProjection) {
      return null;
    }

    const selectedProjection = resolveDisplayedProjectionId({
      context: projectionContext,
      selectedProjectionId: projectionState.selected,
      mapProjection: mapProjectionStore.projection
    });
    const matchingCard = projections.find(
      (projection) => projection.projectionId === selectedProjection
    );
    return matchingCard?.id ?? null;
  });

  function selectProjection(projectionId: string) {
    projectionActions.setSelected(projectionId);
  }

  function applySuggestion(suggestion: ProjectionSuggestion) {
    projectionActions.applySuggestion(suggestion);
  }

  function setFilter(id: ProjectionFilterId) {
    globalActions.setProjectionFilter(id);
  }

  let viewMode = $derived(globalState.projectionViewMode ?? ViewMode.LIST);

  const headerClass = $derived(
    clsx('projection-header', 'mt-3', 'color-blue', {
      'mb-5': viewMode === ViewMode.GRID
    })
  );

  const groupLabelByKey = {
    projection_group_rectangular: m.projection_group_rectangular,
    projection_group_rounded: m.projection_group_rounded,
    projection_group_discontinuous: m.projection_group_discontinuous
  } as const;

  const groups = $derived(
    GROUPS.filter((group) =>
      compatibleProjections.some((projection) => projection.tag === group.id)
    ).map((group) => ({
      id: group.id,
      label: groupLabelByKey[group.labelKey]()
    }))
  );
</script>

<div class="projection-content">
  <div class={headerClass}>
    <div><span>{description}</span></div>
    <div class="projection-buttons">
      <IconButton
        kind="ghost"
        icon={List}
        size="small"
        iconDescription={m.view_list()}
        isSelected={viewMode === ViewMode.LIST}
        aria-pressed={viewMode === ViewMode.LIST}
        on:click={() => projectionActions.setViewMode(ViewMode.LIST)}
      />

      <IconButton
        kind="ghost"
        icon={Grid}
        size="small"
        iconDescription={m.view_grid()}
        isSelected={viewMode === ViewMode.GRID}
        aria-pressed={viewMode === ViewMode.GRID}
        on:click={() => projectionActions.setViewMode(ViewMode.GRID)}
      />
    </div>
  </div>

  {#if viewMode === ViewMode.LIST}
    {#if hasSuggestions}
      <div class="suggestions-section">
        {#if suggestions && suggestions.national.length > 0}
          <div class="suggestions-group">
            <div class="suggestions-title">
              {m.projection_suggestions_national()}
            </div>
            <div class="projection-cards">
              {#each suggestions.national as s (s.id)}
                <ProjectionCard
                  title={s.name}
                  subtitle={s.epsg ? `EPSG:${s.epsg}` : ''}
                  tag={getNationalProjectionBadge(
                    s,
                    m.projection_tag_national()
                  )}
                  selected={projectionState.customCode === s.proj4String}
                  variant="blue"
                  equalArea={s.equalArea}
                  onclick={() => applySuggestion(s)}
                />
              {/each}
            </div>
          </div>
        {/if}

        {#if suggestions && suggestions.generic.length > 0}
          <div class="suggestions-group">
            <div class="suggestions-title">
              {m.projection_suggestions_generic()}
            </div>
            <div class="projection-cards">
              {#each suggestions.generic.slice(0, 3) as s (s.id)}
                <ProjectionCard
                  title={s.name}
                  subtitle={s.equalArea
                    ? m.projection_equal_area()
                    : (s.shape ?? '')}
                  tag={s.scale?.[0] ?? ''}
                  selected={false}
                  variant="default"
                  equalArea={s.equalArea}
                  onclick={() => applySuggestion(s)}
                />
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <div class="projection-tags">
      {#each availableFilterOptions as opt (opt.id)}
        <button
          class="projection-tag"
          class:projection-tag--selected={activeFilter === opt.id}
          onclick={() => setFilter(opt.id)}>{opt.label}</button
        >
      {/each}
    </div>

    <div class="projection-cards">
      {#each visibleProjections as p (p.id)}
        <ProjectionCard
          title={p.title}
          subtitle={p.subtitle}
          tag={p.tag}
          ratio={p.ratio}
          previewLabel={p.previewLabel}
          selected={selectedCardId === p.id}
          disabled={p.disabled}
          variant={p.variant}
          equalArea={p.equalArea}
          description={p.description}
          onclick={() => selectProjection(p.projectionId)}
        />
      {/each}
    </div>

    <Button
      kind="tertiary"
      size="small"
      icon={MagicWandFilled}
      class="show-more-btn"
      on:click={() => projectionActions.suggestProjectionForCurrentData()}
      >{m.show_other_suggestions()}</Button
    >
  {:else}
    <div class="projection-scroll-x">
      <div class="projection-grid">
        {#each groups as g (g.id)}
          <div class="grid-col">
            <div class="group-title">{g.label}</div>

            <div class="cards-col">
              {#each compatibleProjections.filter((p) => p.tag === g.id) as p (p.id + '-grid')}
                <ProjectionCard
                  title={p.title}
                  subtitle={p.subtitle}
                  tag={p.tag}
                  ratio={p.ratio}
                  previewLabel={p.previewLabel}
                  selected={selectedCardId === p.id}
                  disabled={p.disabled}
                  variant={p.variant}
                  equalArea={p.equalArea}
                  description={p.description}
                  layout="vertical"
                  fullWidth
                  onclick={() => selectProjection(p.projectionId)}
                />
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style lang="scss">
  .projection-content {
    display: flex;
    flex-direction: column;
    margin-top: var(--cds-spacing-02);
  }

  .projection-header {
    display: flex;
    justify-content: space-between;
  }

  .projection-buttons {
    display: flex;
    align-items: flex-start;
  }

  .suggestions-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    padding-top: var(--cds-spacing-04);
    padding-bottom: var(--cds-spacing-04);
    border-bottom: 1px solid var(--cds-border-subtle-01);
    margin-bottom: var(--cds-spacing-03);
  }

  .suggestions-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .suggestions-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary);
  }

  .projection-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-03);
    padding-top: var(--cds-spacing-05);
    padding-bottom: var(--cds-spacing-05);
  }

  .projection-tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 9px;
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    cursor: pointer;
    border: 1px solid
      var(--khartis-additions-border-tile-01-suggestions, #82cfff);
    background-color: var(--khartis-additions-layer-01-suggestions, #e5f6ff);
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
    transition: background-color 0.1s ease;
  }

  .projection-tag:hover:not(.projection-tag--selected) {
    background-color: var(--cds-medium-blue, #a8e2ff);
  }

  .projection-tag--selected {
    border-color: transparent;
    background-color: var(--khartis-additions-focus-suggestions, #0072c3);
    color: #ffffff;
  }

  .projection-cards {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .projection-content :global(.show-more-btn) {
    width: 100%;
    max-width: 100%;
    margin-top: var(--cds-spacing-05);
  }

  .projection-grid {
    display: flex;
    flex-wrap: nowrap;
    gap: var(--cds-spacing-05);
    width: 100%;
    align-items: stretch;
  }

  .projection-scroll-x {
    overflow-x: hidden;
    overflow-y: hidden;
    padding-bottom: var(--cds-spacing-02);
    width: 100%;
  }

  .grid-col {
    display: flex;
    flex-direction: column;
    flex: 0 0 calc((100% - (2 * var(--cds-spacing-05))) / 3);
    max-width: calc((100% - (2 * var(--cds-spacing-05))) / 3);
    min-width: 0;
  }

  .group-title {
    font-weight: 600;
    margin-bottom: var(--cds-spacing-04);
    color: var(--cds-dark-blue);
  }

  .cards-col {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }
</style>
