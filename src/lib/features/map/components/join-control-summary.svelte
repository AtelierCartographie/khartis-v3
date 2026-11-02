<script lang="ts">
  import { untrack } from 'svelte';
  import { Button } from 'carbon-components-svelte';
  import type { JoinTerritoryStatus } from '$lib/features/duckdb';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { dataTabState } from '$lib/features/commons/stores/data-tab.store.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { formatValue } from '$lib/features/commons/utils/format.utils';
  import * as m from '$lib/paraglide/messages';
  import { JOIN_CONTROL_STATUSES } from '../constants/join-control.constants';
  import { joinControlStore } from '../stores/join-control.store.svelte';
  import {
    getJoinControlStatusLabel,
    getJoinControlSwatchBackground
  } from '../utils/join-control.utils';

  const counts = $derived(
    globalState.selectedStep === ToolbarStep.Data &&
      !globalState.isMapExporting &&
      !globalState.isMobileView
      ? joinControlStore.counts
      : null
  );
  const territoryCount = $derived(
    counts
      ? JOIN_CONTROL_STATUSES.reduce((sum, status) => sum + counts[status], 0)
      : 0
  );
  const offMapCount = $derived(
    dataTabState.basemapJoin.unrecognizedTotal +
      dataTabState.basemapJoin.ignoredEntities.length
  );

  $effect(() => {
    if (!counts) {
      untrack(() => joinControlStore.setFocusedStatus(null));
    }
  });

  function toggleFocus(status: JoinTerritoryStatus): void {
    joinControlStore.setFocusedStatus(
      joinControlStore.focusedStatus === status ? null : status
    );
  }
</script>

{#if counts}
  <section class="join-control-summary" aria-label={m.join_control_title()}>
    <p class="summary-title">{m.join_control_title()}</p>
    <p class="summary-subtitle">
      {territoryCount === 1
        ? m.join_control_territories_one()
        : m.join_control_territories({ count: formatValue(territoryCount) })}
    </p>
    <ul class="summary-rows">
      {#each JOIN_CONTROL_STATUSES as status (status)}
        {@const label = getJoinControlStatusLabel(status)}
        <li>
          <Button
            kind="ghost"
            size="small"
            class="summary-row"
            disabled={counts[status] === 0}
            aria-pressed={joinControlStore.focusedStatus === status}
            title={m.join_control_focus({ status: label })}
            on:click={() => toggleFocus(status)}
          >
            <span
              class="summary-swatch"
              style:background={getJoinControlSwatchBackground(status)}
              aria-hidden="true"
            ></span>
            <span class="summary-label">{label}</span>
            <span class="summary-count">{formatValue(counts[status])}</span>
          </Button>
        </li>
      {/each}
    </ul>
    {#if offMapCount > 0}
      <p class="summary-off-map">
        {m.join_control_off_map({ count: formatValue(offMapCount) })}
        <span class="summary-off-map-desc">{m.join_control_off_map_desc()}</span
        >
      </p>
    {/if}
  </section>
{/if}

<style>
  /* A workspace overlay, not a page item: it keeps its size at any page zoom
     and is never exported. */
  .join-control-summary {
    position: absolute;
    top: var(--cds-spacing-05, 1rem);
    left: var(--cds-spacing-05, 1rem);
    z-index: var(--z-toolbar);
    width: 12rem;
    padding: 0.5rem 0.25rem 0.375rem;
    background: var(--cds-layer-01, #ffffff);
    color: var(--cds-text-primary, #161616);
    font-family: var(--kh-font-body, 'IBM Plex Sans', sans-serif);
    font-size: 0.75rem;
    line-height: 1.3;
    box-shadow:
      0 12px 28px rgba(22, 22, 22, 0.09),
      0 2px 8px rgba(22, 22, 22, 0.06);
    pointer-events: auto;
  }

  .summary-title,
  .summary-subtitle,
  .summary-off-map {
    padding: 0 0.5rem;
  }

  .summary-title {
    font-weight: 600;
  }

  .summary-subtitle,
  .summary-off-map {
    color: var(--cds-text-secondary, #525252);
  }

  .summary-subtitle {
    margin-bottom: 0.25rem;
  }

  .summary-rows {
    list-style: none;
  }

  .join-control-summary :global(.summary-row.bx--btn) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    max-width: none;
    min-height: 1.75rem;
    padding: 0.25rem 0.5rem;
    color: var(--cds-text-primary, #161616);
    font-size: 0.75rem;
  }

  .join-control-summary :global(.summary-row.bx--btn[aria-pressed='true']) {
    background: var(--cds-layer-selected-01, #e0e0e0);
    box-shadow: inset 2px 0 0 var(--cds-border-interactive, #0f62fe);
  }

  .join-control-summary :global(.summary-row.bx--btn:disabled) {
    color: var(--cds-text-disabled, #a8a8a8);
  }

  .summary-swatch {
    flex-shrink: 0;
    width: 0.875rem;
    height: 0.875rem;
    box-shadow: inset 0 0 0 1px rgba(22, 22, 22, 0.25);
  }

  .summary-label {
    flex: 1;
    text-align: left;
  }

  .summary-count {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .summary-off-map {
    margin-top: 0.25rem;
    padding-top: 0.25rem;
    border-top: 1px solid var(--cds-border-subtle-01, #e0e0e0);
  }

  .summary-off-map-desc {
    display: block;
    font-size: 0.6875rem;
  }
</style>
