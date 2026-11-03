<script lang="ts">
  import { untrack } from 'svelte';
  import { Button } from 'carbon-components-svelte';
  import {
    CheckmarkFilled,
    Error as NotAllowed,
    ErrorFilled,
    MagicWandFilled,
    WarningAltFilled,
    WarningFilled
  } from 'carbon-icons-svelte';
  import JoinCategoryHeader from '$lib/features/commons/components/join-category-header.svelte';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { dataTabState } from '$lib/features/commons/stores/data-tab.store.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { isSingularCount } from '$lib/features/commons/utils/format.utils';
  import {
    motionDuration,
    PANEL_EASING,
    PANEL_MOTION_MS
  } from '$lib/features/commons/utils/step-transition.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    joinControlStore,
    type JoinPanelCategory
  } from '../stores/join-control.store.svelte';
  import { getJoinControlSwatchBackground } from '../utils/join-control.utils';

  const mapCounts = $derived(
    globalState.selectedStep === ToolbarStep.Data &&
      !globalState.isMapExporting &&
      !globalState.isMobileView
      ? joinControlStore.counts
      : null
  );
  // The panel's own counts, so that both read the same.
  const basemapJoin = $derived(dataTabState.basemapJoin);
  const ignoredCount = $derived(basemapJoin.ignoredEntities.length);
  const activeCategory = $derived(joinControlStore.activeCategory);

  // A window drag resizes the workspace in small steps the box simply
  // follows; a panel width change moves it far enough to glide.
  const SLIDE_MIN_SHIFT_PX = 24;

  let summaryElement = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!mapCounts) {
      untrack(() => joinControlStore.setActiveCategory(null));
    }
  });

  // The side panel snaps to its new width and slides its edge back into
  // place; the box, anchored to the workspace edge, slides with it.
  $effect(() => {
    const element = summaryElement;
    const anchor = element?.parentElement;
    if (!element || !anchor) return;

    let resting = element.getBoundingClientRect();
    let slide: Animation | null = null;
    const observer = new ResizeObserver(() => {
      const shown = element.getBoundingClientRect();
      slide?.cancel();
      const next = element.getBoundingClientRect();
      const dx = resting.left - next.left + (shown.left - next.left);
      const dy = resting.top - next.top + (shown.top - next.top);
      resting = next;
      if (
        Math.max(Math.abs(dx), Math.abs(dy)) < SLIDE_MIN_SHIFT_PX ||
        motionDuration(PANEL_MOTION_MS) === 0
      ) {
        return;
      }
      slide = element.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: PANEL_MOTION_MS, easing: PANEL_EASING }
      );
    });
    observer.observe(anchor);

    return () => {
      observer.disconnect();
      slide?.cancel();
    };
  });

  function openPanelCategory(category: JoinPanelCategory): void {
    joinControlStore.requestPanelCategory(
      category,
      activeCategory !== category
    );
  }

  function toggleNoData(): void {
    joinControlStore.setActiveCategory(
      activeCategory === 'no_data' ? null : 'no_data'
    );
  }
</script>

