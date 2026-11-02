<script lang="ts">
  import {
    formatValue,
    isSingularCount
  } from '$lib/features/commons/utils/format.utils';
  import { hiddenLabelsStore } from '$lib/features/map';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    vizId: string;
  }

  const { vizId }: Props = $props();

  const report = $derived(hiddenLabelsStore.getReport(vizId));
</script>

{#if report}
  <div class="hidden-labels" aria-live="polite">
    <p class="hidden-labels__summary">
      {#if report.hidden.length === 0}
        {m.hidden_labels_none()}
      {:else}
        {(isSingularCount(report.hidden.length)
          ? m.hidden_labels_summary_one
          : m.hidden_labels_summary)({
          hidden: formatValue(report.hidden.length),
          total: formatValue(report.labelCount)
        })}
      {/if}
    </p>
    {#if report.overlapping > 0}
      <p class="hidden-labels__summary">
        {(isSingularCount(report.overlapping)
          ? m.hidden_labels_overlapping_one
          : m.hidden_labels_overlapping)({
          count: formatValue(report.overlapping)
        })}
      </p>
    {/if}
  </div>
{/if}

<style>
  .hidden-labels {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-label);
  }

  .hidden-labels__summary {
    font-size: var(--cds-helper-text-01-font-size, 0.75rem);
    color: var(--cds-text-secondary);
  }
</style>
