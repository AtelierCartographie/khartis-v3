<script lang="ts">
  import { InlineNotification } from 'carbon-components-svelte';
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

  const summary = $derived.by(() => {
    if (!report) return '';
    const shown =
      report.hidden.length === 0
        ? m.hidden_labels_none()
        : (isSingularCount(report.hidden.length)
            ? m.hidden_labels_summary_one
            : m.hidden_labels_summary)({
            hidden: formatValue(report.hidden.length),
            total: formatValue(report.labelCount)
          });
    if (report.overlapping === 0) return shown;
    const overlapping = (
      isSingularCount(report.overlapping)
        ? m.hidden_labels_overlapping_one
        : m.hidden_labels_overlapping
    )({ count: formatValue(report.overlapping) });
    return `${shown} ${overlapping}`;
  });
</script>

{#if report}
  <div class="kh-notification-stack hidden-labels" aria-live="polite">
    <InlineNotification
      kind="info"
      lowContrast
      hideCloseButton
      subtitle={summary}
    />
  </div>
{/if}

<style>
  .hidden-labels :global(.bx--inline-notification) {
    max-width: none;
  }
</style>
