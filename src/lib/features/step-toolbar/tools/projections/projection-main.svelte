<script lang="ts">
  import ProjectionCard from '$lib/features/commons/components/projection-card.svelte';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
  import type { ProjectionFilterId } from '$lib/features/commons/types/global';
  import { m } from '$lib/paraglide/messages';
  import { Button, Tag } from 'carbon-components-svelte';
  import { Grid, List } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import { GROUPS, PROJECTIONS } from './data';
  import { projectionActions } from './projection.store.svelte';

  const description = m.projection_description();

  const projections = PROJECTIONS;

  let selectedId = $state<string>(projections[0].id);

  const filterOptions: ReadonlyArray<{
    id: ProjectionFilterId;
    label: string;
  }> = [
    { id: 'all', label: m.projection_filter_all() },
    { id: 'Rectangulaire', label: m.projection_filter_rectangular() },
    { id: 'Arrondie', label: m.projection_filter_rounded() },
    { id: 'Discontinue', label: m.projection_filter_discontinuous() }
  ];

  const activeFilter = $derived(globalState.projectionFilter ?? 'all');
  const visibleProjections = $derived(
    PROJECTIONS.filter((p) => activeFilter === 'all' || p.tag === activeFilter)
  );

  function selectProjection(id: string) {
    selectedId = id;
  }

  function setFilter(id: ProjectionFilterId) {
    globalActions.setProjectionFilter(id);
  }

  let viewMode = $derived(globalState.projectionViewMode ?? 'list');

  const headerClass = $derived(
    clsx('projection-header', 'mt-3', 'color-blue', {
      'mb-5': viewMode === 'grid'
    })
  );

  const groupLabelByKey = {
    projection_group_rectangular: m.projection_group_rectangular,
    projection_group_rounded: m.projection_group_rounded,
    projection_group_discontinuous: m.projection_group_discontinuous
  } as const;

  const groups = GROUPS.map((g) => ({
    id: g.id,
    label: groupLabelByKey[g.labelKey]()
  }));
</script>

<div class="projection-content">
  <div class={headerClass}>
    <div><span>{description}</span></div>
    <div class="projection-buttons">
      <Button
        kind="ghost"
        icon={List}
        size="small"
        iconDescription={m.view_list()}
        isSelected={viewMode === 'list'}
        aria-pressed={viewMode === 'list'}
        on:click={() => projectionActions.setViewMode('list')}
      />

      <Button
        kind="ghost"
        icon={Grid}
        size="small"
        iconDescription={m.view_grid()}
        isSelected={viewMode === 'grid'}
        aria-pressed={viewMode === 'grid'}
        on:click={() => projectionActions.setViewMode('grid')}
      />
    </div>
  </div>

  {#if viewMode === 'list'}
    <div class="projection-tags">
      {#each filterOptions as opt (opt.id)}
        <Tag
          on:click={() => setFilter(opt.id)}
          type={activeFilter === opt.id ? 'blue' : undefined}>{opt.label}</Tag
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
          selected={selectedId === p.id}
          disabled={p.disabled}
          variant={p.variant}
          onclick={() => selectProjection(p.id)}
        />
      {/each}
    </div>
  {:else}
    <div class="projection-scroll-x">
      <div class="projection-grid">
        {#each groups as g (g.id)}
          <div class="grid-col">
            <div class="group-title">{g.label}</div>

            <div class="cards-col">
              {#each projections.filter((p) => p.tag === g.id) as p (p.id + '-grid')}
                <ProjectionCard
                  title={p.title}
                  subtitle={p.subtitle}
                  tag={p.tag}
                  ratio={p.ratio}
                  previewLabel={p.previewLabel}
                  selected={selectedId === p.id}
                  disabled={p.disabled}
                  variant={p.variant}
                  layout="vertical"
                  fullWidth
                  onclick={() => selectProjection(p.id)}
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

  .projection-tags {
    padding-top: var(--cds-spacing-05);
    padding-bottom: var(--cds-spacing-05);
  }

  .projection-cards {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
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