{#if mapCounts}
  <div class="summary-anchor">
    <section
      bind:this={summaryElement}
      class="join-control-summary"
      aria-label={m.section_join_assisted()}
    >
      <Button
        kind="ghost"
        size="small"
        class="summary-header"
        title={m.join_control_open_section()}
        on:click={() => joinControlStore.requestPanelSection()}
      >
        <span class="summary-title">{m.section_join_assisted()}</span>
        <span class="summary-title-icon" aria-hidden="true">
          <MagicWandFilled size={16} />
        </span>
      </Button>

      <div class="summary-rows">
        <JoinCategoryHeader
          compact
          tone="success"
          icon={CheckmarkFilled}
          count={basemapJoin.joinedEntities}
          label={isSingularCount(basemapJoin.joinedEntities)
            ? m.join_entities_joined_one()
            : m.join_entities_joined()}
          pressed={activeCategory === 'matched'}
          title={m.join_control_open_category()}
          onclick={() => openPanelCategory('matched')}
        />
        <JoinCategoryHeader
          compact
          tone="warning"
          icon={WarningFilled}
          count={basemapJoin.entitiesToVerify}
          label={isSingularCount(basemapJoin.entitiesToVerify)
            ? m.join_entities_to_verify_one()
            : m.join_entities_to_verify()}
          pressed={activeCategory === 'check'}
          title={m.join_control_open_category()}
          onclick={() => openPanelCategory('check')}
        />
        {#if basemapJoin.duplicateTotal > 0}
          <JoinCategoryHeader
            compact
            tone="error"
            icon={WarningAltFilled}
            count={basemapJoin.duplicateTotal}
            label={isSingularCount(basemapJoin.duplicateTotal)
              ? m.join_entities_duplicate_one()
              : m.join_entities_duplicate()}
            pressed={activeCategory === 'duplicate'}
            title={m.join_control_open_category()}
            onclick={() => openPanelCategory('duplicate')}
          />
        {/if}
      </div>

      <p class="summary-caption">{m.join_control_off_map()}</p>
      <div class="summary-rows">
        <JoinCategoryHeader
          compact
          tone="error"
          icon={ErrorFilled}
          count={basemapJoin.unrecognizedTotal}
          label={isSingularCount(basemapJoin.unrecognizedTotal)
            ? m.join_entities_unrecognized_one()
            : m.join_entities_unrecognized()}
          pressed={activeCategory === 'unrecognized'}
          title={m.join_control_open_category()}
          onclick={() => openPanelCategory('unrecognized')}
        />
        {#if ignoredCount > 0}
          <JoinCategoryHeader
            compact
            tone="ignored"
            icon={NotAllowed}
            count={ignoredCount}
            label={isSingularCount(ignoredCount)
              ? m.join_entities_ignored_one()
              : m.join_entities_ignored()}
            pressed={activeCategory === 'ignored'}
            title={m.join_control_open_category()}
            onclick={() => openPanelCategory('ignored')}
          />
        {/if}
      </div>

      <div class="summary-rows summary-rows-separated">
        <JoinCategoryHeader
          compact
          tone="missing"
          swatch={getJoinControlSwatchBackground('no_data')}
          count={mapCounts.no_data}
          label={isSingularCount(mapCounts.no_data)
            ? m.join_entities_no_data_one()
            : m.join_entities_no_data()}
          pressed={activeCategory === 'no_data'}
          title={m.join_control_focus()}
          onclick={toggleNoData}
        />
      </div>
    </section>
  </div>
{/if}

<style>
  /* A workspace overlay, not a page item: it keeps its size at any page zoom
     and is never exported. Below the map tooltip, which may cross it. */
  .summary-anchor {
    position: absolute;
    inset: 0;
    z-index: var(--z-content-raised);
    container-type: inline-size;
    pointer-events: none;
  }

  /* Bottom edge in line with the zoom toolbar's, at the same distance from
     the right edge. */
  .join-control-summary {
    --summary-offset: 24px;
    position: absolute;
    right: var(--summary-offset);
    bottom: var(--summary-offset);
    width: 17rem;
    max-width: calc(100% - 2 * var(--summary-offset));
    padding: 0.5rem 0;
    background: var(--cds-layer-01, #ffffff);
    color: var(--cds-text-primary, #161616);
    font-family: var(--kh-font-body, 'IBM Plex Sans', sans-serif);
    box-shadow:
      0 12px 28px rgba(22, 22, 22, 0.09),
      0 2px 8px rgba(22, 22, 22, 0.06);
    pointer-events: auto;
  }

  /* Too narrow to sit beside the zoom toolbar (two rows high): it rises
     above it. */
  @container (max-width: 42rem) {
    .join-control-summary {
      bottom: calc(
        var(--summary-offset) + 2 * var(--kh-size-md, 2.5rem) + 0.5rem
      );
    }
  }

  .join-control-summary :global(.summary-header.bx--btn) {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.375rem;
    width: 100%;
    max-width: none;
    min-height: 0;
    padding: 0.125rem 0.5rem 0.375rem;
  }

  .summary-title {
    font-size: 0.875rem;
    font-weight: var(--kh-weight-primitive, 600);
    line-height: 1.3;
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
  }

  .summary-title-icon {
    display: flex;
    color: var(--khartis-additions-interactive-suggestions, #0072c3);
  }

  .summary-caption {
    padding: 0.375rem 0.5rem 0.125rem;
    font-size: 0.6875rem;
    line-height: 1.3;
    color: var(--cds-text-secondary, #525252);
  }

  .summary-rows-separated {
    margin-top: 0.375rem;
    padding-top: 0.25rem;
    border-top: 1px solid var(--cds-border-subtle-01, #e0e0e0);
  }
</style>
