<script lang="ts">
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
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
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
  const hasMapRows = $derived(
    basemapJoin.joinedEntities > 0 ||
      basemapJoin.entitiesToVerify > 0 ||
      basemapJoin.duplicateTotal > 0 ||
      ignoredCount > 0
  );

  // A window drag resizes the workspace in small steps the box simply
  // follows; a panel width change moves it far enough to glide.
  const SLIDE_MIN_SHIFT_PX = 24;
  // Appears with the join as the panel scrolls down to it.
  const revealProgress = $derived(
    joinControlStore.getRevealProgress(datasetsStore.selectedDatasetId ?? '')
  );

  let summaryElement = $state<HTMLElement | null>(null);

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
    joinControlStore.requestPanelCategory(category, true);
  }
</script>

{#if mapCounts}
  <div class="summary-anchor">
    <section
      bind:this={summaryElement}
      style:opacity={revealProgress}
      style:translate={revealProgress < 1
        ? `0 ${(1 - revealProgress) * 12}px`
        : undefined}
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

      {#if hasMapRows}
        <div class="summary-rows">
          {#if basemapJoin.joinedEntities > 0}
            <JoinCategoryHeader
              compact
              tone="success"
              legend={getJoinControlSwatchBackground('matched')}
              icon={CheckmarkFilled}
              count={basemapJoin.joinedEntities}
              label={isSingularCount(basemapJoin.joinedEntities)
                ? m.join_entities_joined_one()
                : m.join_entities_joined()}
              title={m.join_control_open_category()}
              onclick={() => openPanelCategory('matched')}
            />
          {/if}
          {#if basemapJoin.entitiesToVerify > 0}
            <JoinCategoryHeader
              compact
              tone="warning"
              legend={getJoinControlSwatchBackground('check')}
              icon={WarningFilled}
              count={basemapJoin.entitiesToVerify}
              label={isSingularCount(basemapJoin.entitiesToVerify)
                ? m.join_entities_to_verify_one()
                : m.join_entities_to_verify()}
              title={m.join_control_open_category()}
              onclick={() => openPanelCategory('check')}
            />
          {/if}
          {#if basemapJoin.duplicateTotal > 0}
            <JoinCategoryHeader
              compact
              tone="error"
              legend={getJoinControlSwatchBackground('duplicate')}
              icon={WarningAltFilled}
              count={basemapJoin.duplicateTotal}
              label={isSingularCount(basemapJoin.duplicateTotal)
                ? m.join_entities_duplicate_one()
                : m.join_entities_duplicate()}
              title={m.join_control_open_category()}
              onclick={() => openPanelCategory('duplicate')}
            />
          {/if}
          {#if ignoredCount > 0}
            <JoinCategoryHeader
              compact
              tone="ignored"
              legend={getJoinControlSwatchBackground('ignored')}
              icon={NotAllowed}
              count={ignoredCount}
              label={isSingularCount(ignoredCount)
                ? m.join_entities_ignored_one()
                : m.join_entities_ignored()}
              title={m.join_control_open_category()}
              onclick={() => openPanelCategory('ignored')}
            />
          {/if}
        </div>
      {/if}

      {#if basemapJoin.unrecognizedTotal > 0}
        <p class="summary-caption">{m.join_control_off_map()}</p>
        <div class="summary-rows">
          <JoinCategoryHeader
            compact
            tone="error"
            legend={null}
            icon={ErrorFilled}
            count={basemapJoin.unrecognizedTotal}
            label={isSingularCount(basemapJoin.unrecognizedTotal)
              ? m.join_entities_unrecognized_one()
              : m.join_entities_unrecognized()}
            title={m.join_control_open_category()}
            onclick={() => openPanelCategory('unrecognized')}
          />
        </div>
      {/if}

      {#if mapCounts.no_data > 0}
        <div class="summary-rows summary-rows-separated">
          <JoinCategoryHeader
            compact
            muted
            tone="missing"
            legend={getJoinControlSwatchBackground('no_data')}
            count={mapCounts.no_data}
            label={isSingularCount(mapCounts.no_data)
              ? m.join_entities_no_data_one()
              : m.join_entities_no_data()}
          />
        </div>
      {/if}
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

  .join-control-summary :global(.summary-header.bx--btn:hover),
  .join-control-summary :global(.summary-header.bx--btn:active) {
    background: none;
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

  .summary-rows ~ .summary-rows-separated {
    margin-top: 0.375rem;
    padding-top: 0.25rem;
    border-top: 1px solid var(--cds-border-subtle-01, #e0e0e0);
  }
</style>
